#!/usr/bin/env python3
"""
arduino_mcp.py — FastMCP server that wraps arduino-cli for OpenClaw / pi-openclaw-mcp-stack.

Exposes tools:
  - list_connected_boards       List all connected Arduino-compatible boards
  - list_boards                 List all installed board FQBNs
  - install_core                Install an arduino-cli board core/platform
  - install_zip_library         Install a .zip library (removes old version first)
  - remove_library              Remove an installed library by name
  - generate_ei_sketch          Write a ready-to-compile EI inference .ino from template
  - compile_sketch              Compile a sketch directory
  - upload_sketch               Upload compiled sketch to a board
  - read_serial                 Read N lines from serial port (for inference output)
  - run_full_pipeline           Convenience: compile + upload + read serial in one call

Run:
  python3 arduino_mcp.py          (stdio transport, used by OpenClaw MCP)
  python3 arduino_mcp.py --debug  (verbose logging)

Add to OpenClaw:
  openclaw mcp add arduino -- python3 /path/to/scripts/arduino_mcp.py
"""

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import serial  # pyserial
from fastmcp import FastMCP

# ── FastMCP server ────────────────────────────────────────────────────────────
mcp = FastMCP(
    name="arduino",
)

ARDUINO_CLI = shutil.which("arduino-cli") or "arduino-cli"


def _run(cmd: list[str], timeout: int = 120) -> dict:
    """Run a subprocess, return {returncode, stdout, stderr}."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except subprocess.TimeoutExpired:
        return {"returncode": -1, "stdout": "", "stderr": f"Timeout after {timeout}s"}
    except FileNotFoundError:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": f"arduino-cli not found at '{ARDUINO_CLI}'. Install it first.",
        }


# ── Tools ─────────────────────────────────────────────────────────────────────


@mcp.tool()
def list_connected_boards() -> dict:
    """
    List all Arduino-compatible boards currently connected over USB.
    Returns a list of {port, fqbn, board_name} dicts.
    """
    r = _run([ARDUINO_CLI, "board", "list", "--format", "json"])
    if r["returncode"] != 0:
        return {"error": r["stderr"], "boards": []}
    try:
        data = json.loads(r["stdout"])
        boards = []
        for entry in data.get("detected_ports", []):
            matching = entry.get("matching_boards", [])
            port = entry.get("port", {}).get("address", "")
            protocol = entry.get("port", {}).get("protocol", "")
            if matching:
                for b in matching:
                    boards.append({
                        "port": port,
                        "protocol": protocol,
                        "fqbn": b.get("fqbn", ""),
                        "board_name": b.get("name", ""),
                    })
            else:
                boards.append({"port": port, "protocol": protocol, "fqbn": "", "board_name": "unknown"})
        return {"boards": boards}
    except json.JSONDecodeError:
        return {"error": "Failed to parse arduino-cli output", "raw": r["stdout"]}


@mcp.tool()
def list_boards(platform_filter: str = "") -> dict:
    """
    List all installed board platforms and their FQBNs.
    Optionally filter by platform string (e.g. 'arduino:mbed_nano').
    """
    r = _run([ARDUINO_CLI, "board", "listall", "--format", "json"])
    if r["returncode"] != 0:
        return {"error": r["stderr"]}
    try:
        data = json.loads(r["stdout"])
        boards = data.get("boards", [])
        if platform_filter:
            boards = [b for b in boards if platform_filter.lower() in b.get("fqbn", "").lower()]
        return {"boards": [{"name": b.get("name"), "fqbn": b.get("fqbn")} for b in boards]}
    except json.JSONDecodeError:
        return {"error": "Failed to parse output", "raw": r["stdout"]}


@mcp.tool()
def install_core(platform: str) -> dict:
    """
    Install an arduino-cli board core/platform.
    Example platform strings:
      'arduino:mbed_nano'      — Nano 33 BLE family
      'arduino:mbed_portenta'  — Portenta H7
      'esp32:esp32'            — ESP32 family (needs board manager URL)
    """
    r = _run([ARDUINO_CLI, "core", "install", platform, "--format", "json"], timeout=300)
    return {"returncode": r["returncode"], "output": r["stdout"] or r["stderr"]}


@mcp.tool()
def install_zip_library(zip_path: str) -> dict:
    """
    Install an Arduino .zip library.
    If a library with the same name is already installed, it will be removed first.

    Args:
        zip_path: Absolute path to the .zip file on the Pi.

    Returns:
        { library_name, install_path } on success, or { error } on failure.
    """
    zip_path = Path(zip_path).expanduser().resolve()
    if not zip_path.exists():
        return {"error": f"File not found: {zip_path}"}
    if zip_path.stat().st_size < 1024:
        return {"error": f"ZIP seems too small ({zip_path.stat().st_size} bytes) — download may have failed"}

    # Detect library name from ZIP root folder
    try:
        with zipfile.ZipFile(zip_path) as z:
            # Root folder name is the library name
            root_names = {p.split("/")[0] for p in z.namelist() if "/" in p}
            if not root_names:
                return {"error": "ZIP has no root folder — invalid library structure"}
            lib_name = sorted(root_names)[0]
    except zipfile.BadZipFile as e:
        return {"error": f"Bad ZIP file: {e}"}

    # Remove old version if present
    _run([ARDUINO_CLI, "lib", "uninstall", lib_name])

    # Install fresh
    r = _run([ARDUINO_CLI, "lib", "install", "--zip-path", str(zip_path)])
    if r["returncode"] != 0:
        return {"error": r["stderr"], "library_name": lib_name}

    # Find install path
    r2 = _run([ARDUINO_CLI, "lib", "list", "--format", "json"])
    install_path = ""
    try:
        for entry in json.loads(r2["stdout"]).get("installed_libraries", []):
            if entry.get("library", {}).get("name", "") == lib_name:
                install_path = entry.get("library", {}).get("install_dir", "")
                break
    except Exception:
        pass

    return {"library_name": lib_name, "install_path": install_path}


@mcp.tool()
def remove_library(name: str) -> dict:
    """
    Remove an installed Arduino library by name.
    Useful when 'Multiple libraries were found' compile errors occur.
    """
    r = _run([ARDUINO_CLI, "lib", "uninstall", name])
    return {"returncode": r["returncode"], "output": r["stdout"] or r["stderr"]}


@mcp.tool()
def generate_ei_sketch(
    library_name: str,
    board_fqbn: str,
    sketch_dir: str,
    serial_baud: int = 115200,
) -> dict:
    """
    Generate a minimal Edge Impulse inference sketch.
    The sketch #includes the library, calls run_classifier() in loop(),
    and prints label:confidence over Serial.

    Args:
        library_name: Name returned by install_zip_library (e.g. 'my-project_inferencing').
        board_fqbn:   Target board FQBN (e.g. 'arduino:mbed_nano:nano33ble').
        sketch_dir:   Directory where the .ino will be created (created if missing).
        serial_baud:  Baud rate for Serial.begin(). Default 115200.

    Returns:
        { sketch_path } on success.
    """
    sketch_dir = Path(sketch_dir).expanduser().resolve()
    sketch_dir.mkdir(parents=True, exist_ok=True)
    sketch_name = sketch_dir.name
    sketch_file = sketch_dir / f"{sketch_name}.ino"

    # Detect sensor type from library name heuristics
    is_image = any(k in library_name.lower() for k in ("image", "vision", "camera", "fomo", "yolo"))
    is_audio = any(k in library_name.lower() for k in ("audio", "sound", "keyword", "kws", "voice"))
    is_imu = any(k in library_name.lower() for k in ("motion", "imu", "accel", "gesture", "movement"))

    if is_image:
        sensor_section = _image_sensor_section()
    elif is_audio:
        sensor_section = _audio_sensor_section()
    else:
        # Default: IMU / generic float array
        sensor_section = _imu_sensor_section()

    sketch_content = f"""/* Auto-generated by ei-arduino-skill
 * Edge Impulse inference sketch
 * Library : {library_name}
 * Board   : {board_fqbn}
 * Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}
 *
 * This sketch runs your impulse in a continuous loop and prints
 * classification results over Serial at {serial_baud} baud.
 */

#include <{library_name}.h>

// ── Forward declarations ──────────────────────────────────────────────────────
{sensor_section["forward_declarations"]}

void setup() {{
    Serial.begin({serial_baud});
    while (!Serial);
    Serial.println("Edge Impulse Inference — starting");
{sensor_section["setup_body"]}
}}

void loop() {{
    ei_impulse_result_t result;
    signal_t signal;

{sensor_section["loop_fill_signal"]}

    EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
    if (err != EI_IMPULSE_OK) {{
        Serial.print("ERR: run_classifier returned ");
        Serial.println(err);
        return;
    }}

    // Print results
    for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {{
        Serial.print(result.classification[i].label);
        Serial.print(": ");
        Serial.println(result.classification[i].value, 4);
    }}
#if EI_CLASSIFIER_HAS_ANOMALY == 1
    Serial.print("anomaly score: ");
    Serial.println(result.anomaly, 4);
#endif
    Serial.println("---");
    delay(200);
}}

{sensor_section["helpers"]}
"""

    sketch_file.write_text(sketch_content)
    return {"sketch_path": str(sketch_file), "sketch_dir": str(sketch_dir)}


def _imu_sensor_section() -> dict:
    """Generic IMU / float-array sensor section."""
    return {
        "forward_declarations": "static float features[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE];",
        "setup_body": "    // IMU or other sensor init goes here if needed",
        "loop_fill_signal": """    // Fill features[] with real sensor data here.
    // For testing, we zero-fill:
    memset(features, 0, sizeof(features));

    numpy::signal_from_buffer(features, EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE, &signal);""",
        "helpers": "",
    }


def _audio_sensor_section() -> dict:
    return {
        "forward_declarations": "// Audio capture — adapt to your microphone library",
        "setup_body": "    // Init microphone here",
        "loop_fill_signal": """    // Capture audio window into features[], then:
    static float features[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE];
    memset(features, 0, sizeof(features)); // replace with real mic data
    numpy::signal_from_buffer(features, EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE, &signal);""",
        "helpers": "",
    }


def _image_sensor_section() -> dict:
    return {
        "forward_declarations": "// Camera capture — adapt to your camera library (e.g. ArduCAM, OV7670)",
        "setup_body": "    // Init camera here",
        "loop_fill_signal": """    // Capture image into a pixel buffer, then point signal at it.
    // Example (pseudo-code):
    //   camera.capture(pixel_buf);
    //   signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
    //   signal.get_data = [](size_t offset, size_t len, float *out) -> int {
    //       for(size_t i=0; i<len; i++) out[i] = pixel_buf[offset+i] / 255.0f;
    //       return 0;
    //   };
    static float features[EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT * 3];
    memset(features, 0, sizeof(features));
    numpy::signal_from_buffer(features, EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT * 3, &signal);""",
        "helpers": "",
    }


@mcp.tool()
def compile_sketch(sketch_dir: str, fqbn: str, verbose: bool = False) -> dict:
    """
    Compile an Arduino sketch directory.

    Args:
        sketch_dir: Path to the folder containing the .ino file.
        fqbn:       Board FQBN string (e.g. 'arduino:mbed_nano:nano33ble').
        verbose:    Pass --verbose to arduino-cli for detailed output.

    Returns:
        { success, output } — output contains compiler messages on failure.
    """
    cmd = [ARDUINO_CLI, "compile", "--fqbn", fqbn, sketch_dir]
    if verbose:
        cmd.append("--verbose")
    r = _run(cmd, timeout=300)
    return {
        "success": r["returncode"] == 0,
        "output": r["stdout"] if r["returncode"] == 0 else r["stderr"] or r["stdout"],
    }


@mcp.tool()
def upload_sketch(sketch_dir: str, fqbn: str, port: str) -> dict:
    """
    Upload (flash) a compiled sketch to a board.

    Args:
        sketch_dir: Path to the folder containing the .ino file.
        fqbn:       Board FQBN string.
        port:       Serial port, e.g. '/dev/ttyACM0' or '/dev/ttyUSB0'.

    Returns:
        { success, output }
    """
    r = _run(
        [ARDUINO_CLI, "upload", "-p", port, "--fqbn", fqbn, sketch_dir],
        timeout=120,
    )
    return {
        "success": r["returncode"] == 0,
        "output": r["stdout"] if r["returncode"] == 0 else r["stderr"] or r["stdout"],
    }


@mcp.tool()
def read_serial(port: str, baud: int = 115200, lines: int = 20, timeout_seconds: int = 15) -> dict:
    """
    Read N lines from a serial port (to capture inference output after flashing).

    Args:
        port:            Serial port, e.g. '/dev/ttyACM0'.
        baud:            Baud rate. Default 115200.
        lines:           Number of lines to collect before returning.
        timeout_seconds: Give up after this many seconds even if lines not reached.

    Returns:
        { lines: [...] }
    """
    collected = []
    deadline = time.time() + timeout_seconds
    try:
        with serial.Serial(port, baud, timeout=1) as ser:
            time.sleep(2)  # Give the board time to reset after upload
            ser.reset_input_buffer()
            while len(collected) < lines and time.time() < deadline:
                raw = ser.readline()
                if raw:
                    collected.append(raw.decode("utf-8", errors="replace").rstrip())
    except serial.SerialException as e:
        return {"error": str(e), "lines": collected}
    return {"lines": collected}


@mcp.tool()
def run_full_pipeline(
    sketch_dir: str,
    fqbn: str,
    port: str,
    serial_lines: int = 20,
    serial_timeout: int = 15,
) -> dict:
    """
    Compile + upload + read serial in one call.
    Returns { compile_success, upload_success, serial_lines }.
    """
    compile_result = compile_sketch(sketch_dir, fqbn)
    if not compile_result["success"]:
        return {
            "compile_success": False,
            "compile_output": compile_result["output"],
            "upload_success": False,
            "serial_lines": [],
        }

    upload_result = upload_sketch(sketch_dir, fqbn, port)
    if not upload_result["success"]:
        return {
            "compile_success": True,
            "upload_success": False,
            "upload_output": upload_result["output"],
            "serial_lines": [],
        }

    serial_result = read_serial(port, lines=serial_lines, timeout_seconds=serial_timeout)
    return {
        "compile_success": True,
        "upload_success": True,
        "serial_lines": serial_result.get("lines", []),
    }


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    debug = "--debug" in sys.argv
    mcp.run(transport="stdio")

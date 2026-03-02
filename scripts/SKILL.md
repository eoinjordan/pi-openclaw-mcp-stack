# SKILL: Edge Impulse → Arduino Flash Pipeline

> Drop this file (and the `scripts/` folder beside it) into your OpenClaw / pi-openclaw-mcp-stack
> `skills/` directory. OpenClaw will discover it automatically.
>
> **What this skill does:**
> Given an Edge Impulse project ID and an Arduino board/port, it will:
> 1. Trigger an Arduino-library build on Edge Impulse and poll until done
> 2. Download the resulting `.zip` library to the Pi
> 3. Install it into `arduino-cli`'s library path (replacing any older version)
> 4. Generate (or accept) a `.ino` sketch that `#include`s the library
> 5. Compile the sketch with `arduino-cli`
> 6. Flash it to the connected Arduino
> 7. Optionally open the serial monitor and return inference output

---

## Prerequisites (run once, manually)

```bash
# 1. arduino-cli — install if missing
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
sudo mv bin/arduino-cli /usr/local/bin/
arduino-cli core update-index

# 2. Edge Impulse MCP — official npm package from edgeimpulse/ei-agentic-claude
npm install -g ei-agentic-claude
# Add it to OpenClaw:
openclaw mcp add edge-impulse -- edge-impulse-mcp
# OR for Claude Code / pi-openclaw-mcp-stack:
claude mcp add edge-impulse -- edge-impulse-mcp

# 3. Arduino MCP — FastMCP Python server (see scripts/arduino_mcp.py in this skill)
pip3 install fastmcp pyserial --break-system-packages
# Add to OpenClaw:
openclaw mcp add arduino -- python3 /path/to/skills/ei-arduino-skill/scripts/arduino_mcp.py

# 4. API keys in your .env / openclaw config
# EI_API_KEY=ei_xxxx          (from Edge Impulse dashboard → Keys)
# ANTHROPIC_API_KEY=sk-ant-xxxx
```

---

## How to trigger this skill

Tell OpenClaw / your agent in plain English, for example:

```
Export the Arduino library for Edge Impulse project 123456, then flash it to
my Arduino Nano 33 BLE Sense on /dev/ttyACM0 with a basic inference sketch.
```

```
Download the latest EI model for project 789 and update the firmware on the
ESP32 connected to /dev/ttyUSB0.
```

```
Build and deploy project 42 to my Arduino Uno, print the first 10 serial lines.
```

---

## Agent workflow (step by step)

The agent **must** follow these steps in order. Each step maps to a tool call.

### STEP 1 — Verify the EI project exists

```
Tool: edge-impulse → get-project
Params: { projectId: "<EI_PROJECT_ID>" }
```

Confirm the project name and that a trained impulse exists (check `deployment.hasDeployment`).
If no trained impulse, STOP and tell the user to train the model first.

### STEP 2 — Trigger the Arduino library build

```
Tool: edge-impulse → deploy-project
Params: {
  projectId: "<EI_PROJECT_ID>",
  type: "arduino",         // always "arduino" for ZIP library
  engine: "tflite"         // or "tflite-eon", "tensaiflow" — ask user if unsure
}
```

This returns a `{ jobId }`. Save it.

### STEP 3 — Poll until the build job completes

```
Tool: edge-impulse → get-job-status
Params: { projectId: "<EI_PROJECT_ID>", jobId: "<JOB_ID>" }
```

Poll every 5 seconds until `job.finishedSuccessfully === true`.
If `job.finishMs` exists and `job.finishedSuccessfully === false`, STOP with the error log.

### STEP 4 — Download the ZIP library to the Pi

```
Tool: edge-impulse → download-deployment
Params: {
  projectId: "<EI_PROJECT_ID>",
  type: "arduino",
  outputPath: "/tmp/ei_lib_<PROJECT_ID>.zip"
}
```

Confirm the file exists and is > 10 KB before continuing.

### STEP 5 — Install the library via arduino-cli

```
Tool: arduino → install_zip_library
Params: {
  zip_path: "/tmp/ei_lib_<PROJECT_ID>.zip"
}
```

This removes any previously installed library with the same name and installs fresh.
The tool returns `{ library_name, install_path }` — save `library_name`.

### STEP 6 — Generate the inference sketch

If the user supplied a custom `.ino`, skip to Step 7.

Otherwise use the built-in template. Call:

```
Tool: arduino → generate_ei_sketch
Params: {
  library_name: "<LIBRARY_NAME>",   // returned from step 5
  board_fqbn: "<FQBN>",             // e.g. "arduino:mbed_nano:nano33ble"
  sketch_dir: "/tmp/ei_sketch_<PROJECT_ID>"
}
```

The tool writes a ready-to-compile `.ino` that calls `run_classifier()` in a loop
and prints label + confidence over Serial at 115200 baud.

**Common FQBNs:**

| Board | FQBN |
|-------|------|
| Arduino Nano 33 BLE Sense | `arduino:mbed_nano:nano33ble` |
| Arduino Nano 33 BLE Sense Rev2 | `arduino:mbed_nano:nano33blesense` |
| Arduino Portenta H7 (M7) | `arduino:mbed_portenta:envie_m7` |
| Arduino Nicla Vision | `arduino:mbed_nicla:nicla_vision` |
| ESP32 generic | `esp32:esp32:esp32` |
| ESP32-S3 | `esp32:esp32:esp32s3` |

If the board is unknown, run `arduino → list_boards` first.

### STEP 7 — Compile the sketch

```
Tool: arduino → compile_sketch
Params: {
  sketch_dir: "/tmp/ei_sketch_<PROJECT_ID>",
  fqbn: "<FQBN>"
}
```

If compilation fails, read the error. Most common fixes:
- Missing board core → `arduino → install_core` with the right platform
- `arm_math.h` not found on SAMD21 → tell user to reinstall Arduino IDE / core (known upstream bug)
- `Multiple libraries were found` → `arduino → remove_library` for the old version, retry

### STEP 8 — Detect the board port (if not supplied)

```
Tool: arduino → list_connected_boards
```

Match by board name or FQBN. If multiple boards are found, ask the user which port to use.

### STEP 9 — Flash to the board

```
Tool: arduino → upload_sketch
Params: {
  sketch_dir: "/tmp/ei_sketch_<PROJECT_ID>",
  fqbn: "<FQBN>",
  port: "<PORT>"   // e.g. "/dev/ttyACM0"
}
```

### STEP 10 (optional) — Read serial output

```
Tool: arduino → read_serial
Params: {
  port: "<PORT>",
  baud: 115200,
  lines: 20,
  timeout_seconds: 15
}
```

Return the inference lines to the user.

---

## Error handling cheatsheet

| Symptom | Fix |
|---------|-----|
| `deploy-project` returns 404 | Project ID wrong or no trained impulse |
| Job stuck `running` > 5 min | Call `get-job-status` once more; if still running, call `cancel-job` and retry |
| `arm_math.h` compile error | Reinstall board core: `arduino → install_core { platform: "arduino:mbed_nano" }` |
| `avrdude: stk500_recv` on upload | Board not in bootloader mode; press reset button twice quickly, retry upload |
| `Permission denied /dev/ttyACM0` | `sudo usermod -aG dialout $USER` then log out and back in |
| `Multiple libraries were found` | `arduino → remove_library { name: "<OLD_LIB_NAME>" }` then reinstall |
| `Could not deploy: deploy_target` | Wrong engine for the model type — try `engine: "tflite"` |

---

## Memory hints for OpenClaw

After a successful flash, save these to long-term memory:

```
ei_project_<PROJECT_ID>_board = "<FQBN>"
ei_project_<PROJECT_ID>_port  = "<PORT>"
ei_project_<PROJECT_ID>_lib   = "<LIBRARY_NAME>"
ei_project_<PROJECT_ID>_last_flash = "<ISO_TIMESTAMP>"
```

This allows future "re-flash project 123" commands to skip Steps 6–8.

---

## Scripts included

| File | Purpose |
|------|---------|
| `scripts/arduino_mcp.py` | FastMCP server exposing all Arduino tools |
| `scripts/ei_deploy_helpers.py` | Helper polling + download wrappers for EI MCP gaps |
| `scripts/sketch_template.ino.jinja` | Jinja2 template for the generated inference sketch |
| `scripts/install_deps.sh` | One-shot dependency installer for Pi |

See each file for inline documentation.

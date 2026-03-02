"""Tool implementations for the agentic MCP server."""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP


def register_system_tools(mcp: FastMCP, llm_client=None, debug: bool = False):
    """Register generic system tools (file, shell, web)."""

    @mcp.tool()
    def execute_command(
        command: str,
        cwd: Optional[str] = None,
        timeout: int = 60,
    ) -> Dict[str, Any]:
        """
        Execute a shell command and return output.

        Args:
            command: Shell command to execute.
            cwd: Working directory (default: current directory).
            timeout: Timeout in seconds (default: 60).

        Returns:
            { success, stdout, stderr, returncode }
        """
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                cwd=cwd,
                timeout=timeout,
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Command timed out after {timeout}s",
                "returncode": -1,
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "returncode": -1,
            }

    @mcp.tool()
    def read_file(path: str, encoding: str = "utf-8") -> Dict[str, Any]:
        """
        Read a file's contents.

        Args:
            path: Absolute path to the file.
            encoding: File encoding (default: utf-8).

        Returns:
            { success, content } or { success, error }
        """
        try:
            with open(path, "r", encoding=encoding) as f:
                content = f.read()
            return {"success": True, "content": content}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    def write_file(path: str, content: str, encoding: str = "utf-8") -> Dict[str, Any]:
        """
        Write content to a file (creates or overwrites).

        Args:
            path: Absolute path to the file.
            content: Content to write.
            encoding: File encoding (default: utf-8).

        Returns:
            { success } or { success, error }
        """
        try:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding=encoding) as f:
                f.write(content)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    def list_directory(path: str = ".") -> Dict[str, Any]:
        """
        List directory contents.

        Args:
            path: Directory path (default: current directory).

        Returns:
            { success, entries: [{name, type, size}], error }
        """
        try:
            entries = []
            for entry in Path(path).iterdir():
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size,
                })
            return {"success": True, "entries": entries}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    def search_files(
        directory: str,
        pattern: str,
        recursive: bool = True,
    ) -> Dict[str, Any]:
        """
        Search for files matching a pattern.

        Args:
            directory: Directory to search in.
            pattern: Glob pattern (e.g., "*.py", "**/*.js").
            recursive: Search recursively (default: True).

        Returns:
            { success, files: [path, ...], error }
        """
        try:
            path = Path(directory)
            if recursive:
                files = [str(p) for p in path.rglob(pattern)]
            else:
                files = [str(p) for p in path.glob(pattern)]
            return {"success": True, "files": files}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    def get_system_info() -> Dict[str, Any]:
        """
        Get system information (OS, CPU, memory, disk).

        Returns:
            { success, info: {...} }
        """
        import platform
        import psutil

        try:
            info = {
                "os": platform.system(),
                "os_version": platform.version(),
                "architecture": platform.machine(),
                "hostname": platform.node(),
                "cpu_count": psutil.cpu_count(),
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
                "memory_available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_usage": {
                    "total_gb": round(psutil.disk_usage("/").total / (1024**3), 2),
                    "used_gb": round(psutil.disk_usage("/").used / (1024**3), 2),
                    "free_gb": round(psutil.disk_usage("/").free / (1024**3), 2),
                    "percent": psutil.disk_usage("/").percent,
                },
            }
            return {"success": True, "info": info}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    def check_url(url: str, method: str = "GET", timeout: int = 10) -> Dict[str, Any]:
        """
        Check if a URL is accessible.

        Args:
            url: URL to check.
            method: HTTP method (GET, HEAD).
            timeout: Request timeout in seconds.

        Returns:
            { success, status_code, error }
        """
        import requests

        try:
            response = requests.request(method, url, timeout=timeout)
            return {
                "success": response.status_code < 400,
                "status_code": response.status_code,
                "headers": dict(response.headers),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


def register_arduino_tools(mcp: FastMCP, debug: bool = False):
    """Register Arduino/embedded tools."""

    ARDUINO_CLI = shutil.which("arduino-cli") or "arduino-cli"

    def _run_arduino(cmd: List[str], timeout: int = 120) -> Dict[str, Any]:
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
            return {"returncode": -1, "stdout": "", "stderr": "arduino-cli not found"}

    @mcp.tool()
    def list_arduino_boards() -> Dict[str, Any]:
        """List all installed Arduino board platforms."""
        r = _run_arduino([ARDUINO_CLI, "board", "listall", "--format", "json"])
        if r["returncode"] != 0:
            return {"error": r["stderr"], "boards": []}
        try:
            data = json.loads(r["stdout"])
            return {"boards": data.get("boards", [])}
        except json.JSONDecodeError:
            return {"error": "Failed to parse output", "raw": r["stdout"]}

    @mcp.tool()
    def list_connected_boards() -> Dict[str, Any]:
        """List connected Arduino boards via USB."""
        r = _run_arduino([ARDUINO_CLI, "board", "list", "--format", "json"])
        if r["returncode"] != 0:
            return {"error": r["stderr"], "boards": []}
        try:
            data = json.loads(r["stdout"])
            boards = []
            for entry in data.get("detected_ports", []):
                port = entry.get("port", {}).get("address", "")
                matching = entry.get("matching_boards", [])
                if matching:
                    for b in matching:
                        boards.append({
                            "port": port,
                            "fqbn": b.get("fqbn", ""),
                            "name": b.get("name", ""),
                        })
                else:
                    boards.append({"port": port, "fqbn": "", "name": "unknown"})
            return {"boards": boards}
        except Exception as e:
            return {"error": str(e), "boards": []}

    @mcp.tool()
    def install_arduino_core(platform: str) -> Dict[str, Any]:
        """Install an Arduino board core/platform."""
        r = _run_arduino([ARDUINO_CLI, "core", "install", platform], timeout=300)
        return {"returncode": r["returncode"], "output": r["stdout"] or r["stderr"]}

    @mcp.tool()
    def compile_arduino(sketch_dir: str, fqbn: str) -> Dict[str, Any]:
        """Compile an Arduino sketch."""
        r = _run_arduino(
            [ARDUINO_CLI, "compile", "--fqbn", fqbn, sketch_dir],
            timeout=300,
        )
        return {
            "success": r["returncode"] == 0,
            "output": r["stdout"] if r["returncode"] == 0 else r["stderr"],
        }

    @mcp.tool()
    def upload_arduino(sketch_dir: str, fqbn: str, port: str) -> Dict[str, Any]:
        """Upload (flash) a compiled sketch to a board."""
        r = _run_arduino(
            [ARDUINO_CLI, "upload", "-p", port, "--fqbn", fqbn, sketch_dir],
            timeout=120,
        )
        return {
            "success": r["returncode"] == 0,
            "output": r["stdout"] if r["returncode"] == 0 else r["stderr"],
        }

    @mcp.tool()
    def install_arduino_library(zip_path: str) -> Dict[str, Any]:
        """Install an Arduino library from ZIP."""
        import zipfile

        zip_path = Path(zip_path).expanduser().resolve()
        if not zip_path.exists():
            return {"error": f"File not found: {zip_path}"}

        try:
            with zipfile.ZipFile(zip_path) as z:
                root_names = {p.split("/")[0] for p in z.namelist() if "/" in p}
                if not root_names:
                    return {"error": "Invalid ZIP structure"}
                lib_name = sorted(root_names)[0]
        except Exception as e:
            return {"error": f"Bad ZIP: {e}"}

        _run_arduino([ARDUINO_CLI, "lib", "uninstall", lib_name])
        r = _run_arduino([ARDUINO_CLI, "lib", "install", "--zip-path", str(zip_path)])

        return {
            "success": r["returncode"] == 0,
            "library_name": lib_name if r["returncode"] == 0 else None,
            "output": r["stdout"] or r["stderr"],
        }


def register_ei_tools(mcp: FastMCP, llm_client=None, debug: bool = False):
    """Register Edge Impulse tools (requires EI_API_KEY)."""

    @mcp.tool()
    def ei_list_projects() -> Dict[str, Any]:
        """List Edge Impulse projects."""
        import os
        import requests

        api_key = os.getenv("EI_API_KEY")
        if not api_key:
            return {"error": "EI_API_KEY not set"}

        try:
            response = requests.get(
                "https://studio.edgeimpulse.com/v1/api",
                headers={"Authorization": f"ApiKey {api_key}"},
                timeout=30,
            )
            if response.status_code != 200:
                return {"error": f"API error: {response.status_code}"}
            data = response.json()
            return {"projects": data.get("projects", [])}
        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def ei_get_project(project_id: str) -> Dict[str, Any]:
        """Get Edge Impulse project details."""
        import os
        import requests

        api_key = os.getenv("EI_API_KEY")
        if not api_key:
            return {"error": "EI_API_KEY not set"}

        try:
            response = requests.get(
                f"https://studio.edgeimpulse.com/v1/api/{project_id}",
                headers={"Authorization": f"ApiKey {api_key}"},
                timeout=30,
            )
            if response.status_code != 200:
                return {"error": f"API error: {response.status_code}"}
            return {"project": response.json()}
        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def ei_list_deployments(project_id: str) -> Dict[str, Any]:
        """List available deployments for a project."""
        import os
        import requests

        api_key = os.getenv("EI_API_KEY")
        if not api_key:
            return {"error": "EI_API_KEY not set"}

        try:
            response = requests.get(
                f"https://studio.edgeimpulse.com/v1/api/{project_id}/deployments",
                headers={"Authorization": f"ApiKey {api_key}"},
                timeout=30,
            )
            if response.status_code != 200:
                return {"error": f"API error: {response.status_code}"}
            data = response.json()
            return {"deployments": data.get("deployments", [])}
        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def ei_create_deployment(
        project_id: str,
        engine: str = "Arduino",
    ) -> Dict[str, Any]:
        """Create a new deployment build."""
        import os
        import requests

        api_key = os.getenv("EI_API_KEY")
        if not api_key:
            return {"error": "EI_API_KEY not set"}

        try:
            response = requests.post(
                f"https://studio.edgeimpulse.com/v1/api/{project_id}/deployments",
                headers={"Authorization": f"ApiKey {api_key}"},
                json={"engine": engine},
                timeout=30,
            )
            if response.status_code != 200:
                return {"error": f"API error: {response.status_code}"}
            return {"job": response.json()}
        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def ei_get_job_status(project_id: str, job_id: str) -> Dict[str, Any]:
        """Get deployment job status."""
        import os
        import requests

        api_key = os.getenv("EI_API_KEY")
        if not api_key:
            return {"error": "EI_API_KEY not set"}

        try:
            response = requests.get(
                f"https://studio.edgeimpulse.com/v1/api/{project_id}/jobs/{job_id}",
                headers={"Authorization": f"ApiKey {api_key}"},
                timeout=30,
            )
            if response.status_code != 200:
                return {"error": f"API error: {response.status_code}"}
            return {"job": response.json()}
        except Exception as e:
            return {"error": str(e)}

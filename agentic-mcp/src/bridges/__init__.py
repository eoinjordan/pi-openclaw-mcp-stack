"""MCP bridge clients for external MCP servers (EI, Arduino)."""

import json
import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union


class MCPBridgeClient(ABC):
    """Abstract base for MCP bridge HTTP clients."""

    def __init__(self, base_url: str, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    @abstractmethod
    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call an MCP tool."""
        pass

    @abstractmethod
    def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        pass


class HTTPBridgeClient(MCPBridgeClient):
    """HTTP bridge client for MCP servers."""

    def __init__(self, base_url: str, timeout: int = 60):
        super().__init__(base_url, timeout)
        self._session = None

    def _get_session(self):
        import requests
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update({"Content-Type": "application/json"})
        return self._session

    def list_tools(self) -> List[Dict[str, Any]]:
        import requests
        try:
            resp = self._get_session().get(
                f"{self.base_url}/tools",
                timeout=self.timeout
            )
            resp.raise_for_status()
            return resp.json().get("tools", [])
        except Exception as e:
            return [{"error": str(e)}]

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        import requests
        try:
            resp = self._get_session().post(
                f"{self.base_url}/run",
                json={"name": tool_name, "arguments": arguments},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"error": str(e)}


class StdioBridgeProcess:
    """Process-based bridge for stdio MCP servers."""

    def __init__(self, command: List[str], env: Optional[Dict[str, str]] = None):
        self.command = command
        self.env = env
        self._process = None

    def start(self):
        import os
        import subprocess
        full_env = os.environ.copy()
        if self.env:
            full_env.update(self.env)

        self._process = subprocess.Popen(
            self.command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=full_env,
            text=True,
        )

    def stop(self):
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=5)

    def send_jsonrpc(self, method: str, params: Dict[str, Any]) -> Any:
        import json
        if not self._process or self._process.poll() is not None:
            raise RuntimeError("Process not running")

        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        }

        self._process.stdin.write(json.dumps(request) + "\n")
        self._process.stdin.flush()

        response = self._process.stdout.readline()
        return json.loads(response)


def create_bridge(
    service: str,
    base_url: Optional[str] = None,
    command: Optional[List[str]] = None,
    env: Optional[Dict[str, str]] = None,
) -> Union[MCPBridgeClient, StdioBridgeProcess]:
    """Factory to create bridge clients."""

    if service == "edge-impulse" or service == "ei":
        url = base_url or "http://127.0.0.1:8090"
        return HTTPBridgeClient(url)

    if service == "arduino":
        url = base_url or "http://127.0.0.1:3080"
        return HTTPBridgeClient(url)

    if service == "ei-stdio":
        if not command:
            raise ValueError("command required for stdio bridge")
        return StdioBridgeProcess(command, env)

    raise ValueError(f"Unknown service: {service}")

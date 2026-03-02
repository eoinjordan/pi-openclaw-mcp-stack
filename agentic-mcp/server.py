#!/usr/bin/env python3
"""
Agentic MCP Server - Local LLM-powered MCP server with tool execution.
Supports Raspberry Pi 5 and GPU laptops with auto-detection.
Works with Ollama, llama.cpp, and HuggingFace backends.
Integrates with ei-agentic-claude and arduino-mcp.
"""

import argparse
import os
import sys
from pathlib import Path

_root = Path(__file__).parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from fastmcp import FastMCP

from src.hardware import detect_hardware, get_hardware_config
from src.llm import LLMClient, create_llm_client
from src.tools import (
    register_arduino_tools,
    register_ei_tools,
    register_system_tools,
)
from src.bridges import (
    create_bridge,
    HTTPBridgeClient,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Agentic MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="MCP transport protocol",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="SSE server host (ignored for stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="SSE server port (ignored for stdio)",
    )
    parser.add_argument(
        "--llm-provider",
        choices=["ollama", "llama.cpp", "huggingface", "auto"],
        default="auto",
        help="LLM backend provider",
    )
    parser.add_argument(
        "--llm-model",
        default=None,
        help="LLM model name (default: auto-select based on hardware)",
    )
    parser.add_argument(
        "--llm-url",
        default=None,
        help="LLM API URL (default: http://localhost:11434 for Ollama)",
    )
    parser.add_argument(
        "--adapter",
        default=None,
        help='HuggingFace LoRA adapter repo (e.g., "<your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct")',
    )
    parser.add_argument(
        "--tools",
        choices=["all", "arduino", "ei", "system", "bridge"],
        default="all",
        help="Which tool groups to enable",
    )
    parser.add_argument(
        "--ei-bridge-url",
        default=None,
        help="Edge Impulse MCP bridge URL (default: http://127.0.0.1:8090)",
    )
    parser.add_argument(
        "--arduino-bridge-url",
        default=None,
        help="Arduino MCP bridge URL (default: http://127.0.0.1:3080)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


def register_bridge_tools(mcp, ei_url=None, arduino_url=None, debug=False):
    """Register tools that proxy to external MCP bridges."""

    ei_client = None
    arduino_client = None

    if ei_url:
        ei_client = create_bridge("ei", ei_url)

    if arduino_url:
        arduino_client = create_bridge("arduino", arduino_url)

    @mcp.tool()
    def ei_call_tool(name: str, arguments: dict = None) -> dict:
        """Call an Edge Impulse MCP tool directly."""
        if not ei_client:
            return {"error": "EI bridge not configured"}
        return ei_client.call_tool(name, arguments or {})

    @mcp.tool()
    def ei_list_tools() -> dict:
        """List available Edge Impulse MCP tools."""
        if not ei_client:
            return {"error": "EI bridge not configured"}
        return {"tools": ei_client.list_tools()}

    @mcp.tool()
    def arduino_call_tool(name: str, arguments: dict = None) -> dict:
        """Call an Arduino MCP tool directly."""
        if not arduino_client:
            return {"error": "Arduino bridge not configured"}
        return arduino_client.call_tool(name, arguments or {})

    @mcp.tool()
    def arduino_list_tools() -> dict:
        """List available Arduino MCP tools."""
        if not arduino_client:
            return {"error": "Arduino bridge not configured"}
        return {"tools": arduino_client.list_tools()}

    @mcp.tool()
    def bridge_health() -> dict:
        """Check health of all configured bridges."""
        health = {}

        if ei_client:
            try:
                tools = ei_client.list_tools()
                health["edge-impulse"] = {"status": "ok", "tools": len(tools)}
            except Exception as e:
                health["edge-impulse"] = {"status": "error", "error": str(e)}

        if arduino_client:
            try:
                tools = arduino_client.list_tools()
                health["arduino"] = {"status": "ok", "tools": len(tools)}
            except Exception as e:
                health["arduino"] = {"status": "error", "error": str(e)}

        return health


def main():
    args = parse_args()

    hardware = detect_hardware()
    hw_config = get_hardware_config(hardware)

    if args.debug:
        print(f"[agentic-mcp] Detected hardware: {hardware.name}", file=sys.stderr)
        print(f"[agentic-mcp] Hardware config: {hw_config}", file=sys.stderr)

    llm_client = None
    if args.llm_provider != "none":
        provider = args.llm_provider
        if provider == "auto":
            provider = hw_config.get("default_llm_provider", "ollama")

        model = args.llm_model or hw_config.get("default_model", "qwen2.5:3b-instruct")
        llm_url = args.llm_url or hw_config.get("default_llm_url")
        adapter = args.adapter or hw_config.get("default_adapter")

        llm_client = create_llm_client(
            provider=provider,
            model=model,
            base_url=llm_url,
            adapter_repo=adapter,
            debug=args.debug,
        )

        if args.debug:
            print(f"[agentic-mcp] LLM client: {llm_client}", file=sys.stderr)

    mcp = FastMCP(
        name="agentic-mcp",
    )

    tool_groups = args.tools
    if tool_groups in ("all", "system"):
        register_system_tools(mcp, llm_client, debug=args.debug)

    if tool_groups in ("all", "arduino"):
        register_arduino_tools(mcp, debug=args.debug)

    if tool_groups in ("all", "ei"):
        register_ei_tools(mcp, llm_client, debug=args.debug)

    if tool_groups in ("all", "bridge"):
        ei_url = args.ei_bridge_url or os.getenv("EI_BRIDGE_URL", "http://127.0.0.1:8090")
        arduino_url = args.arduino_bridge_url or os.getenv("ARDUINO_BRIDGE_URL", "http://127.0.0.1:3080")
        register_bridge_tools(mcp, ei_url, arduino_url, args.debug)

    if args.debug:
        print(f"[agentic-mcp] Starting server with transport: {args.transport}", file=sys.stderr)

    if args.transport == "sse":
        mcp.run(transport="sse", host=args.host, port=args.port)
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    main()

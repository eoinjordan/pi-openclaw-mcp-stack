# Agentic MCP Server

A flexible MCP (Model Context Protocol) server framework that runs on Raspberry Pi or GPU laptops with local LLM support.

## Features

- **Hardware Auto-Detection**: Automatically detects Raspberry Pi 5, Pi 4, NVIDIA laptops/desktops, AMD GPUs
- **Local LLM Support**: Works with Ollama, llama.cpp, and HuggingFace (with LoRA adapters)
- **Tool System**:
  - System tools (file ops, shell commands, web fetch)
  - Arduino tools (board management, compile, flash)
  - Edge Impulse tools (project management, deployments)
- **Flexible Transport**: stdio (for Claude Code/OpenClaw) or SSE (HTTP)

## Installation

```bash
cd agentic-mcp
pip install -e .
```

Or with Docker:
```bash
docker build -t agentic-mcp ./agentic-mcp
```

## Adding to Claude Code / OpenClaw

```bash
# Full config with your LoRA adapter
claude mcp add agentic-mcp -- python3 -m agentic_mcp.server \
    --llm-provider huggingface \
    --llm-model Qwen/Qwen2.5-Coder-7B-Instruct \
    --adapter <your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct

# Or auto-detect hardware (Pi: Ollama, GPU laptop: HuggingFace + LoRA)
claude mcp add agentic-mcp -- python3 -m agentic_mcp.server
```

The MCP config is also available in `opencode-mcp-config.json` for manual setup.

## Kubernetes Deployment

Deploy on a K3s cluster (Pi or GPU nodes):

```bash
# Build image
docker build -t agentic-mcp:latest ./agentic-mcp

# Deploy
kubectl apply -f k8s/

# Scale
kubectl scale deployment agentic-mcp --replicas=5
```

See `k8s/README.md` for full K3s cluster setup.

## External MCP Bridge Integration

The framework can integrate with external MCP servers like:
- `edgeimpulse/ei-agentic-claude` - Edge Impulse MCP tools
- `your-org/arduino-mcp` - Arduino CLI MCP tools

### HTTP Bridge Mode

When those services are running (e.g., via Docker), connect via HTTP:

```bash
python3 server.py --tools bridge \
    --ei-bridge-url http://127.0.0.1:8090 \
    --arduino-bridge-url http://127.0.0.1:3080
```

Available bridge tools:
- `ei_call_tool(name, arguments)` - Call EI MCP tool
- `ei_list_tools()` - List EI tools
- `arduino_call_tool(name, arguments)` - Call Arduino MCP tool
- `arduino_list_tools()` - List Arduino tools
- `bridge_health()` - Check all bridges

### Via Docker (like pi-openclaw-mcp-stack)

```bash
# Start EI and Arduino MCP containers
docker run -d --name ei-mcp -p 8090:8080 your-org/ei-agentic-claude-mcp:latest
docker run -d --name arduino-mcp -p 3080:3080 your-org/arduino-mcp:latest
```

## Hardware Defaults

| Hardware | Default Model | Provider | Max Tokens |
|----------|---------------|----------|-------------|
| Pi 5 | qwen2.5:3b-instruct | Ollama | 2048 |
| Pi 4 | qwen2.5:1.8b-instruct | Ollama | 1024 |
| NVIDIA Laptop | Qwen2.5-Coder-7B-Instruct + LoRA | HuggingFace | 4096 |
| NVIDIA Desktop | Qwen2.5-Coder-7B-Instruct + LoRA | HuggingFace | 8192 |

## Using the EdgeAI Docs LoRA Adapter

The NVIDIA laptop/desktop config defaults to using your EdgeAI Docs Qwen2.5 Coder 7B LoRA adapter:

```bash
# Auto-detect hardware and use LoRA adapter
python -m agentic_mcp.server --debug

# Or explicitly specify
python -m agentic_mcp.server \
    --llm-provider huggingface \
    --llm-model Qwen/Qwen2.5-Coder-7B-Instruct \
    --adapter <your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct
```

This will:
1. Download the base model from HuggingFace
2. Apply your LoRA adapter on top
3. Run inference with 4-bit quantization (QLoRA)

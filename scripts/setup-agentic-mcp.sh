#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTIC_MCP_DIR="$ROOT_DIR/agentic-mcp"

echo "=== Agentic MCP Server Setup (Pi 5 / GPU Laptop) ==="
echo

install_python_deps() {
    echo "[1/5] Installing Python dependencies..."

    if ! command -v python3 >/dev/null 2>&1; then
        sudo apt-get update
        sudo apt-get install -y python3 python3-pip python3-venv
    fi

    cd "$AGENTIC_MCP_DIR"
    pip3 install -e . --break-system-packages 2>/dev/null || pip3 install -e .
    echo "Python packages installed."
}

install_arduino_cli() {
    echo "[2/5] Installing arduino-cli (for Arduino tools)..."

    if command -v arduino-cli >/dev/null 2>&1; then
        echo "arduino-cli already installed."
        return 0
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    curl -fsSL https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_ARM64.tar.gz | tar xz
    sudo mv arduino-cli /usr/local/bin/arduino-cli
    sudo chmod +x /usr/local/bin/arduino-cli

    rm -rf "$tmp_dir"

    arduino-cli config init
    arduino-cli core update-index
    arduino-cli core install arduino:mbed_nano
    echo "arduino-cli installed and Nano 33 BLE core ready."
}

install_ollama() {
    echo "[3/5] Installing Ollama (for Pi local LLM)..."

    if command -v ollama >/dev/null 2>&1; then
        echo "ollama already installed."
        return 0
    fi

    curl -fsSL https://ollama.com/install.sh | sh

    echo "Starting Ollama service..."
    ollama serve &
    OLLAMA_PID=$!
    sleep 3

    echo "Pulling default model (qwen2.5:3b)..."
    ollama pull qwen2.5:3b-instruct

    echo "Ollama installed and model ready."
}

install_huggingface_deps() {
    echo "[4/5] Installing HuggingFace dependencies (for LoRA on GPU laptops)..."

    cd "$AGENTIC_MCP_DIR"
    pip3 install transformers peft bitsandbytes accelerate --break-system-packages 2>/dev/null || pip3 install transformers peft bitsandbytes accelerate

    echo "HuggingFace packages installed."
}

setup_mcp_config() {
    echo "[5/5] Setting up Claude Code / OpenClaw MCP..."

    local mcp_add_cmd=""

    if command -v claude >/dev/null 2>&1; then
        mcp_add_cmd="claude mcp add"
    elif command -v openclaw >/dev/null 2>&1; then
        mcp_add_cmd="openclaw mcp add"
    else
        echo "Note: Claude Code or OpenClaw not found in PATH."
        echo "To add MCP manually, run:"
        echo "  claude mcp add agentic-mcp -- python3 -m agentic_mcp.server"
        return 0
    fi

    if [[ -n "$mcp_add_cmd" ]]; then
        echo "Adding agentic-mcp to MCP servers..."
        $mcp_add_cmd agentic-mcp -- python3 -m agentic_mcp.server
        echo "MCP server added."
    fi
}

detect_hardware() {
    echo "Detecting hardware..."

    if [[ -f /proc/cpuinfo ]] && grep -q "Raspberry Pi" /proc/cpuinfo; then
        if grep -q "bcm2712" /proc/cpuinfo 2>/dev/null; then
            echo "Detected: Raspberry Pi 5"
            echo "Recommended: Ollama (qwen2.5:3b)"
            return 0
        else
            echo "Detected: Raspberry Pi 4"
            echo "Recommended: Ollama (qwen2.5:1.8b)"
            return 0
        fi
    fi

    if command -v nvidia-smi >/dev/null 2>&1; then
        echo "Detected: NVIDIA GPU"
        echo "Recommended: HuggingFace + LoRA adapter"
        return 0
    fi

    echo "Detected: Generic Linux"
    echo "Recommended: Ollama"
    return 0
}

run_setup() {
    detect_hardware
    echo

    install_python_deps
    echo

    install_arduino_cli
    echo

    if detect_hardware 2>/dev/null | grep -q "NVIDIA"; then
        install_huggingface_deps
    else
        install_ollama
    fi
    echo

    setup_mcp_config
    echo
    echo "=== Setup Complete ==="
    echo
    echo "To run the agentic MCP server:"
    echo "  python3 -m agentic_mcp.server"
    echo
    echo "With LoRA adapter (NVIDIA GPU):"
    echo "  python3 -m agentic_mcp.server --llm-provider huggingface --adapter <your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct"
    echo
    echo "With Ollama (Pi 5):"
    echo "  python3 -m agentic_mcp.server --llm-provider ollama"
}

run_setup

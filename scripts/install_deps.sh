#!/usr/bin/env bash
# install_deps.sh — One-shot setup for the ei-arduino-skill on Raspberry Pi
# Run as a normal user (sudo will be called where needed).
set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ei-arduino-skill dependency installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. arduino-cli ─────────────────────────────────────────────────────────
if command -v arduino-cli &>/dev/null; then
    echo "[1/5] arduino-cli already installed: $(arduino-cli version)"
else
    echo "[1/5] Installing arduino-cli…"
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
    sudo mv bin/arduino-cli /usr/local/bin/arduino-cli
    rm -rf bin
    echo "      arduino-cli installed: $(arduino-cli version)"
fi

# Update board index
echo "      Updating board index…"
arduino-cli core update-index

# ── 2. Common board cores ───────────────────────────────────────────────────
echo "[2/5] Installing common board cores…"

arduino-cli core install arduino:mbed_nano      || true   # Nano 33 BLE family
arduino-cli core install arduino:mbed_portenta  || true   # Portenta H7
arduino-cli core install arduino:mbed_nicla     || true   # Nicla Vision / Voice

# ESP32 needs a custom board manager URL
ESP32_URL="https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json"
if ! arduino-cli core list | grep -q "esp32:esp32"; then
    echo "      Adding ESP32 board manager URL…"
    arduino-cli config add board_manager.additional_urls "$ESP32_URL"
    arduino-cli core update-index
    arduino-cli core install esp32:esp32 || true
fi

# ── 3. Python deps for arduino_mcp.py ──────────────────────────────────────
echo "[3/5] Installing Python dependencies…"
pip3 install --break-system-packages fastmcp pyserial

# ── 4. Edge Impulse MCP (ei-agentic-claude) ─────────────────────────────────
echo "[4/5] Installing Edge Impulse MCP (ei-agentic-claude)…"
if ! command -v edge-impulse-mcp &>/dev/null; then
    npm install -g ei-agentic-claude
else
    echo "      edge-impulse-mcp already installed"
fi

# ── 5. Add user to dialout group (serial port access) ──────────────────────
echo "[5/5] Ensuring $USER is in the 'dialout' group…"
if groups | grep -q dialout; then
    echo "      Already in dialout group"
else
    sudo usermod -aG dialout "$USER"
    echo "      Added to dialout. You must LOG OUT and back in for this to take effect."
fi

# ── Summary ─────────────────────────────────────────────────────────────────
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ Dependencies installed!"
echo ""
echo " Next steps:"
echo "   1. Add your API keys to ~/.openclaw/.env (or openclaw's config):"
echo "      EI_API_KEY=ei_xxxx"
echo "      ANTHROPIC_API_KEY=sk-ant-xxxx"
echo ""
echo "   2. Register the MCP servers with OpenClaw:"
echo "      openclaw mcp add edge-impulse -- edge-impulse-mcp"
echo "      openclaw mcp add arduino -- python3 $SKILL_DIR/scripts/arduino_mcp.py"
echo ""
echo "   3. Verify:"
echo "      openclaw mcp list"
echo ""
echo "   4. Tell OpenClaw:"
echo "      'Export the Arduino library for EI project 123456 and flash it to"
echo "       my Nano 33 BLE Sense on /dev/ttyACM0'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

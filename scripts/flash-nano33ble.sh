#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_REL="${1:-Blink}"
SERIAL_PORT="${2:-/dev/ttyACM0}"
FQBN="${3:-arduino:mbed_nano:nano33ble}"
IMAGE="${ARDUINO_MCP_IMAGE:-docker.io/eoinedge/arduino-mcp:latest}"

if [[ ! -d "$ROOT_DIR/workspace/Arduino/$PROJECT_REL" ]]; then
  echo "Project folder not found: $ROOT_DIR/workspace/Arduino/$PROJECT_REL"
  echo "Expected sketch path: workspace/Arduino/<ProjectName>/<ProjectName>.ino"
  exit 1
fi

if [[ ! -e "$SERIAL_PORT" ]]; then
  echo "Serial port not found: $SERIAL_PORT"
  echo "Check with: ls /dev/ttyACM* /dev/ttyUSB*"
  exit 1
fi

echo "Uploading /workspace/$PROJECT_REL to $SERIAL_PORT (FQBN=$FQBN) using $IMAGE"

HOST_PROJECT_PATH="$ROOT_DIR/workspace/Arduino/$PROJECT_REL"

if command -v arduino-cli >/dev/null 2>&1; then
  echo "Detected host arduino-cli; using host compile+upload path"
  arduino-cli compile --fqbn "$FQBN" "$HOST_PROJECT_PATH"
  arduino-cli upload -p "$SERIAL_PORT" --fqbn "$FQBN" "$HOST_PROJECT_PATH"
  exit 0
fi

echo "Host arduino-cli not found; falling back to container compile+upload"
docker run --rm \
  --network host \
  --device "$SERIAL_PORT:$SERIAL_PORT" \
  -v "$ROOT_DIR/workspace/Arduino:/workspace" \
  -v "$ROOT_DIR/workspace/.arduino15:/root/.arduino15" \
  "$IMAGE" \
  sh -lc "arduino-cli compile --fqbn \"$FQBN\" \"/workspace/$PROJECT_REL\" && arduino-cli upload -p \"$SERIAL_PORT\" --fqbn \"$FQBN\" \"/workspace/$PROJECT_REL\""

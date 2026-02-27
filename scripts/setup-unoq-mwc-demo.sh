#!/usr/bin/env bash
set -euo pipefail

# Clone and normalize the Edge Impulse UNO Q mwc-demo repo.
# Usage:
#   bash scripts/setup-unoq-mwc-demo.sh
#   bash scripts/setup-unoq-mwc-demo.sh /home/ubuntu/ei-unoq-custom-sensor

REPO_URL="https://github.com/edgeimpulse/ei-unoq-custom-sensor.git"
BRANCH="mwc-demo"
TARGET_DIR="${1:-$HOME/ei-unoq-custom-sensor}"

echo "[unoq] target: $TARGET_DIR"

if [[ ! -d "$TARGET_DIR/.git" ]]; then
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[unoq] normalizing layout"
mkdir -p arduino/uno_q_adc_streamer linux

# README references these paths; keep compatibility by copying if missing.
if [[ -f "unoq_stream.ino" && ! -f "arduino/uno_q_adc_streamer/uno_q_adc_streamer.ino" ]]; then
  cp "unoq_stream.ino" "arduino/uno_q_adc_streamer/uno_q_adc_streamer.ino"
fi

if [[ -f "unoq_adc_infer.py" && ! -f "linux/unoq_adc_infer.py" ]]; then
  cp "unoq_adc_infer.py" "linux/unoq_adc_infer.py"
fi

echo "[unoq] setting up Python env"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt flask

echo
echo "[unoq] done"
echo "Run next:"
echo "  cd \"$TARGET_DIR\""
echo "  source .venv/bin/activate"
echo "  sudo ./scripts/stop-router.sh"
echo "  python3 linux/unoq_adc_infer.py --model modelfile.eim --port /dev/ttyHS1 --baud 2000000 --frame-samples 512 --window-samples 11025 --adc-bits 12 --center"
echo
echo "Optional web UI:"
echo "  ./run_server.sh --host 0.0.0.0 --port 8080"

#!/usr/bin/env bash
set -euo pipefail

# Host setup for Qualcomm Rubik Pi (Ubuntu) acceleration.
# This script prepares Docker + common dependencies and wires QNN runtime env vars.
# It does not install proprietary SDKs; it discovers existing QAIRT/QNN installs.

QNN_BASE_DEFAULT="/opt/qcom/aistack/qairt"
QNN_BASE="${QNN_BASE:-$QNN_BASE_DEFAULT}"
INSTALL_EDGE_IMPULSE_RUNNER="${INSTALL_EDGE_IMPULSE_RUNNER:-0}"

echo "[1/7] Checking host..."
if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported OS: /etc/os-release not found"
  exit 1
fi
source /etc/os-release
echo "Detected: ${PRETTY_NAME:-unknown}"
echo "QNN base path: $QNN_BASE"

echo "[2/7] Installing base packages..."
sudo apt-get update
sudo apt-get install -y \
  curl ca-certificates git jq python3 python3-pip \
  gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav

echo "[3/7] Ensuring Docker is installed..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "[4/7] Detecting QAIRT/QNN runtime..."
if [[ ! -d "$QNN_BASE" ]]; then
  echo "QAIRT base not found at $QNN_BASE"
  echo "Install Qualcomm AI runtime first, then re-run."
  echo "You can override path with: QNN_BASE=/path/to/qairt bash scripts/setup-rubikpi-qnn-accel.sh"
  exit 1
fi

QNN_ROOT="$(find "$QNN_BASE" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
if [[ -z "${QNN_ROOT:-}" ]]; then
  echo "No version directory found under $QNN_BASE"
  exit 1
fi
echo "Using QNN root: $QNN_ROOT"

echo "[5/7] Writing runtime profile..."
sudo tee /etc/profile.d/qnn.sh >/dev/null <<EOF
export QNN_SDK_ROOT="$QNN_ROOT"
export PATH="\$QNN_SDK_ROOT/bin:\$PATH"
export LD_LIBRARY_PATH="\$QNN_SDK_ROOT/lib/aarch64-ubuntu-gcc:\$LD_LIBRARY_PATH"
EOF

echo "[6/7] Running optional Qualcomm dependency checks..."
if [[ -x "$QNN_ROOT/bin/check-linux-dependency.sh" ]]; then
  sudo bash "$QNN_ROOT/bin/check-linux-dependency.sh" || true
fi
if [[ -x "$QNN_ROOT/bin/check-python-dependency" ]]; then
  "$QNN_ROOT/bin/check-python-dependency" || true
fi

echo "[7/7] Optional Edge Impulse Linux runner setup..."
if [[ "$INSTALL_EDGE_IMPULSE_RUNNER" == "1" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    sudo apt-get install -y nodejs npm
  fi
  sudo npm install -g edge-impulse-linux
fi

echo "Done. Rubik Pi acceleration environment prepared."
echo "Open a new shell, then verify:"
echo "  echo \$QNN_SDK_ROOT"
echo "  ls \$QNN_SDK_ROOT/lib/aarch64-ubuntu-gcc"
echo "  docker --version"
echo "  edge-impulse-linux-runner --help   # if installed"

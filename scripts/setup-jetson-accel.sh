#!/usr/bin/env bash
set -euo pipefail

# Host setup for NVIDIA Jetson (Ubuntu) hardware acceleration with Docker.
# Safe to re-run.

echo "[1/7] Checking host..."
if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported OS: /etc/os-release not found"
  exit 1
fi
source /etc/os-release
echo "Detected: ${PRETTY_NAME:-unknown}"

if [[ ! -f /etc/nv_tegra_release ]] && ! uname -a | grep -qi tegra; then
  echo "Warning: This host does not look like a Jetson board."
fi

echo "[2/7] Installing base packages..."
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release

echo "[3/7] Ensuring Docker is installed..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "[4/7] Installing NVIDIA Container Toolkit repository..."
if [[ ! -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg ]]; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
fi

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null

echo "[5/7] Installing and configuring NVIDIA Container Toolkit..."
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

echo "[6/7] Verifying runtime configuration..."
if command -v jq >/dev/null 2>&1; then
  sudo cat /etc/docker/daemon.json | jq .
else
  sudo cat /etc/docker/daemon.json
fi

echo "[7/7] Running basic GPU container checks..."
set +e
sudo docker run --rm --runtime=nvidia --gpus all ubuntu:22.04 bash -lc 'echo "NVIDIA runtime OK (gpus all)"'
rc1=$?
sudo docker run --rm --runtime=nvidia ubuntu:22.04 bash -lc 'echo "NVIDIA runtime OK (default runtime path)"'
rc2=$?
set -e

if [[ "$rc1" -ne 0 && "$rc2" -ne 0 ]]; then
  echo "NVIDIA runtime checks failed."
  echo "Check JetPack/driver install, then re-run this script."
  exit 1
fi

echo "Done. Jetson Docker acceleration is configured."
echo "Log out/in once so docker group membership applies."

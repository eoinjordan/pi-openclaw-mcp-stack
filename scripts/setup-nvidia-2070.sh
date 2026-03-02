#!/usr/bin/env bash
set -euo pipefail

# WSL2 + NVIDIA (RTX 2070) + Docker Desktop GPU acceleration setup/verification
# Safe to re-run. Designed for: Ubuntu on WSL2 with Docker Desktop (WSL2 backend).
#
# What it does:
#  - Verifies you're in WSL2
#  - Verifies GPU plumbing (/dev/dxg, nvidia-smi)
#  - Verifies Docker Desktop integration (docker CLI + server reachable)
#  - Runs a CUDA container nvidia-smi test using --gpus all
#
# What it does NOT do:
#  - Install nvidia-container-toolkit (not recommended for Docker Desktop + WSL2)
#  - Install Docker Engine inside WSL (Docker Desktop provides the engine)

echo "[1/8] Checking environment..."
if ! grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null; then
  echo "ERROR: This does not look like WSL. /proc/version does not mention Microsoft/WSL."
  exit 1
fi
echo "OK: Running under WSL."

# Detect WSL version (WSL2 typically exposes /dev/dxg)
echo "[2/8] Checking WSL2 GPU device (/dev/dxg)..."
if [[ ! -e /dev/dxg ]]; then
  echo "ERROR: /dev/dxg not found."
  echo "This usually means:"
  echo "  - You're on WSL1, or"
  echo "  - WSL GPU support isn't active, or"
  echo "  - Windows NVIDIA driver/WSL components aren't correctly installed."
  echo
  echo "Fix on Windows (PowerShell):"
  echo "  wsl -l -v"
  echo "  wsl --set-version <YourUbuntuName> 2"
  echo "  wsl --shutdown"
  exit 1
fi
ls -l /dev/dxg

echo "[3/8] Checking NVIDIA userland tooling in WSL..."
if [[ ! -x /usr/lib/wsl/lib/nvidia-smi ]]; then
  echo "ERROR: /usr/lib/wsl/lib/nvidia-smi not found or not executable."
  echo "This indicates the Windows-side NVIDIA WSL driver path isn't available in this distro."
  echo "Fix: install/update the NVIDIA Windows driver that supports CUDA on WSL, then:"
  echo "  wsl --shutdown"
  exit 1
fi

/usr/lib/wsl/lib/nvidia-smi || true

echo "[4/8] Ensuring base packages (optional, lightweight)..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git jq >/dev/null 2>&1 || sudo apt-get install -y ca-certificates curl git >/dev/null 2>&1

echo "[5/8] Checking Docker CLI availability in WSL..."
if ! command -v docker >/dev/null 2>&1; then
  echo "WARN: docker CLI not found in this WSL distro."
  echo "Docker Desktop usually injects the docker CLI when WSL Integration is enabled,"
  echo "but if it isn't present, install docker-ce-cli (client only)."
  echo
  echo "Installing docker-ce-cli..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce-cli docker-compose-plugin
fi

echo "[6/8] Verifying Docker Desktop engine reachability..."
set +e
docker version >/tmp/docker_version.txt 2>&1
rc=$?
set -e
if [[ "$rc" -ne 0 ]]; then
  echo "ERROR: Docker CLI cannot reach a Docker engine from WSL."
  echo "Common fixes:"
  echo "  - Start Docker Desktop"
  echo "  - Docker Desktop Settings -> General: 'Use the WSL 2 based engine' ON"
  echo "  - Docker Desktop Settings -> Resources -> WSL Integration: enable Ubuntu"
  echo "  - Then run (PowerShell): wsl --shutdown"
  echo
  echo "Docker output:"
  cat /tmp/docker_version.txt
  exit 1
fi
cat /tmp/docker_version.txt

echo "[7/8] Running GPU container checks (Docker Desktop + WSL2 path)..."
# Prefer a CUDA base image; use --gpus all (no --runtime=nvidia on Docker Desktop)
set +e
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi >/tmp/gpu_test.txt 2>&1
rc=$?
set -e

if [[ "$rc" -ne 0 ]]; then
  echo "ERROR: GPU container test failed."
  echo "Output:"
  cat /tmp/gpu_test.txt
  echo
  echo "Most common causes/fixes:"
  echo "  - Docker Desktop GPU support not active or outdated -> update Docker Desktop"
  echo "  - Windows NVIDIA driver not WSL-CUDA capable -> update NVIDIA Windows driver"
  echo "  - WSL needs restart -> (PowerShell) wsl --shutdown"
  echo
  echo "Note: Do NOT install nvidia-container-toolkit in this setup unless you're running a native Linux Docker Engine."
  exit 1
fi

cat /tmp/gpu_test.txt

echo "[8/8] Done."
echo "OK: WSL2 GPU is visible and Docker can run GPU-accelerated containers."
echo
echo "Next steps:"
echo "  - Use Docker Compose profiles in your repo as-is (mcp-image/mcp-local/mcp)."
echo "  - If you run Kubernetes locally, prefer k3d for dev clusters; GPU-in-K8s on Windows/WSL is possible but higher-friction."
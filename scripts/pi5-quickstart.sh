#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-mcp-image}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$MODE" in
  mcp|mcp-local|mcp-image) ;;
  *)
    echo "Invalid mode: $MODE"
    echo "Usage: bash scripts/pi5-quickstart.sh [mcp|mcp-local|mcp-image]"
    exit 1
    ;;
esac

cd "$ROOT_DIR"

if [[ ! -f "docker-compose.yml" ]]; then
  echo "Run this from the pi-openclaw-mcp-stack repo."
  exit 1
fi

echo "[1/5] Installing Docker + Compose prerequisites..."
sudo apt-get update
sudo apt-get install -y docker.io docker-buildx-plugin docker-compose-plugin curl ca-certificates
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

if [[ ! -f ".env" ]]; then
  echo "[2/5] Creating .env from .env.example..."
  cp .env.example .env
fi

echo "[3/5] Ensuring only one EI bridge profile is active..."
sudo docker compose stop ei-mcp-bridge ei-mcp-bridge-local ei-mcp-bridge-image >/dev/null 2>&1 || true

echo "[4/5] Starting stack with mode: $MODE"
sudo docker compose --profile "$MODE" up -d --build

echo "[5/5] Health checks..."
curl -fsS http://127.0.0.1:3000/health
echo
curl -fsS http://127.0.0.1:3000/health/upstreams || true
echo

if grep -q "REPLACE_ME" .env; then
  echo
  echo "Update .env before full use:"
  echo "- TELEGRAM_TOKEN"
  echo "- EI_API_KEY"
  echo "- optional OPENAI_API_KEY"
fi

echo
echo "Done. Stack started in mode: $MODE"
echo "Tip: log out/in once so docker group applies, then you can run docker without sudo."

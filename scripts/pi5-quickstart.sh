#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-mcp-image}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_TYPE=""

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

install_optional_package() {
  local pkg="$1"
  if sudo apt-get install -y "$pkg"; then
    return 0
  fi
  return 1
}

detect_compose() {
  if sudo docker compose version >/dev/null 2>&1; then
    COMPOSE_TYPE="docker-compose-v2"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_TYPE="docker-compose-v1"
    return 0
  fi
  return 1
}

compose_cmd() {
  if [[ "$COMPOSE_TYPE" == "docker-compose-v2" ]]; then
    sudo docker compose "$@"
  else
    sudo docker-compose "$@"
  fi
}

active_bridge_service() {
  case "$MODE" in
    mcp-image) echo "ei-mcp-bridge-image" ;;
    mcp-local) echo "ei-mcp-bridge-local" ;;
    mcp) echo "ei-mcp-bridge" ;;
  esac
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-45}"
  local delay_s="${4:-2}"
  local i

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_s"
  done

  echo "Timed out waiting for $name at $url"
  return 1
}

echo "[1/7] Installing Docker base packages..."
sudo apt-get update
sudo apt-get install -y docker.io curl ca-certificates
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "[2/7] Installing Compose plugin fallback chain..."
if ! detect_compose; then
  install_optional_package docker-compose-plugin || true
  install_optional_package docker-compose-v2 || true
  install_optional_package docker-compose || true
fi

if ! detect_compose; then
  echo "ERROR: Could not install Docker Compose."
  echo "Tried: docker-compose-plugin, docker-compose-v2, docker-compose"
  echo "Use docs/pi5-setup.md for the official Docker repository method."
  exit 1
fi
echo "Compose detected: $COMPOSE_TYPE"

echo "[3/7] Installing Buildx plugin fallback chain..."
if ! sudo docker buildx version >/dev/null 2>&1; then
  install_optional_package docker-buildx-plugin || true
  install_optional_package docker-buildx || true
fi
if sudo docker buildx version >/dev/null 2>&1; then
  echo "Buildx detected."
else
  echo "Buildx not found. Continuing (compose may still work without it)."
fi

if [[ ! -f ".env" ]]; then
  echo "[4/7] Creating .env from .env.example..."
  cp .env.example .env
fi

echo "[5/7] Ensuring only one EI bridge profile is active..."
compose_cmd stop ei-mcp-bridge ei-mcp-bridge-local ei-mcp-bridge-image >/dev/null 2>&1 || true

echo "[6/7] Starting stack with mode: $MODE"
compose_cmd --profile "$MODE" up -d --build

echo "[7/7] Waiting for services and running health checks..."
if ! wait_for_http "gateway" "http://127.0.0.1:3000/health" 60 2; then
  BRIDGE_SERVICE="$(active_bridge_service)"
  echo
  echo "Gateway did not become ready in time. Snapshot:"
  compose_cmd --profile "$MODE" ps || true
  echo
  echo "Recent logs:"
  compose_cmd --profile "$MODE" logs --tail 80 gateway || true
  compose_cmd --profile "$MODE" logs --tail 80 clawdbot || true
  compose_cmd --profile "$MODE" logs --tail 80 arduino-mcp || true
  compose_cmd --profile "$MODE" logs --tail 120 "$BRIDGE_SERVICE" || true
  echo
  echo "Retry commands:"
  echo "  docker compose --profile $MODE up -d --build"
  echo "  docker compose --profile $MODE ps"
  echo "  docker compose --profile $MODE logs --tail 120 gateway"
  exit 1
fi

curl -fsS http://127.0.0.1:3000/health
echo
curl -fsS http://127.0.0.1:3000/health/upstreams || true
echo

if grep -q "REPLACE_ME" .env; then
  echo
  echo "Update .env before full use:"
  echo "- TELEGRAM_TOKEN"
  echo "- EI_API_KEY"
  echo "- optional OPENAI_API_KEY (remote) or OPENAI_BASE_URL (local Ollama)"
fi

echo
echo "Done. Stack started in mode: $MODE"
echo "Tip: log out/in once so docker group applies, then you can run docker without sudo."

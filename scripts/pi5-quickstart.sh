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

ensure_blink_example() {
  local sketch_dir="$ROOT_DIR/workspace/Arduino/Blink"
  local sketch_file="$sketch_dir/Blink.ino"
  if [[ -f "$sketch_file" ]]; then
    return 0
  fi
  mkdir -p "$sketch_dir"
  cat > "$sketch_file" <<'EOF'
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
}
EOF
  echo "Created default sketch at $sketch_file"
}

ensure_ei_mcp_base_image() {
  if [[ "$MODE" != "mcp-image" ]]; then
    return 0
  fi

  local configured
  local fallback="docker.io/eoinedge/ei-agentic-claude-mcp:test"
  configured="$(grep -E '^EI_MCP_BASE_IMAGE=' .env | tail -n1 | cut -d= -f2- || true)"
  configured="${configured:-$fallback}"

  if sudo docker manifest inspect "$configured" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$configured" != "$fallback" ]] && sudo docker manifest inspect "$fallback" >/dev/null 2>&1; then
    echo "Configured EI_MCP_BASE_IMAGE not found: $configured"
    echo "Switching to fallback: $fallback"
    if grep -q '^EI_MCP_BASE_IMAGE=' .env; then
      sed -i "s|^EI_MCP_BASE_IMAGE=.*|EI_MCP_BASE_IMAGE=$fallback|" .env
    else
      echo "EI_MCP_BASE_IMAGE=$fallback" >> .env
    fi
    return 0
  fi

  echo "ERROR: Could not resolve EI MCP base image."
  echo "Checked: $configured"
  echo "Fallback also missing: $fallback"
  echo "Set EI_MCP_BASE_IMAGE in .env to a valid tag and re-run."
  return 1
}

upsert_env_line() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

sync_from_ei_agentic_env_test() {
  local configured
  configured="${EI_AGENTIC_ENV_TEST_PATH:-}"
  if [[ -z "$configured" ]]; then
    configured="$(grep -E '^EI_AGENTIC_ENV_TEST_PATH=' .env | tail -n1 | cut -d= -f2- || true)"
  fi
  if [[ -z "$configured" ]]; then
    return 0
  fi
  if [[ ! -f "$configured" ]]; then
    echo "EI_AGENTIC_ENV_TEST_PATH is set but file not found: $configured"
    return 1
  fi

  local imported=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    if [[ "$key" =~ ^(ANTHROPIC_API_KEY|EI_API_KEY|EI_ORG_API_KEY|EI_ORG_ID|EI_PROJECT_ID|EI_RUN_TRAINING|DSP_BLOCK_IDS|LEARN_BLOCK_IDS|EI_IMPULSE_ID|PROJECT_[A-Za-z0-9_]+_(ID|URL))$ ]]; then
      upsert_env_line "$key" "$value"
      imported=$((imported + 1))
    fi
  done < "$configured"

  if [[ "$imported" -gt 0 ]]; then
    echo "Imported $imported key(s) from $configured into .env"
  else
    echo "No matching EI keys found in $configured"
  fi
}

echo "[1/10] Installing Docker base packages..."
sudo apt-get update
sudo apt-get install -y docker.io curl ca-certificates
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "[2/10] Installing Compose plugin fallback chain..."
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

echo "[3/10] Installing Buildx plugin fallback chain..."
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
  echo "[4/10] Creating .env from .env.example..."
  cp .env.example .env
fi

echo "[5/10] Syncing optional ei-agentic-claude .env.test keys..."
sync_from_ei_agentic_env_test

echo "[6/10] Ensuring default Arduino sketch exists..."
ensure_blink_example

echo "[7/10] Ensuring EI MCP base image is reachable..."
ensure_ei_mcp_base_image

echo "[8/10] Ensuring only one EI bridge profile is active..."
compose_cmd stop ei-mcp-bridge ei-mcp-bridge-local ei-mcp-bridge-image >/dev/null 2>&1 || true

echo "[9/10] Starting stack with mode: $MODE"
compose_cmd --profile "$MODE" up -d --build

echo "[10/10] Waiting for services and running health checks..."
BRIDGE_SERVICE="$(active_bridge_service)"
if ! wait_for_http "gateway" "http://127.0.0.1:3000/health" 60 2; then
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
if ! wait_for_http "gateway upstreams" "http://127.0.0.1:3000/health/upstreams" 180 2; then
  echo "Upstreams are still warming up (common on first boot while Arduino core installs)."
  echo "You can watch progress with:"
  echo "  docker compose --profile $MODE logs -f arduino-mcp"
  echo "  docker compose --profile $MODE logs --tail 120 $BRIDGE_SERVICE"
  echo "  curl -s http://127.0.0.1:3000/health/upstreams"
else
  curl -fsS http://127.0.0.1:3000/health/upstreams
fi
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

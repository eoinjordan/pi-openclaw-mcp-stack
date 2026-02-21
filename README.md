pi-openclaw-mcp-stack
====================

What this is
------------
A Raspberry Pi stack that runs:
- openclaw-gateway (HTTP proxy) on port 3000
- clawdbot (Telegram bot) that can call the gateway
You run Arduino MCP and Edge Impulse MCP as separate containers (or on the host),
and point the gateway at them via env vars.

Prereqs
-------
- Docker Engine
- Docker Compose v2
- Docker buildx plugin (compose build requires buildx)

Install plugins (Ubuntu/Debian):
--------------------------------
sudo apt-get update
sudo apt-get install -y docker-buildx-plugin docker-compose-plugin
docker buildx version
docker compose version

Configure
---------
Copy example env file to .env and set secrets:
cp .env.example .env

Bring up gateway + bot
----------------------
docker compose build
docker compose up -d
docker compose ps

Test gateway health:
-------------------
curl -s http://127.0.0.1:3000/health

Arduino MCP (separate container)
--------------------------------
This starts arduino-claude-mcp on port 3080 and sets default board to Nano 33 BLE:

docker rm -f arduino-mcp 2>/dev/null || true
mkdir -p ~/Arduino ~/.arduino15

docker run -d \
  --name arduino-mcp \
  --restart unless-stopped \
  --network host \
  -e PORT=3080 \
  -e ARDUINO_FQBN=arduino:mbed_nano:nano33ble \
  -v ~/Arduino:/workspace \
  -v ~/.arduino15:/root/.arduino15 \
  node:20-bookworm-slim \
  bash -lc 'npm i -g arduino-claude-mcp && node $(npm root -g)/arduino-claude-mcp/dist/index.js'

Test Arduino MCP:
-----------------
curl -s http://127.0.0.1:3080/health

Validate a sketch:
------------------
curl -sS -X POST http://127.0.0.1:3080/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'

Build a sketch:
---------------
curl -sS -X POST http://127.0.0.1:3080/build \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'

Telegram bot usage
------------------
Send message:
- build arduino

Other messages are forwarded to OpenAI chat (requires OPENAI_API_KEY).

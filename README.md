pi-openclaw-mcp-stack
====================

What this is
------------
A Raspberry Pi 5 stack (Raspberry Pi OS / Raspbian, not Ubuntu) that runs:
- openclaw-gateway (HTTP proxy) on port 3000
- clawdbot (Telegram bot) that can call the gateway
You run Arduino MCP and Edge Impulse MCP as separate containers (or on the host),
and point the gateway at them via env vars.
Together, Arduino MCP + EI MCP provide a clean path to build and deploy custom
Nano 33 BLE firmware from an Edge Impulse impulse.

Tested on
---------
- Raspberry Pi 5
- Raspberry Pi OS 64-bit (Bookworm)
- Default user is typically `pi` (not `ubuntu`)

Alignment with ei-agentic-claude
--------------------------------
- `ei-agentic-claude` runs an MCP server over stdio. This stack expects HTTP upstreams.
- To align them, run an HTTP bridge in front of the MCP server (or use your existing OpenClaw
  gateway on desktop), and set `EI_MCP` in `.env` to that HTTP URL.
- If the EI MCP server runs on another machine, just point `EI_MCP` at that host/IP.

Prereqs
-------
- Docker Engine
- Docker Compose v2
- Docker buildx plugin (compose build requires buildx)

Install plugins (Raspberry Pi OS / Debian):
-------------------------------------------
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
sudo apt-get install -y docker-buildx-plugin docker-compose-plugin
docker buildx version
docker compose version

Quick start (Pi 5)
------------------
1) Clone this repo onto the Pi
2) Copy `.env.example` to `.env` and set `TELEGRAM_TOKEN`
   - Set `OPENAI_API_KEY` if you want chat replies for non-command messages
3) Log out/in (or run `newgrp docker`) so the docker group applies
4) Start the services:

docker compose build
docker compose up -d
docker compose ps

Test gateway health:
-------------------
curl -s http://127.0.0.1:3000/health

Edge Impulse MCP (HTTP bridge)
------------------------------
This repo includes a small HTTP bridge that wraps the `ei-agentic-claude` MCP server
and exposes a simple `/run` endpoint. It runs on port `8090` by default.
The bridge image installs `ei-agentic-claude` from npm. If you want to use a local
build instead, set `EI_MCP_CMD` to your path and rebuild the image.

Start it with the MCP profile:

docker compose --profile mcp up -d ei-mcp-bridge

Verify:

curl -s http://127.0.0.1:8090/health

Payload format for `/ei/run` (gateway -> bridge):
- `name` (string, required): MCP tool name (e.g. `list_active_projects`)
- `params` (object, optional): tool params
- `apiKey` (string, optional): Edge Impulse API key (omit if `EI_API_KEY` is set in `.env`)

Example (direct to bridge):

curl -sS -X POST http://127.0.0.1:8090/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_active_projects","params":{},"apiKey":"ei_XXX"}'

Example (via gateway):

curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_active_projects","params":{},"apiKey":"ei_XXX"}'

End-to-end: EI impulse -> Nano 33 BLE firmware
---------------------------------------------
This is the clean path when Arduino MCP and EI MCP are both running (via the `mcp` profile).

1) Use EI MCP to build the Arduino deployment:

curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"build_on_device_model","params":{"projectId":123,"type":"arduino","impulseId":1,"engine":"tflite-eon","modelType":"int8"}}'

2) Poll job status until it completes:

curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_job_status_openapi_b8230c81","params":{"projectId":123,"jobId":456}}'

3) Download the deployment ZIP from Edge Impulse (see the build response for version):

curl.exe -L -H "x-api-key: ei_XXX" -o outputs/ei_arduino_deployment.zip \
  "https://studio.edgeimpulse.com/v1/api/123/deployment/history/7/download"

4) Import the ZIP in Arduino IDE and build your sketch (Nano 33 BLE):
- Arduino IDE -> `Sketch` -> `Include Library` -> `Add .ZIP Library...`
- Open your sketch, select board **Arduino Nano 33 BLE**, build and upload

5) (Optional) Use Arduino MCP to validate/build your sketch in CI:

curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/MySketch"}'

Ports
-----
- `3000` gateway HTTP
- `3080` Arduino MCP (if running on the Pi)
- `8090` Edge Impulse MCP HTTP bridge (if running on the Pi)

Environment
-----------
- `TELEGRAM_TOKEN` required
- `OPENAI_API_KEY` optional (enables chat responses)
- `EI_API_KEY` optional (used by EI MCP bridge if `apiKey` not supplied per request)
- `EI_MCP_CMD` optional (override MCP server path/command for the bridge)
- `ARDUINO_MCP` / `EI_MCP` upstream URLs
- `DEFAULT_ARDUINO_PROJECT_ROOT` for the `build/validate arduino` commands

Networking note
---------------
The compose file uses `network_mode: host`, so services bind directly to the Pi's
host network. If you need container-isolated networking, remove `network_mode`
and add explicit `ports:` mappings.

Audit & Observability
---------------------
Use these commands to trace requests through the stack (gateway -> MCP bridge -> MCP server -> upstream APIs).

Flow map (commands -> APIs)
---------------------------
Telegram -> `clawdbot` -> `openclaw-gateway`
- Arduino path: `/arduino/validate|build` -> `arduino-mcp` -> Arduino CLI/tooling
- EI path: `/ei/run` -> `ei-mcp-bridge` -> `ei-agentic-claude` -> Edge Impulse API

1) Check containers and status:

docker compose ps
docker compose --profile mcp ps

2) Tail logs by service:

docker logs -f openclaw-gateway
docker logs -f clawdbot
docker logs -f ei-mcp-bridge
docker logs -f arduino-mcp

3) Health checks:

curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3080/health

4) Minimal trace of an EI MCP call (gateway -> bridge -> EI MCP):

curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_active_projects","params":{}}'

Expected logging:
- `openclaw-gateway`: incoming `/ei/run` request
- `ei-mcp-bridge`: `/run` call and `MCP_CMD` startup
- `ei-agentic-claude` (inside bridge): `[mcp] call ...` / `[mcp] ok ...` (enable with `EI_MCP_VERBOSE=1`)

5) Minimal trace of an Arduino MCP call (gateway -> Arduino MCP):

curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'

Arduino MCP (separate container)
--------------------------------
Option A (recommended): use the compose profile

docker compose --profile mcp up -d arduino-mcp

This uses local folders:
- `./workspace/Arduino` (sketches)
- `./workspace/.arduino15` (Arduino cache)

Option B: run the container manually

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
- help
- health
- validate arduino
- build arduino

If `OPENAI_API_KEY` is set, other messages are forwarded to OpenAI chat.

Channels & LLM options
----------------------
This repo was used with Telegram and Anthropic, but you can swap both sides:
- Channels: Telegram, WhatsApp (via OpenClaw), Slack, Discord, SMS (Twilio), Matrix, Signal, or simple webhooks.
- LLMs: Anthropic, OpenAI, local models (Ollama), or routing layers (OpenRouter).

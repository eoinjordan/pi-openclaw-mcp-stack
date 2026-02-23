pi-openclaw-mcp-stack
====================

What this is
------------
A Raspberry Pi 5 stack (Raspberry Pi OS / Raspbian) that runs:
- openclaw-gateway (HTTP proxy) on port 3000
- clawdbot (Telegram bot) that can call the gateway
You run Arduino MCP and Edge Impulse MCP as separate containers (or on the host),
and point the gateway at them via env vars.
Together, Arduino MCP + EI MCP provide a clean path to build and deploy custom
Nano 33 BLE firmware from an Edge Impulse project.

Tested on
---------
- Raspberry Pi 5
- Raspberry Pi OS 64-bit (Bookworm)
- Default user is typically `pi` (not `ubuntu`)

Target runtime
--------------
- Production target is Raspberry Pi 5 (`linux/arm64`).
- Windows/macOS Docker Desktop runs are useful for flow validation, but images built there are typically `amd64`.

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

docker compose --profile mcp up -d --build
docker compose --profile mcp ps

Test gateway health:
-------------------
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams

Fresh Pi setup (step by step)
-----------------------------
These steps assume a brand-new Raspberry Pi OS 64-bit install.

1) Update packages:

sudo apt-get update
sudo apt-get upgrade -y

2) Install Docker + Compose:

sudo apt-get install -y docker.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

3) Clone this repo:

git clone https://github.com/eoinjordan/pi-openclaw-mcp-stack.git
cd pi-openclaw-mcp-stack

4) Configure env:

cp .env.example .env
nano .env

Required:
- `TELEGRAM_TOKEN`
- `EI_API_KEY` (for EI MCP)

Optional:
- `OPENAI_API_KEY` (chat replies)
- `EI_JWT_TOKEN` (Edge Impulse JWT auth)

5) Start everything:

docker compose --profile mcp up -d --build

If you want to use your local `ei-agentic-claude` checkout instead of npm:

docker compose --profile mcp-local up -d --build

If you want to use a prebuilt `ei-agentic-claude-mcp:latest` image:

docker compose --profile mcp-image up -d --build

6) Verify:

docker compose --profile mcp ps
docker compose --profile mcp-local ps
docker compose --profile mcp-image ps
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3080/health

Edge Impulse MCP (HTTP bridge)
------------------------------
This repo includes a small HTTP bridge that wraps the `ei-agentic-claude` MCP server
and exposes a simple `/run` endpoint. It runs on port `8090` by default.
Default profile:
- `mcp`: bridge installs `ei-agentic-claude` from npm.

Local profile:
- `mcp-local`: bridge mounts your local `ei-agentic-claude` repo path and runs `dist/mcp-server.js`.

Prebuilt image profile:
- `mcp-image`: bridge runs MCP from `ei-agentic-claude-mcp:latest` (or `EI_MCP_BASE_IMAGE`).
- Use only one bridge profile at a time (`mcp`, `mcp-local`, or `mcp-image`) on Raspberry Pi host networking.

Start it with the MCP profile:

docker compose --profile mcp up -d ei-mcp-bridge

Verify:

curl -s http://127.0.0.1:8090/health

Use local `ei-agentic-claude` repo
----------------------------------
If you already have this repo locally:
- `C:\Users\Eoin\Downloads\ei-agentic-claude` (Windows host)
- `/home/pi/ei-agentic-claude` (Pi host)

1) Build `ei-agentic-claude` first:

cd /home/pi/ei-agentic-claude
npm install
npm run build

2) Set path in this stack `.env`:

EI_AGENTIC_CLAUDE_PATH=/home/pi/ei-agentic-claude

3) Start local profile:

cd /home/pi/pi-openclaw-mcp-stack
docker compose stop ei-mcp-bridge
docker compose --profile mcp-local up -d --build

4) Verify bridge is running your local checkout:

docker logs --tail 50 ei-mcp-bridge-local
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3000/health/upstreams

Use prebuilt `ei-agentic-claude-mcp` image
------------------------------------------
If you already have (or pull/build) `ei-agentic-claude-mcp:latest`, use:

docker compose stop ei-mcp-bridge ei-mcp-bridge-local
docker compose --profile mcp-image up -d --build

Verify:

docker logs --tail 50 ei-mcp-bridge-image
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3000/health/upstreams

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

mkdir -p outputs
curl -L -H "x-api-key: ei_XXX" -o outputs/ei_arduino_deployment.zip \
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
- `EI_MCP_BIN` / `EI_MCP_ARGS` optional (safer command override pair for the bridge)
- `EI_MCP_REQUEST_TIMEOUT_MS` optional (per-request bridge timeout)
- `EI_AGENTIC_CLAUDE_PATH` optional (host path used by `mcp-local` profile)
- `EI_MCP_BIN_LOCAL` / `EI_MCP_ARGS_LOCAL` optional (command for `mcp-local`)
- `EI_MCP_BASE_IMAGE` optional (base image for `mcp-image` profile)
- `EI_MCP_BIN_IMAGE` / `EI_MCP_ARGS_IMAGE` optional (command for `mcp-image`)
- `EI_MCP_LOG_REQUESTS` optional (log bridge requests)
- `ARDUINO_MCP` / `EI_MCP` upstream URLs
- `DEFAULT_ARDUINO_PROJECT_ROOT` for the `build/validate arduino` commands
- `GATEWAY_LOG_REQUESTS` optional (log gateway requests)

Networking note
---------------
The compose file uses `network_mode: host`, so services bind directly to the Pi's
host network. If you need container-isolated networking, remove `network_mode`
and add explicit `ports:` mappings.
On Docker Desktop (Windows/macOS), `network_mode: host` does not expose ports on
`127.0.0.1`. For local testing there, either add `ports:` or call health checks
from inside the containers (see the Audit section).

Audit & Observability
---------------------
Use these commands to trace requests through the stack (gateway -> MCP bridge -> MCP server -> upstream APIs).

Flow map (commands -> APIs)
---------------------------
Telegram -> `clawdbot` -> `openclaw-gateway`
- Arduino path: `/arduino/validate|build` -> `arduino-mcp` -> Arduino CLI/tooling
- EI path: `/ei/run` -> `ei-mcp-bridge` (or `ei-mcp-bridge-local` / `ei-mcp-bridge-image`) -> `ei-agentic-claude` -> Edge Impulse API

1) Check containers and status:

docker compose ps
docker compose --profile mcp ps

2) Tail logs by service:

docker logs -f openclaw-gateway
docker logs -f clawdbot
docker logs -f ei-mcp-bridge
docker logs -f ei-mcp-bridge-local
docker logs -f ei-mcp-bridge-image
docker logs -f arduino-mcp

3) Health checks:

curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3080/health

If you are on Docker Desktop (Windows/macOS), use container-local checks:

docker exec openclaw-gateway node -e "require('http').get('http://127.0.0.1:3000/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec openclaw-gateway node -e "require('http').get('http://127.0.0.1:3000/health/upstreams',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec ei-mcp-bridge node -e "require('http').get('http://127.0.0.1:8090/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec ei-mcp-bridge-local node -e "require('http').get('http://127.0.0.1:8090/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec ei-mcp-bridge-image node -e "require('http').get('http://127.0.0.1:8090/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec arduino-mcp node -e "require('http').get('http://127.0.0.1:3080/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"

4) Minimal trace of an EI MCP call (gateway -> bridge -> EI MCP):

curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_active_projects","params":{}}'

Expected logging:
- `openclaw-gateway`: incoming `/ei/run` request (enable with `GATEWAY_LOG_REQUESTS=1`)
- `ei-mcp-bridge`: `/run` call (enable with `EI_MCP_LOG_REQUESTS=1`) and `MCP_CMD` startup
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
This repo is wired for Telegram and OpenAI in `clawdbot`, and you can swap both sides:
- Channels: Telegram, WhatsApp (via OpenClaw), Slack, Discord, SMS (Twilio), Matrix, Signal, or simple webhooks.
- LLMs: OpenAI (current), Anthropic, local models (Ollama), or routing layers (OpenRouter).

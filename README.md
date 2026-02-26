# pi-openclaw-mcp-stack

Raspberry Pi 5 stack for running `clawdbot`, Arduino MCP, and Edge Impulse MCP together.

<img width="2864" height="1664" alt="pi-0-whatsapp-hero (1)" src="https://github.com/user-attachments/assets/ce8d2e59-b36a-486d-ab4b-0b41336094c7" />


## Choose Your Mode

| Mode | Best for | EI MCP source | Start command |
| --- | --- | --- | --- |
| `mcp-image` (Recommended) | New users, fastest setup | `docker.io/eoinedge/ei-agentic-claude-mcp:test` image | `docker compose --profile mcp-image up -d --build` |
| `mcp-local` | Developing `ei-agentic-claude` locally | Mounted repo path (`EI_AGENTIC_CLAUDE_PATH`) | `docker compose --profile mcp-local up -d --build` |
| `mcp` | No prebuilt MCP image | npm install inside bridge image | `docker compose --profile mcp up -d --build` |

Use only one EI bridge mode at a time (`mcp`, `mcp-local`, or `mcp-image`).
Arduino MCP uses prebuilt image `docker.io/eoinedge/arduino-mcp:latest` by default (`ARDUINO_MCP_IMAGE` in `.env`).

## Quickstart (Pi 5, New Users)

```bash
git clone https://github.com/eoinjordan/pi-openclaw-mcp-stack.git
cd pi-openclaw-mcp-stack
bash scripts/pi5-quickstart.sh mcp-image
```

Then set keys in `.env`:
- `TELEGRAM_TOKEN`
- `EI_API_KEY`
- optional: `OPENAI_API_KEY` (remote provider) or `OPENAI_BASE_URL` (local Ollama)

Re-run:

```bash
bash scripts/pi5-quickstart.sh mcp-image
```

### Reuse `ei-agentic-claude/.env.test` on Pi

This stack is designed to work with the official Edge Impulse MCP repo:
- `https://github.com/edgeimpulse/ei-agentic-claude`

If you already keep keys in `ei-agentic-claude/.env.test`, point the stack to it:

```bash
cd ~/pi-openclaw-mcp-stack
echo "EI_AGENTIC_ENV_TEST_PATH=$HOME/ei-agentic-claude/.env.test" >> .env
bash scripts/pi5-quickstart.sh mcp-image
```

The quickstart script imports these keys into stack `.env` when present:
- `ANTHROPIC_API_KEY`
- `EI_API_KEY`, `EI_ORG_API_KEY`, `EI_ORG_ID`, `EI_PROJECT_ID`, `EI_RUN_TRAINING`
- `PROJECT_*_ID`, `PROJECT_*_URL`
- `DSP_BLOCK_IDS`, `LEARN_BLOCK_IDS`, `EI_IMPULSE_ID`

### Reset Existing Environment (Already Setup)

Use this when you want to cleanly rebuild `.env` and re-apply settings from `ei-agentic-claude/.env.test`.

```bash
cd ~/pi-openclaw-mcp-stack
docker compose --profile mcp-image down --remove-orphans
cp .env .env.backup.$(date +%Y%m%d-%H%M%S)
cp .env.example .env
echo "EI_AGENTIC_ENV_TEST_PATH=$HOME/ei-agentic-claude/.env.test" >> .env
nano .env
```

Set/confirm at least:
- `TELEGRAM_TOKEN`
- `EI_RUN_TRAINING=1`

Rebuild and start:

```bash
bash scripts/pi5-quickstart.sh mcp-image
docker compose --profile mcp-image up -d --force-recreate
```

Optional hard reset (re-download Arduino core/tools on next run):

```bash
rm -rf ~/pi-openclaw-mcp-stack/workspace/.arduino15
mkdir -p ~/pi-openclaw-mcp-stack/workspace/.arduino15
```

Minimum values you should set in `ei-agentic-claude/.env.test` for project execution:
- `EI_API_KEY`
- `EI_PROJECT_ID`
- `EI_RUN_TRAINING=1` (enables write/post flows)

Verify:

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

If you are testing on Docker Desktop (Windows/macOS), `network_mode: host` does not expose `127.0.0.1:3000` on the host the same way as Pi/Linux.
Use in-container checks instead:

```bash
docker exec openclaw-gateway node -e "fetch('http://127.0.0.1:3000/health').then(async r=>console.log(r.status, await r.text()))"
docker exec openclaw-gateway node -e "fetch('http://127.0.0.1:3000/health/upstreams').then(async r=>console.log(r.status, await r.text()))"
```

## End-to-End Smoke Test

Run this after the stack is up:

```bash
cd ~/pi-openclaw-mcp-stack
docker compose --profile mcp-image ps
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
curl -s -X POST http://127.0.0.1:3000/arduino/validate -H "Content-Type: application/json" -d '{"projectRoot":"/workspace/Blink"}'
curl -s -X POST http://127.0.0.1:3000/arduino/build -H "Content-Type: application/json" -d '{"projectRoot":"/workspace/Blink"}'
```

Optional EI tool-chain checks:

```bash
# Account-level listing (JWT/HMAC mode)
curl -s -X POST http://127.0.0.1:3000/ei/run -H "Content-Type: application/json" -d '{"name":"get_current_user_projects","params":{}}'

# Project-level read (API key mode)
curl -s -X POST http://127.0.0.1:3000/ei/run -H "Content-Type: application/json" -d '{"name":"project_information","apiKey":"'"$EI_API_KEY"'","params":{"projectId":'"$EI_PROJECT_ID"'}}'
```

Notes:
- First `validate` / `build` can take several minutes on fresh installs (core/toolchain download + first compile).
- Default gateway/bot timeouts are set to 20 minutes (`ARDUINO_VALIDATE_TIMEOUT_MS`, `ARDUINO_BUILD_TIMEOUT_MS`).
- Arduino MCP compile timeout is also set to 20 minutes (`ARDUINO_COMPILE_TIMEOUT_MS`).
- If `health/upstreams` returns `degraded`, tail logs: `docker compose --profile mcp-image logs --tail 120 arduino-mcp ei-mcp-bridge-image`.

## Full Project To Flash Guide

For a new-user, step-by-step flow from Edge Impulse project config to Nano 33 BLE flash on Pi 5, use:
- `docs/pi5-ei-to-nano33ble.md`

Flash helper script:
- `scripts/flash-nano33ble.sh`

## Inference Prerequisite

If you use `inference led|servo` or `flash inference ...`, set the EI library header in `.env`:

```bash
HEADER="$(unzip -Z1 outputs/ei_arduino_deployment.zip | grep -m1 -E '_inferencing\.h$' | awk -F/ '{print $NF}')"
echo "Detected header: $HEADER"
sed -i "s|^EI_LIBRARY_HEADER_DEFAULT=.*|EI_LIBRARY_HEADER_DEFAULT=$HEADER|" .env
docker compose --profile mcp-image up -d --force-recreate gateway clawdbot
```

If `EI_LIBRARY_HEADER_DEFAULT` is still placeholder text, gateway will return `HTTP 400` for `/arduino/inference`.

## Start And Restart Commands

Run these from repo root (`~/pi-openclaw-mcp-stack`). Use one profile at a time.

Start selected mode:

```bash
docker compose --profile mcp-image up -d --build
# or
# docker compose --profile mcp-local up -d --build
# docker compose --profile mcp up -d --build
```

Restart everything in active mode:

```bash
docker compose --profile mcp-image restart
```

Restart individual services:

```bash
docker compose restart openclaw-gateway clawdbot
docker compose restart arduino-mcp
docker compose restart ei-mcp-bridge-image
```

Reload after `.env` changes:

```bash
docker compose --profile mcp-image up -d --force-recreate
```

Stop or remove stack:

```bash
docker compose --profile mcp-image stop
docker compose --profile mcp-image down
```

If first boot prints `curl: (7) Failed to connect to 127.0.0.1 port 3000`:

```bash
sudo systemctl enable --now docker
systemctl is-active docker
docker compose --profile mcp-image up -d --build
docker compose --profile mcp-image ps
docker compose --profile mcp-image logs --tail 120 gateway
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

Notes:
- On first run, startup can take longer while containers install dependencies.
- In `mcp-local` or `mcp` mode, replace `mcp-image` with your active profile.
- If `ei-mcp-bridge-image` shows `Restarting (127)` with repeated `No such file or directory`, set:
  - `EI_MCP_BASE_IMAGE=docker.io/eoinedge/ei-agentic-claude-mcp:test`
  - then run `docker compose --profile mcp-image up -d --build --force-recreate`
- If build fails with `docker.io/eoinedge/ei-agentic-claude-mcp:latest: not found`, use:
  - `EI_MCP_BASE_IMAGE=docker.io/eoinedge/ei-agentic-claude-mcp:test`

## Why this script exists

Some Raspberry Pi OS images do not include `docker-buildx-plugin` or `docker-compose-plugin` packages by name.
The quickstart script handles package fallbacks and prints a clear error path if Compose is still unavailable.

## Architecture at a glance

```text
Telegram -> clawdbot -> openclaw-gateway
                       |- /arduino/validate|build -> arduino-mcp
                       |- /arduino/example|inference|flash -> gateway local arduino-cli
                       |- /ei/run    -> ei-mcp-bridge* -> ei-agentic-claude MCP (stdio) -> Edge Impulse API
```

`ei-mcp-bridge*` is one of:
- `ei-mcp-bridge` (`mcp`)
- `ei-mcp-bridge-local` (`mcp-local`)
- `ei-mcp-bridge-image` (`mcp-image`)

## Production target

- Target: Raspberry Pi 5 (`linux/arm64`, Raspberry Pi OS 64-bit Bookworm).
- Windows/macOS Docker Desktop is useful for flow checks, but images there are typically `amd64`.
- Gateway now needs hardware access for flash workflow (`/dev` + workspace mounts). Restrict bot access to trusted users only.

## Detailed docs

- LLM docs index for this repo: `llms.txt`
- Pi setup and package fallback details: `docs/pi5-setup.md`
- Mode-specific setup (`mcp`, `mcp-local`, `mcp-image`): `docs/modes.md`
- Observability and flow tracing: `docs/observability.md`
- Architecture deep dive: `docs/architecture.md`
- EI to Nano 33 BLE deployment flow: `docs/ei-arduino-deploy.md`
- Full first-project to flash flow: `docs/pi5-ei-to-nano33ble.md`
- Local Ollama setup for Pi 5: `docs/ollama.md`
- Jetson + Rubik Pi hardware setup scripts: `docs/hardware-acceleration-host-setup.md`
- Kubernetes distributed deployment + hardware acceleration guide: `docs/kubernetes-distributed-acceleration.md`
- Edge Impulse docs index (for deployment and project settings): `https://docs.edgeimpulse.com/llms.txt`

## Telegram commands

- `help`
- `health`
- `example blink`
- `example servo [360] [on d12]`
- `inference led [label] [threshold]`
- `inference servo [label] [threshold] [360] [on d12]`
- `validate arduino`
- `build arduino`
- `flash arduino [/dev/ttyACM0]`
- `flash example blink|servo [360] [on d12] [/dev/ttyACM0]`
- `flash inference led|servo [label] [threshold] [360] [on d12] [/dev/ttyACM0]`
- `models`

If `OPENAI_API_KEY` is set, non-command messages are forwarded to OpenAI chat.
If using Ollama, set `OPENAI_MODEL` to an installed model (for example `qwen2.5:3b-instruct`).

## Telegram Bot Setup (BotFather)

1. In Telegram, open `@BotFather`.
2. Create bot:

```text
/newbot
```

3. Set a bot name and username (username must end with `bot`).
4. Copy the token from BotFather (`123456789:AA...`).
5. On Pi, set token in `.env`:

```bash
cd ~/pi-openclaw-mcp-stack
nano .env
```

```env
TELEGRAM_TOKEN=123456789:AA...
```

6. Optional command menu in Telegram:

```text
/setcommands
```

Paste:

```text
help - Show commands
health - Check stack health
example blink - Generate Blink sketch in default project
example servo - Generate Servo sketch (supports "360 on d12")
inference led - Generate EI inference sketch for LED output
inference servo - Generate EI inference sketch for servo output
validate arduino - Validate default sketch
build arduino - Build default sketch
flash arduino - Compile and upload default sketch
flash example - Generate and flash example sketch
flash inference - Generate and flash inference sketch
```

7. Restart and test:

```bash
docker compose restart clawdbot
docker logs --tail 100 clawdbot
```

Then in Telegram send:
- `/start`
- `help`
- `health`

## Local LLM (Ollama on Pi 5)

Install and run Ollama:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
ollama pull qwen2.5:3b-instruct
```

Set `.env` for local chat via OpenAI-compatible endpoint:

```env
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b-instruct
```

Then restart:

```bash
docker compose restart clawdbot
```

Check installed models:

```bash
ollama list
```

In Telegram, send `models` to verify what `clawdbot` sees.
If you see `no configuration file provided: not found`, run compose commands from the repo root:

```bash
cd ~/pi-openclaw-mcp-stack
```

## Built-in Codex Skills

This repo includes Codex skills for Pi users under `skills/`.

- `$pi-openclaw-pi5-quickstart` for first-time setup and mode selection.
- `$pi-openclaw-flow-audit` for routing and health troubleshooting.
- `$pi-openclaw-chat-providers` for Telegram and Ollama/OpenAI provider setup.
- `$pi-openclaw-ei-arduino-deploy` for Edge Impulse to Arduino deployment flow with Arduino MCP build handoff.
- `$pi-openclaw-arduino-flash` for serial-port-aware firmware upload to hardware after build/deploy handoff.

Skill discovery rules are in `AGENTS.md`.

## References


New project is a custom docs llm that will integrate and be used locally:
<img width="1644" height="801" alt="image" src="https://github.com/user-attachments/assets/85f03214-05fa-46b0-8e65-26c8920d6de7" />


For deeper background on the concepts and structures used in this repo:

- LLM docs index format (`llms.txt`): `https://llmstxt.org/`
- This repo LLM index file: `llms.txt`
- Edge Impulse LLM docs index: `https://docs.edgeimpulse.com/llms.txt`
- Edge Impulse MCP/CLI repo: `https://github.com/edgeimpulse/ei-agentic-claude`
- Model Context Protocol (MCP): `https://modelcontextprotocol.io/introduction`
- Docker Compose profiles: `https://docs.docker.com/compose/profiles/`
- Docker host networking: `https://docs.docker.com/engine/network/drivers/host/`
- Docker Buildx: `https://docs.docker.com/build/buildx/`
- Kubernetes Deployments: `https://kubernetes.io/docs/concepts/workloads/controllers/deployment/`
- Kubernetes Services: `https://kubernetes.io/docs/concepts/services-networking/service/`
- Kubernetes ConfigMaps: `https://kubernetes.io/docs/concepts/configuration/configmap/`
- Kubernetes Secrets: `https://kubernetes.io/docs/concepts/configuration/secret/`
- Kubernetes Persistent Volumes: `https://kubernetes.io/docs/concepts/storage/persistent-volumes/`
- Kubernetes HPA: `https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/`
- NVIDIA Container Toolkit: `https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html`
- NVIDIA Kubernetes device plugin: `https://github.com/NVIDIA/k8s-device-plugin`
- AMD ROCm docs: `https://rocm.docs.amd.com/`
- Qualcomm docs portal (platform-specific runtime/plugin docs): `https://docs.qualcomm.com/`

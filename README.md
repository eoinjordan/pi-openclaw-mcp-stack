# pi-openclaw-mcp-stack

Raspberry Pi 5 stack for running `clawdbot`, Arduino MCP, and Edge Impulse MCP together.

## Choose Your Mode

| Mode | Best for | EI MCP source | Start command |
| --- | --- | --- | --- |
| `mcp-image` (Recommended) | New users, fastest setup | `docker.io/eoinedge/ei-agentic-claude-mcp:latest` image | `docker compose --profile mcp-image up -d --build` |
| `mcp-local` | Developing `ei-agentic-claude` locally | Mounted repo path (`EI_AGENTIC_CLAUDE_PATH`) | `docker compose --profile mcp-local up -d --build` |
| `mcp` | No prebuilt MCP image | npm install inside bridge image | `docker compose --profile mcp up -d --build` |

Use only one EI bridge mode at a time (`mcp`, `mcp-local`, or `mcp-image`).

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

Verify:

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

## Why this script exists

Some Raspberry Pi OS images do not include `docker-buildx-plugin` or `docker-compose-plugin` packages by name.
The quickstart script handles package fallbacks and prints a clear error path if Compose is still unavailable.

## Architecture at a glance

```text
Telegram -> clawdbot -> openclaw-gateway
                       |- /arduino/* -> arduino-mcp
                       |- /ei/run    -> ei-mcp-bridge* -> ei-agentic-claude MCP (stdio) -> Edge Impulse API
```

`ei-mcp-bridge*` is one of:
- `ei-mcp-bridge` (`mcp`)
- `ei-mcp-bridge-local` (`mcp-local`)
- `ei-mcp-bridge-image` (`mcp-image`)

## Production target

- Target: Raspberry Pi 5 (`linux/arm64`, Raspberry Pi OS 64-bit Bookworm).
- Windows/macOS Docker Desktop is useful for flow checks, but images there are typically `amd64`.

## Detailed docs

- Pi setup and package fallback details: `docs/pi5-setup.md`
- Mode-specific setup (`mcp`, `mcp-local`, `mcp-image`): `docs/modes.md`
- Observability and flow tracing: `docs/observability.md`
- Architecture deep dive: `docs/architecture.md`
- EI to Nano 33 BLE deployment flow: `docs/ei-arduino-deploy.md`
- Local Ollama setup for Pi 5: `docs/ollama.md`

## Telegram commands

- `help`
- `health`
- `validate arduino`
- `build arduino`

If `OPENAI_API_KEY` is set, non-command messages are forwarded to OpenAI chat.

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

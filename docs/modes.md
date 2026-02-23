# Modes

Choose one EI bridge mode at a time:
- `mcp`
- `mcp-local`
- `mcp-image`

Arduino MCP is included for all three profiles.
By default it uses `docker.io/eoinedge/arduino-mcp:latest` (`ARDUINO_MCP_IMAGE` in `.env`).

## mcp-image (recommended)

Uses prebuilt image `docker.io/eoinedge/ei-agentic-claude-mcp:test`.

```bash
docker compose stop ei-mcp-bridge ei-mcp-bridge-local
docker compose --profile mcp-image up -d --build
```

Env knobs:
- `EI_MCP_BASE_IMAGE`
- `EI_MCP_BIN_IMAGE`
- `EI_MCP_ARGS_IMAGE`

Default in `.env`:

```bash
EI_MCP_BASE_IMAGE=docker.io/eoinedge/ei-agentic-claude-mcp:test
```

If `ei-mcp-bridge-image` restarts with exit `127` and logs show repeated `No such file or directory`, switch back to:

```bash
EI_MCP_BASE_IMAGE=docker.io/eoinedge/ei-agentic-claude-mcp:test
docker compose --profile mcp-image up -d --build --force-recreate
```

## mcp-local

Uses local checked-out `ei-agentic-claude` from host path.

Build local MCP first:

```bash
cd /home/pi/ei-agentic-claude
npm install
npm run build
```

Set in `.env`:

```bash
EI_AGENTIC_CLAUDE_PATH=/home/pi/ei-agentic-claude
```

Start:

```bash
cd /home/pi/pi-openclaw-mcp-stack
docker compose stop ei-mcp-bridge ei-mcp-bridge-image
docker compose --profile mcp-local up -d --build
```

Env knobs:
- `EI_MCP_BIN_LOCAL`
- `EI_MCP_ARGS_LOCAL`

## mcp

Installs `ei-agentic-claude` from npm inside bridge.

```bash
docker compose stop ei-mcp-bridge-local ei-mcp-bridge-image
docker compose --profile mcp up -d --build
```

Env knobs:
- `EI_MCP_BIN`
- `EI_MCP_ARGS`
- `EI_MCP_REQUEST_TIMEOUT_MS`

## Verify mode

```bash
docker compose ps
curl -s http://127.0.0.1:3000/health/upstreams
```

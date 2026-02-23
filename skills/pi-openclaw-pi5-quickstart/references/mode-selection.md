# Mode Selection

Use exactly one EI bridge mode at a time.

## mcp-image (default)
Use when users want fastest setup and can pull the published image.

```bash
docker compose --profile mcp-image up -d --build
```

Set image tag in `.env` when needed:

```env
EI_MCP_BASE_IMAGE=docker.io/eoinedge/ei-agentic-claude-mcp:test
```

## mcp-local
Use when users are actively editing `ei-agentic-claude` locally on Pi.

```env
EI_AGENTIC_CLAUDE_PATH=/home/<user>/ei-agentic-claude
```

```bash
docker compose --profile mcp-local up -d --build
```

## mcp
Use when users do not have image access and do not have a local repo checkout.

```bash
docker compose --profile mcp up -d --build
```

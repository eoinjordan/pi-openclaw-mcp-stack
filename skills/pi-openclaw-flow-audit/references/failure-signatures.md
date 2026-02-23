# Failure Signatures

## `connect ECONNREFUSED 127.0.0.1:3080`
- Cause: Arduino MCP not running or failed startup.
- Action: `docker logs arduino-mcp`, verify container state and port.

## `connect ECONNREFUSED 127.0.0.1:8090`
- Cause: EI bridge not running or restart loop.
- Action: inspect active bridge logs and image/bin config.

## EI bridge exits with code `127`
- Cause: command binary not found in container.
- Action: verify `EI_MCP_BIN_*` and image tag; confirm image contains entrypoint target.

## `compose build requires buildx 0.17.0 or later`
- Cause: old/missing buildx plugin.
- Action: install buildx from fallback chain or Docker official repo.

## Health `degraded` but gateway `ok`
- Cause: gateway is alive; one upstream is down.
- Action: treat as upstream outage, not gateway outage.

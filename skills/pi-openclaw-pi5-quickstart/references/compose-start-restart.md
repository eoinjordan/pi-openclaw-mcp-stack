# Compose Start And Restart

Run all commands from the repo root.

## Start one mode

```bash
docker compose --profile mcp-image up -d --build
# or
# docker compose --profile mcp-local up -d --build
# docker compose --profile mcp up -d --build
```

## Restart active mode

```bash
docker compose --profile mcp-image restart
```

## Restart key services

```bash
docker compose restart openclaw-gateway clawdbot
docker compose restart arduino-mcp
docker compose restart ei-mcp-bridge-image
```

If the active mode is `mcp-local` or `mcp`, restart `ei-mcp-bridge-local` or `ei-mcp-bridge` instead.

## Reload after `.env` edits

```bash
docker compose --profile mcp-image up -d --force-recreate
```

## Stop/Down

```bash
docker compose --profile mcp-image stop
docker compose --profile mcp-image down
```

## If Gateway Port 3000 Is Not Reachable

```bash
sudo systemctl enable --now docker
systemctl is-active docker
docker compose --profile mcp-image up -d --build
docker compose --profile mcp-image ps
docker compose --profile mcp-image logs --tail 120 gateway
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

If you are using `mcp` or `mcp-local`, replace `mcp-image` with the active profile.

# Observability

## Flow map

```text
Telegram -> clawdbot -> openclaw-gateway
                       |- /arduino/validate|build -> arduino-mcp
                       |- /ei/run -> ei-mcp-bridge* -> ei-agentic-claude MCP -> Edge Impulse API
```

## Container status

```bash
docker compose ps
docker compose --profile mcp ps
docker compose --profile mcp-local ps
docker compose --profile mcp-image ps
```

## Logs

```bash
docker logs -f openclaw-gateway
docker logs -f clawdbot
docker logs -f ei-mcp-bridge
docker logs -f ei-mcp-bridge-local
docker logs -f ei-mcp-bridge-image
docker logs -f arduino-mcp
```

## Health checks

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:3080/health
```

## Trace one EI call

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_active_projects","params":{}}'
```

Expected logging:
- gateway request line (when `GATEWAY_LOG_REQUESTS=1`)
- bridge request line (when `EI_MCP_LOG_REQUESTS=1`)
- MCP internal call lines (when `EI_MCP_VERBOSE=1`)

## Trace one Arduino call

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'
```

## Docker Desktop note

On Windows/macOS Docker Desktop, `network_mode: host` does not expose these ports on host `127.0.0.1`.
Use container-local checks:

```bash
docker exec openclaw-gateway node -e "require('http').get('http://127.0.0.1:3000/health/upstreams',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec ei-mcp-bridge-image node -e "require('http').get('http://127.0.0.1:8090/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec arduino-mcp node -e "require('http').get('http://127.0.0.1:3080/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
```

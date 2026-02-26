# Observability

## Flow map

```text
Telegram -> clawdbot -> openclaw-gateway
                       |- /arduino/validate|build -> arduino-mcp
                       |- /arduino/example|inference|flash -> gateway local arduino-cli
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

## Trace EI calls (auth modes)

```bash
# JWT/HMAC lane (account listing)
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_current_user_projects","params":{}}'

# API key lane (project read)
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"project_information\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID}}"
```

Expected logging:
- gateway request line (when `GATEWAY_LOG_REQUESTS=1`)
- bridge request line (when `EI_MCP_LOG_REQUESTS=1`)
- MCP internal call lines (when `EI_MCP_VERBOSE=1`)

## Trace Arduino calls

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'

curl -sS -X POST http://127.0.0.1:3000/arduino/example \
  -H 'Content-Type: application/json' \
  -d '{"example":"servo","projectRoot":"/workspace/Blink","servoType":"360","servoPin":12}'

curl -sS -X POST http://127.0.0.1:3000/arduino/flash \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink","port":"/dev/ttyACM0"}'
```

## Docker Desktop note

On Windows/macOS Docker Desktop, `network_mode: host` does not expose these ports on host `127.0.0.1`.
Use container-local checks:

```bash
docker exec openclaw-gateway node -e "require('http').get('http://127.0.0.1:3000/health/upstreams',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec ei-mcp-bridge-image node -e "require('http').get('http://127.0.0.1:8090/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
docker exec arduino-mcp node -e "require('http').get('http://127.0.0.1:3080/health',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d));}).on('error',e=>{console.error(e.message);process.exit(1);});"
```

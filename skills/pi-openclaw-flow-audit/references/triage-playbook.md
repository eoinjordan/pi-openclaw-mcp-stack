# Triage Playbook

## 1) State snapshot

```bash
docker compose ps
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

## 2) Service-level health

```bash
curl -s http://127.0.0.1:3080/health
curl -s http://127.0.0.1:8090/health
```

## 3) Logs

```bash
docker logs --tail 120 openclaw-gateway
docker logs --tail 120 clawdbot
docker logs --tail 120 arduino-mcp
docker logs --tail 120 ei-mcp-bridge-image
```

Swap `ei-mcp-bridge-image` with the active EI bridge container when needed.

## 4) Request trace

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate -H 'Content-Type: application/json' -d '{"projectRoot":"/workspace/Blink"}'
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d '{"name":"get_current_user_projects","params":{}}'
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d "{\"name\":\"project_information\",\"apiKey\":\"${EI_API_KEY}\",\"params\":{\"projectId\":${EI_PROJECT_ID}}}"
```

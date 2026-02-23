# Verify Checklist

Run from repo root after stack startup.

```bash
docker compose ps
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

Healthy target:
- Gateway status is `ok`.
- Upstream `arduino.ok` is `true`.
- Upstream `ei.ok` is `true`.

If degraded:
1. Identify failing service from `/health/upstreams`.
2. Check logs for that service.
3. Switch to flow-audit workflow for focused triage.

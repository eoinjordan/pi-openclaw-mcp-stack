---
name: pi-openclaw-flow-audit
description: Audit and troubleshoot end-to-end command flow in pi-openclaw-mcp-stack across clawdbot, openclaw-gateway, arduino-mcp, and EI bridge services. Use when users see degraded upstream health, connection refused errors, container restarts, missing responses, or need proof of routing behavior.
---

# Pi OpenClaw Flow Audit

1. Confirm active profile and container state.
- Check `docker compose ps` and identify which EI bridge is active.
- Ensure only one EI bridge mode is active.

2. Check health endpoints in order.
- Gateway `/health`.
- Gateway `/health/upstreams`.
- Per-service health endpoints.

3. Trace one request per path.
- Arduino path: `/arduino/validate`.
- EI path: `/ei/run`.
- Correlate responses with logs.

4. Collect logs with scope.
- Capture gateway, clawdbot, active EI bridge, and arduino-mcp logs.
- Focus on first failing component and connection errors.

5. Apply targeted fixes.
- Use `references/failure-signatures.md` for common causes.
- Re-run health checks after each fix.

6. Close audit with evidence.
- Provide command list, before/after health, and residual risks.

## References
- `references/flow-map.md`
- `references/triage-playbook.md`
- `references/failure-signatures.md`

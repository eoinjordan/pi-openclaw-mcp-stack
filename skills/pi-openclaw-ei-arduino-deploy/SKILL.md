---
name: pi-openclaw-ei-arduino-deploy
description: Run combined Edge Impulse MCP and Arduino MCP deployment workflows in pi-openclaw-mcp-stack. Use when users need to build an Arduino deployment package from an Edge Impulse impulse, bundle it for Arduino build, validate/build through Arduino MCP, and hand off to flash workflow for Nano 33 BLE deployment.
---

# Pi OpenClaw EI Arduino Deploy

1. Ground workflow in Edge Impulse docs scope.
- Use `references/edge-impulse-doc-scope.md`.
- Focus on deployment and project-settings pages discovered from the docs index.

2. Confirm stack readiness.
- Verify gateway and EI/Arduino upstream health before deployment calls.

3. Confirm project settings and deployment parameters.
- Use `references/project-settings-checklist.md` before starting a build.

4. Trigger Edge Impulse deployment build via gateway.
- Use `build_on_device_model` tool call through `/ei/run`.

5. Poll job status.
- Query job endpoint until completion.

6. Download generated deployment artifact.
- Save zip under local `outputs/`.

7. Bundle and prepare Arduino project handoff.
- Use `references/handoff-build-flash.md` to stage ZIP/library output for compile.
- Keep artifact path and project root explicit.

8. Validate Arduino project with Arduino MCP.
- Use `/arduino/validate` and `/arduino/build` as needed.

9. Hand off to flash workflow.
- Invoke `$pi-openclaw-arduino-flash` with project root, fqbn, and target port.

10. Report outcome.
- Include project ID, job ID, artifact path, compile status, and flash handoff result.

## References
- `references/edge-impulse-doc-scope.md`
- `references/project-settings-checklist.md`
- `references/deploy-playbook.md`
- `references/api-call-snippets.md`
- `references/handoff-build-flash.md`

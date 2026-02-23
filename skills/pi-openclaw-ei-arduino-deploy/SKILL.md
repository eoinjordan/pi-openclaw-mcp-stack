---
name: pi-openclaw-ei-arduino-deploy
description: Run combined Edge Impulse MCP and Arduino MCP deployment workflows in pi-openclaw-mcp-stack. Use when users need to build an Arduino deployment package from an Edge Impulse impulse, check job status, download artifacts, or validate/build sketches for Nano 33 BLE.
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

7. Validate Arduino project with Arduino MCP.
- Use `/arduino/validate` and `/arduino/build` as needed.

8. Report outcome.
- Include project ID, job ID, artifact path, and compile status.

## References
- `references/edge-impulse-doc-scope.md`
- `references/project-settings-checklist.md`
- `references/deploy-playbook.md`
- `references/api-call-snippets.md`

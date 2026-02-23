---
name: pi-openclaw-pi5-quickstart
description: Set up and start pi-openclaw-mcp-stack on Raspberry Pi 5 with Raspberry Pi OS 64-bit Bookworm. Use when users need fresh install commands, Docker Compose/Buildx prerequisite fixes, profile selection (mcp-image, mcp-local, mcp), environment setup, first boot, or baseline health checks.
---

# Pi OpenClaw Pi5 Quickstart

1. Confirm host details and paths.
- Use the active Linux username and home path.
- Do not assume user `ubuntu`.
- Prefer `/home/<user>/pi-openclaw-mcp-stack`.

2. Choose one EI bridge mode.
- Default to `mcp-image`.
- Use `mcp-local` only when local `ei-agentic-claude` edits are required.
- Use `mcp` if no image and no local repo are available.

3. Install prerequisites and recover missing Compose/Buildx packages.
- Follow `references/prereq-fallbacks.md`.
- Use the quickstart script when possible.

4. Configure `.env` for the chosen mode.
- Required: `TELEGRAM_TOKEN`, `EI_API_KEY`.
- Optional: `OPENAI_API_KEY` or `OPENAI_BASE_URL` for Ollama.
- For `mcp-local`, set `EI_AGENTIC_CLAUDE_PATH`.

5. Start, restart, or reload services with Compose.
- Use `references/compose-start-restart.md` for start/restart commands.
- Use checks in `references/verify-checklist.md`.
- If upstream health is degraded, switch to `$pi-openclaw-flow-audit`.

6. Report state clearly.
- Show mode, running containers, health status, and failing component if any.

## References
- `references/mode-selection.md`
- `references/prereq-fallbacks.md`
- `references/verify-checklist.md`
- `references/compose-start-restart.md`

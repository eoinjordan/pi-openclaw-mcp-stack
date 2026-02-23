## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file.

### Available skills
- pi-openclaw-pi5-quickstart: Fresh Raspberry Pi 5 setup and first boot of this stack, including Docker/Compose/Buildx prerequisite recovery, profile selection, and compose start/restart/reload commands. (file: skills/pi-openclaw-pi5-quickstart/SKILL.md)
- pi-openclaw-flow-audit: End-to-end audit and debugging of command flow across clawdbot, gateway, Arduino MCP, and EI MCP bridge services. (file: skills/pi-openclaw-flow-audit/SKILL.md)
- pi-openclaw-chat-providers: Configure Telegram BotFather credentials and switch chat backends between remote OpenAI-compatible providers and local Ollama on Pi 5. (file: skills/pi-openclaw-chat-providers/SKILL.md)
- pi-openclaw-ei-arduino-deploy: Run Edge Impulse to Arduino deployment flow grounded in docs-index deployment/project-settings pages, then validate/build sketches through Arduino MCP and hand off to flash workflow for Nano 33 BLE. (file: skills/pi-openclaw-ei-arduino-deploy/SKILL.md)
- pi-openclaw-arduino-flash: Flash firmware to Arduino hardware after build/deploy, including serial port detection, FQBN selection, upload commands, post-flash checks, and handoff completion from EI deploy skill on Pi. (file: skills/pi-openclaw-arduino-flash/SKILL.md)

### How to use skills
- Trigger rules: If a user names a skill (with `$skill-name` or plain text) OR the task clearly matches a skill description above, use that skill for that turn.
- Multiple matches: Use the minimal set of skills that covers the request, and state the order.
- Progressive loading: Read the skill body only after trigger, then load only the reference files needed for the current task.
- Fallback: If a skill is missing or incomplete, state the gap briefly and continue with best effort.

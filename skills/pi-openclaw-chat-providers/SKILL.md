---
name: pi-openclaw-chat-providers
description: Configure chat and bot access for pi-openclaw-mcp-stack. Use when users need Telegram BotFather setup, token wiring, OpenAI-compatible provider variables, or local Ollama setup on Pi 5.
---

# Pi OpenClaw Chat Providers

1. Configure Telegram access first.
- Create bot via BotFather.
- Set `TELEGRAM_TOKEN` in `.env`.
- Restart `clawdbot` and confirm logs.

2. Choose one chat backend.
- Remote OpenAI-compatible endpoint using `OPENAI_API_KEY`.
- Local Ollama using `OPENAI_BASE_URL` and model name.

3. Apply environment safely.
- Set only required keys.
- Avoid printing token values in logs or output.

4. Validate chat path.
- Check `clawdbot` logs.
- Send `help` and `health` commands from Telegram.

5. Keep MCP routing separate.
- Clarify that provider choice affects free-text chat behavior only.
- Arduino and EI tool routing is unchanged.

## References
- `references/telegram-botfather.md`
- `references/provider-env.md`
- `references/ollama-pi5.md`

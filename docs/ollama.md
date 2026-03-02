# Ollama on Pi 5

Use this if you want `clawdbot` chat replies from a local LLM instead of a remote API.

## 1) Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## 2) Start Ollama

Foreground:

```bash
ollama serve
```

Or as a service:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama
```

## 3) Pull a Pi-friendly model

```bash
ollama pull qwen2.5:3b-instruct
```

Alternatives:
- `llama3.2:3b`
- `phi3:mini`

## 4) Configure `clawdbot` for local chat

In `.env`:

```env
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b-instruct
```

`clawdbot` uses the OpenAI-compatible endpoint, so Ollama works without extra code changes.

## 5) Restart bot

```bash
docker compose restart clawdbot
```

## 6) Verify Ollama endpoint

```bash
curl -s http://127.0.0.1:11434/api/tags
ollama list
```

## Notes

- This only changes free-text chat behavior in `clawdbot`.
- MCP tool routing (`/arduino/*`, `/ei/run`) is unchanged.
- In Telegram, send `models` to check the active model and discovered Ollama models.

## Alternative: Agentic MCP Server

For a full MCP server with local LLM + tools (file ops, Arduino, EI), see `agentic-mcp/`:

```bash
# Setup
bash scripts/setup-agentic-mcp.sh

# Run (uses Ollama by default on Pi)
python3 -m agentic_mcp.server --llm-provider ollama
```

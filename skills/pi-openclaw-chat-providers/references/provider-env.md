# Provider Environment Matrix

## Remote OpenAI-compatible endpoint

```env
OPENAI_API_KEY=<provider-key>
OPENAI_MODEL=gpt-4o-mini
# Optional when provider is not default OpenAI endpoint:
# OPENAI_BASE_URL=https://<provider>/v1
```

## Local Ollama endpoint

```env
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b-instruct
```

After any provider change:

```bash
docker compose restart clawdbot
```

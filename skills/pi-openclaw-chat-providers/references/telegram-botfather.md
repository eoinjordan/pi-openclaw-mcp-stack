# Telegram BotFather Setup

1. Open `@BotFather` in Telegram.
2. Run:

```text
/newbot
```

3. Set display name and username (username must end with `bot`).
4. Copy token from BotFather.
5. Set in `.env`:

```env
TELEGRAM_TOKEN=123456789:AA...
```

6. Restart clawdbot:

```bash
docker compose restart clawdbot
docker logs --tail 100 clawdbot
```

7. Validate from Telegram:
- `/start`
- `help`
- `health`

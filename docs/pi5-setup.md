# Pi 5 Setup

## Scope

This is the full setup path for Raspberry Pi 5 on Raspberry Pi OS 64-bit (Bookworm).

## 1) Base packages

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y docker.io curl ca-certificates
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in (or run `newgrp docker`) after group changes.

## 2) Compose fallback chain

Some Pi images cannot find `docker-compose-plugin` by that exact name.

Try in this order:

```bash
sudo apt-get install -y docker-compose-plugin || true
sudo apt-get install -y docker-compose-v2 || true
sudo apt-get install -y docker-compose || true
```

Check:

```bash
docker compose version || docker-compose version
```

If both commands fail, use Docker's official Debian repository to get newer plugin packages:

```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 3) Buildx fallback chain

Buildx package naming can also differ.

```bash
sudo apt-get install -y docker-buildx-plugin || true
sudo apt-get install -y docker-buildx || true
docker buildx version || true
```

If Buildx is missing, Compose can still work in many setups. Keep going unless your build fails and explicitly asks for Buildx.

## 4) Clone and configure

```bash
git clone https://github.com/eoinjordan/pi-openclaw-mcp-stack.git
cd pi-openclaw-mcp-stack
cp .env.example .env
```

Set at minimum:
- `TELEGRAM_TOKEN`
- `EI_API_KEY`

Optional:
- `OPENAI_API_KEY`
- `EI_JWT_TOKEN`

## 5) Start stack

Recommended for new users:

```bash
bash scripts/pi5-quickstart.sh mcp-image
```

Manual alternative:

```bash
docker compose --profile mcp-image up -d --build
```

## 6) Verify

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
```

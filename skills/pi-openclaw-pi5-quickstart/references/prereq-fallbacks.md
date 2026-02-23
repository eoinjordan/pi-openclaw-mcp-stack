# Prereq Fallbacks (Pi 5 / Raspberry Pi OS)

## Base packages

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y docker.io curl ca-certificates
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

## Compose fallback chain

```bash
sudo apt-get install -y docker-compose-plugin || true
sudo apt-get install -y docker-compose-v2 || true
sudo apt-get install -y docker-compose || true
```

Validate:

```bash
docker compose version || docker-compose version
```

## Buildx fallback chain

```bash
sudo apt-get install -y docker-buildx-plugin || true
sudo apt-get install -y docker-buildx || true
docker buildx version || true
```

## Docker official repo fallback
Use only if Compose/Buildx are still missing.

```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

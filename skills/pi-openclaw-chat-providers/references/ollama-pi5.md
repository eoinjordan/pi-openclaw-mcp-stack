# Ollama on Pi 5

Install:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Start:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama
```

Pull model:

```bash
ollama pull qwen2.5:3b-instruct
```

Health check:

```bash
curl -s http://127.0.0.1:11434/api/tags
```

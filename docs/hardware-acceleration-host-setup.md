# Hardware Acceleration Host Setup

This guide provides direct host setup scripts for:
- NVIDIA Jetson (Ubuntu)
- Qualcomm Rubik Pi (Ubuntu, QNN/QAIRT path)

Use this before Kubernetes distributed deployment when you need hardware-accelerated inference services.

## Jetson (NVIDIA)

Script:
- `scripts/setup-jetson-accel.sh`

Run:

```bash
cd ~/pi-openclaw-mcp-stack
bash scripts/setup-jetson-accel.sh
```

What it does:
- Installs Docker if missing
- Installs and configures NVIDIA Container Toolkit
- Restarts Docker
- Runs runtime checks with `--runtime=nvidia`

## Rubik Pi (Qualcomm, Ubuntu)

Script:
- `scripts/setup-rubikpi-qnn-accel.sh`

Run:

```bash
cd ~/pi-openclaw-mcp-stack
bash scripts/setup-rubikpi-qnn-accel.sh
```

If QAIRT/QNN is not under the default path:

```bash
QNN_BASE=/path/to/qairt bash scripts/setup-rubikpi-qnn-accel.sh
```

Optional Edge Impulse Linux runner install:

```bash
INSTALL_EDGE_IMPULSE_RUNNER=1 bash scripts/setup-rubikpi-qnn-accel.sh
```

What it does:
- Installs Docker and multimedia dependencies
- Detects latest QNN runtime under `QNN_BASE`
- Exports QNN paths via `/etc/profile.d/qnn.sh`
- Runs available Qualcomm dependency checks

## Connect to this stack

Point `clawdbot` to an OpenAI-compatible accelerated inference endpoint:

```env
OPENAI_BASE_URL=http://<accelerated-llm-host>:<port>/v1
OPENAI_API_KEY=<provider-or-placeholder>
OPENAI_MODEL=<served-model-name>
```

Then restart:

```bash
cd ~/pi-openclaw-mcp-stack
docker compose --profile mcp-image up -d --force-recreate clawdbot
```

For distributed deployment patterns, see:
- `docs/kubernetes-distributed-acceleration.md`

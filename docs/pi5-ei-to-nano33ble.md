# Pi 5 End-to-End: Edge Impulse to Nano 33 BLE

This is a clean first-project flow for Raspberry Pi 5 users.

It connects:
- `pi-openclaw-mcp-stack`
- `ei-agentic-claude` (official repo: `https://github.com/edgeimpulse/ei-agentic-claude`)
- Edge Impulse project settings and deployment build
- Arduino Nano 33 BLE compile + flash

## 0) If already setup, reset env cleanly

```bash
cd "$HOME/pi-openclaw-mcp-stack"
docker compose --profile mcp-image down --remove-orphans
cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
cp .env.example .env
echo "EI_AGENTIC_ENV_TEST_PATH=$HOME/ei-agentic-claude/.env.test" >> .env
nano .env
```

Set:
- `TELEGRAM_TOKEN`
- `EI_RUN_TRAINING=1`

Then continue with step 4 (`pi5-quickstart.sh`) after confirming `ei-agentic-claude/.env.test`.

## 1) Clone both repos on Pi

```bash
cd "$HOME"
git clone https://github.com/edgeimpulse/ei-agentic-claude.git
git clone https://github.com/eoinjordan/pi-openclaw-mcp-stack.git
```

## 2) Configure `ei-agentic-claude/.env.test`

```bash
cd "$HOME/ei-agentic-claude"
cp .env.example .env.test
nano .env.test
```

Set at least:

```env
EI_API_KEY=ei_xxx
EI_ORG_API_KEY=ei_xxx
EI_ORG_ID=123456
EI_PROJECT_ID=123456
EI_RUN_TRAINING=1

PROJECT_123456_ID=ei_xxx
PROJECT_123456_URL=https://studio.edgeimpulse.com/studio/123456
DSP_BLOCK_IDS=3
LEARN_BLOCK_IDS=16
EI_IMPULSE_ID=1
```

Optional for Claude chat flows:

```env
ANTHROPIC_API_KEY=sk-ant-xxx
```

## 3) Configure stack `.env` and import from `.env.test`

```bash
cd "$HOME/pi-openclaw-mcp-stack"
cp .env.example .env
echo "EI_AGENTIC_ENV_TEST_PATH=$HOME/ei-agentic-claude/.env.test" >> .env
nano .env
```

Set required stack values:

```env
TELEGRAM_TOKEN=123456789:AA...
EI_RUN_TRAINING=1
```

Optional local LLM on Pi:

```env
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b-instruct
```

## 4) Start stack

```bash
cd "$HOME/pi-openclaw-mcp-stack"
bash scripts/pi5-quickstart.sh mcp-image
```

This imports supported keys from `ei-agentic-claude/.env.test` into stack `.env`.

## 5) Verify health

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/upstreams
docker compose --profile mcp-image ps
```

## 6) Verify Edge Impulse MCP can read your project

```bash
source .env
# JWT/HMAC lane (account listing)
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_current_user_projects","params":{}}'

# API key lane (project read)
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"project_information\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID}}"
```

## 7) Kick off Arduino deployment build from Edge Impulse

```bash
source .env
BUILD_JSON="$(curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"build_on_device_model\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID,\"type\":\"arduino\",\"impulseId\":$EI_IMPULSE_ID,\"engine\":\"tflite-eon\",\"modelType\":\"int8\"}}")"
echo "$BUILD_JSON"
JOB_ID="$(echo "$BUILD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
DEPLOYMENT_VERSION="$(echo "$BUILD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['deploymentVersion'])")"
echo "JOB_ID=$JOB_ID DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION"
```

Poll status:

```bash
source .env
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"get_job_status_openapi_b8230c81\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID,\"jobId\":$JOB_ID}}"
```

Download deployment ZIP:

```bash
mkdir -p outputs
curl -L -H "x-api-key: $EI_API_KEY" \
  -o outputs/ei_arduino_deployment.zip \
  "https://studio.edgeimpulse.com/v1/api/$EI_PROJECT_ID/deployment/history/$DEPLOYMENT_VERSION/download"
HEADER="$(unzip -Z1 outputs/ei_arduino_deployment.zip | grep -m1 -E '_inferencing\.h$' | awk -F/ '{print $NF}')"
sed -i "s|^EI_LIBRARY_HEADER_DEFAULT=.*|EI_LIBRARY_HEADER_DEFAULT=$HEADER|" .env
docker compose --profile mcp-image up -d --force-recreate gateway clawdbot
```

## 8) Compile Arduino project in stack workspace

Place your sketch under:
- `workspace/Arduino/<ProjectName>/<ProjectName>.ino`

Then:

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/<ProjectName>"}'

curl -sS -X POST http://127.0.0.1:3000/arduino/build \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/<ProjectName>"}'
```

## 9) Flash Nano 33 BLE

Find serial port:

```bash
ls /dev/ttyACM* /dev/ttyUSB*
```

Use provided uploader script:

```bash
cd "$HOME/pi-openclaw-mcp-stack"
bash scripts/flash-nano33ble.sh <ProjectName> /dev/ttyACM0
```

Arguments:
- `<ProjectName>` defaults to `Blink`
- serial port defaults to `/dev/ttyACM0`
- FQBN defaults to `arduino:mbed_nano:nano33ble`

## 10) Common issues

- `projectRoot does not exist`: use `/workspace/<ProjectName>`, not `/workspace/Arduino/<ProjectName>`.
- `model not found` with Ollama: set `OPENAI_MODEL` to a model from `ollama list`.
- `health/upstreams` degraded on first run: Arduino toolchain install can take several minutes.
- upload port missing: reconnect board, then re-check `/dev/ttyACM*`.

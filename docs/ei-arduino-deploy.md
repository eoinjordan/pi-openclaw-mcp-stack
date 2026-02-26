# EI to Arduino Deployment

Use this when you want to deploy an Edge Impulse project to Nano 33 BLE firmware.
For full first-time Pi setup, use `pi5-ei-to-nano33ble.md`.

## 1) Build Arduino deployment via gateway

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

## 2) Poll job status

```bash
source .env
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"get_job_status_openapi_b8230c81\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID,\"jobId\":$JOB_ID}}"
```

## 3) Download deployment ZIP

```bash
mkdir -p outputs
curl -L -H "x-api-key: $EI_API_KEY" \
  -o outputs/ei_arduino_deployment.zip \
  "https://studio.edgeimpulse.com/v1/api/$EI_PROJECT_ID/deployment/history/$DEPLOYMENT_VERSION/download"
```

## 4) Import deployment ZIP in Arduino IDE

1. `Sketch` -> `Include Library` -> `Add .ZIP Library...`
2. Choose `outputs/ei_arduino_deployment.zip`
3. Open or create sketch at `workspace/Arduino/<ProjectName>/<ProjectName>.ino`
4. Include the generated EI header and inference call in the sketch
5. Select board: `Arduino Nano 33 BLE`

Set the default inference header for bot/gateway inference commands:

```bash
HEADER="$(unzip -Z1 outputs/ei_arduino_deployment.zip | grep -m1 -E '_inferencing\.h$' | awk -F/ '{print $NF}')"
sed -i "s|^EI_LIBRARY_HEADER_DEFAULT=.*|EI_LIBRARY_HEADER_DEFAULT=$HEADER|" .env
docker compose --profile mcp-image up -d --force-recreate gateway clawdbot
```

## 5) Compile check via Arduino MCP

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/<ProjectName>"}'

curl -sS -X POST http://127.0.0.1:3000/arduino/build \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/<ProjectName>"}'
```

## 6) Flash to hardware

```bash
ls /dev/ttyACM* /dev/ttyUSB*
bash scripts/flash-nano33ble.sh <ProjectName> /dev/ttyACM0
```

The flash script compiles before upload and uses host `arduino-cli` when installed.

After build/validate succeeds, you can also use the Codex skill:
- `$pi-openclaw-arduino-flash`

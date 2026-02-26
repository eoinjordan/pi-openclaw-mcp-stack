# Deploy Playbook (Nano 33 BLE)

## 0) Validate project and deployment settings

- Use `edge-impulse-doc-scope.md` to find relevant docs pages.
- Use `project-settings-checklist.md` to validate parameters.

## 1) Run deployment build

```bash
BUILD_JSON="$(curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d "{\"name\":\"build_on_device_model\",\"apiKey\":\"${EI_API_KEY}\",\"params\":{\"projectId\":${EI_PROJECT_ID},\"type\":\"arduino\",\"impulseId\":${EI_IMPULSE_ID},\"engine\":\"tflite-eon\",\"modelType\":\"int8\"}}")"
echo "$BUILD_JSON"
JOB_ID="$(echo "$BUILD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
DEPLOYMENT_VERSION="$(echo "$BUILD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['deploymentVersion'])")"
```

## 2) Poll job

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d "{\"name\":\"get_job_status_openapi_b8230c81\",\"apiKey\":\"${EI_API_KEY}\",\"params\":{\"projectId\":${EI_PROJECT_ID},\"jobId\":${JOB_ID}}}"
```

## 3) Download artifact

```bash
mkdir -p outputs
curl -L -H "x-api-key: ${EI_API_KEY}" -o outputs/ei_arduino_deployment.zip "https://studio.edgeimpulse.com/v1/api/${EI_PROJECT_ID}/deployment/history/${DEPLOYMENT_VERSION}/download"
```

Keep this file at `outputs/ei_arduino_deployment.zip` (or set `EI_LIBRARY_ZIP_PATH`) so gateway flash can auto-install it if compile reports missing `*_inferencing.h`.

## 4) Install ZIP library in Arduino IDE

Use Arduino IDE on the Pi:

1. `Sketch` -> `Include Library` -> `Add .ZIP Library...`
2. Select `outputs/ei_arduino_deployment.zip`
3. Create/update sketch: `workspace/Arduino/<ProjectName>/<ProjectName>.ino`
4. Ensure sketch includes the generated EI library header and inference calls

Set default header for gateway inference commands:

```bash
HEADER="$(unzip -Z1 outputs/ei_arduino_deployment.zip | grep -m1 -E '_inferencing\.h$' | awk -F/ '{print $NF}')"
sed -i "s|^EI_LIBRARY_HEADER_DEFAULT=.*|EI_LIBRARY_HEADER_DEFAULT=${HEADER}|" .env
docker compose --profile mcp-image up -d --force-recreate gateway clawdbot
```

## 5) Validate local sketch through Arduino MCP

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate -H 'Content-Type: application/json' -d '{"projectRoot":"/workspace/Blink"}'
```

## 6) Build local sketch through Arduino MCP

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/build -H 'Content-Type: application/json' -d '{"projectRoot":"/workspace/Blink"}'
```

## 7) Hand off to flash

- Continue with `$pi-openclaw-arduino-flash` using:
  - `projectRoot=/workspace/Blink`
  - `fqbn=arduino:mbed_nano:nano33ble`
  - detected port (for example `/dev/ttyACM0`)

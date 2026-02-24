# EI to Arduino Deployment

Use this when you want to deploy an Edge Impulse project to Nano 33 BLE firmware.
For full first-time Pi setup, use `pi5-ei-to-nano33ble.md`.

## 1) Build Arduino deployment via gateway

```bash
source .env
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"build_on_device_model\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID,\"type\":\"arduino\",\"impulseId\":$EI_IMPULSE_ID,\"engine\":\"tflite-eon\",\"modelType\":\"int8\"}}"
```

## 2) Poll job status

```bash
source .env
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"get_job_status_openapi_b8230c81\",\"apiKey\":\"$EI_API_KEY\",\"params\":{\"projectId\":$EI_PROJECT_ID,\"jobId\":456}}"
```

## 3) Download deployment ZIP

```bash
mkdir -p outputs
curl -L -H "x-api-key: $EI_API_KEY" \
  -o outputs/ei_arduino_deployment.zip \
  "https://studio.edgeimpulse.com/v1/api/$EI_PROJECT_ID/deployment/history/7/download"
```

## 4) Import in Arduino IDE

1. `Sketch` -> `Include Library` -> `Add .ZIP Library...`
2. Choose `outputs/ei_arduino_deployment.zip`
3. Select board: `Arduino Nano 33 BLE`
4. Build and upload

## 5) Optional CI compile check via Arduino MCP

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/<ProjectName>"}'
```

## 6) Flash to hardware

```bash
ls /dev/ttyACM* /dev/ttyUSB*
bash scripts/flash-nano33ble.sh <ProjectName> /dev/ttyACM0
```

After build/validate succeeds, you can also use the Codex skill:
- `$pi-openclaw-arduino-flash`

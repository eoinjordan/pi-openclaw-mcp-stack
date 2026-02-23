# EI to Arduino Deployment

Use this when you want to deploy an Edge Impulse project to Nano 33 BLE firmware.

## 1) Build Arduino deployment via gateway

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"build_on_device_model","params":{"projectId":123,"type":"arduino","impulseId":1,"engine":"tflite-eon","modelType":"int8"}}'
```

## 2) Poll job status

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_job_status_openapi_b8230c81","params":{"projectId":123,"jobId":456}}'
```

## 3) Download deployment ZIP

```bash
mkdir -p outputs
curl -L -H "x-api-key: ei_XXX" \
  -o outputs/ei_arduino_deployment.zip \
  "https://studio.edgeimpulse.com/v1/api/123/deployment/history/7/download"
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
  -d '{"projectRoot":"/workspace/Blink"}'
```

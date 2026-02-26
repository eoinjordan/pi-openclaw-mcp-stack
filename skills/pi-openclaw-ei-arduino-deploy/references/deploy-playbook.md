# Deploy Playbook (Nano 33 BLE)

## 0) Validate project and deployment settings

- Use `edge-impulse-doc-scope.md` to find relevant docs pages.
- Use `project-settings-checklist.md` to validate parameters.

## 1) Run deployment build

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d '{"name":"build_on_device_model","params":{"projectId":123,"type":"arduino","impulseId":1,"engine":"tflite-eon","modelType":"int8"}}'
```

## 2) Poll job

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d '{"name":"get_job_status_openapi_b8230c81","params":{"projectId":123,"jobId":456}}'
```

## 3) Download artifact

```bash
mkdir -p outputs
curl -L -H "x-api-key: ${EI_API_KEY}" -o outputs/ei_arduino_deployment.zip "https://studio.edgeimpulse.com/v1/api/123/deployment/history/7/download"
```

## 4) Install ZIP library in Arduino IDE

Use Arduino IDE on the Pi:

1. `Sketch` -> `Include Library` -> `Add .ZIP Library...`
2. Select `outputs/ei_arduino_deployment.zip`
3. Create/update sketch: `workspace/Arduino/<ProjectName>/<ProjectName>.ino`
4. Ensure sketch includes the generated EI library header and inference calls

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

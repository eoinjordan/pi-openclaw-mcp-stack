# Handoff Build -> Flash

Use this to move from EI deployment artifact to a complete built-and-flashed app flow.

## 1) Keep deployment ZIP as artifact

```bash
ls -lh outputs/ei_arduino_deployment.zip
```

## 2) Build compile check in Arduino MCP workspace

Use an Arduino project root that includes your integrated sketch/library setup, then run:

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/validate \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'

curl -sS -X POST http://127.0.0.1:3000/arduino/build \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'
```

## 3) Pass to flash skill

Handoff payload should include:
- `projectRoot`: e.g. `/workspace/Blink`
- `bundleArtifact`: e.g. `outputs/ei_arduino_deployment.zip`
- `fqbn`: e.g. `arduino:mbed_nano:nano33ble`
- `port`: e.g. `/dev/ttyACM0`

Invoke `$pi-openclaw-arduino-flash` to upload to hardware.

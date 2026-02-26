# Flash Playbook (Pi 5)

Use this after build/deploy succeeds.

If your firmware came from an Edge Impulse Arduino deployment ZIP:
- install ZIP in Arduino IDE first,
- integrate the generated library in your sketch,
- then run compile/upload.

## 1) Confirm build succeeds first

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/build \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot":"/workspace/Blink"}'
```

## 2) Flash from repo script (recommended)

```bash
bash ~/pi-openclaw-mcp-stack/scripts/flash-nano33ble.sh Blink /dev/ttyACM0
```

The script compiles before upload and prefers host `arduino-cli` when available.

## 3) Flash from source sketch on host (equivalent explicit commands)

```bash
arduino-cli upload \
  -p /dev/ttyACM0 \
  --fqbn arduino:mbed_nano:nano33ble \
  ~/pi-openclaw-mcp-stack/workspace/Arduino/Blink
```

Replace `/dev/ttyACM0` with detected port.

## 4) Optional explicit compile + upload flow

```bash
arduino-cli compile \
  --fqbn arduino:mbed_nano:nano33ble \
  ~/pi-openclaw-mcp-stack/workspace/Arduino/Blink

arduino-cli upload \
  -p /dev/ttyACM0 \
  --fqbn arduino:mbed_nano:nano33ble \
  ~/pi-openclaw-mcp-stack/workspace/Arduino/Blink
```

## 5) Notes for container-based workflows

- Current stack compiles through `arduino-mcp` container.
- Flash/upload needs serial device access to target board.
- If using container upload, ensure device pass-through (`--device /dev/ttyACM0`) is configured.

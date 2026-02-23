# API Call Snippets

## List active projects

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d '{"name":"list_active_projects","params":{}}'
```

## Build Arduino sketch

```bash
curl -sS -X POST http://127.0.0.1:3000/arduino/build -H 'Content-Type: application/json' -d '{"projectRoot":"/workspace/Blink"}'
```

## Flash handoff reminder

After successful build, invoke `$pi-openclaw-arduino-flash` with project root, fqbn, and serial port.

## Gateway health

```bash
curl -s http://127.0.0.1:3000/health/upstreams
```

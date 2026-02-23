---
name: pi-openclaw-arduino-flash
description: Flash firmware to Arduino boards in the pi-openclaw-mcp-stack workflow after successful build/deployment. Use when users need serial port detection, board/FQBN checks, upload commands for Nano 33 BLE, or post-flash verification.
---

# Pi OpenClaw Arduino Flash

1. Confirm firmware source and build state.
- Use `references/flash-playbook.md` to verify sketch/artifact and compile status first.
- Do not flash before a successful compile.

2. Detect board connection and serial port on Pi.
- Use `references/serial-port-checks.md` to identify `/dev/tty*` and permission issues.

3. Select upload path.
- Preferred: host-side `arduino-cli upload` on Pi.
- Optional: container-side upload only when the serial device is mapped into container runtime.

4. Run flash command with explicit board and port.
- Require explicit `fqbn` and `port`.
- Default board in this stack is Nano 33 BLE (`arduino:mbed_nano:nano33ble`).

5. Verify after upload.
- Confirm upload success output.
- Re-open serial monitor or run target-level smoke check if applicable.

6. Report exact command and result.
- Include board, port, sketch path, and upload outcome.

## References
- `references/flash-playbook.md`
- `references/serial-port-checks.md`

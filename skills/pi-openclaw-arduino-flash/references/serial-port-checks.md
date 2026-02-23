# Serial Port Checks

## Detect board port

```bash
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
dmesg | tail -n 60
arduino-cli board list
```

## Permissions

```bash
groups
sudo usermod -aG dialout "$USER"
newgrp dialout
```

If upload fails with permission denied, log out and back in after group changes.

## Quick upload troubleshooting

- Wrong port: board list does not show target board.
- Wrong FQBN: compile/upload says board package missing or mismatch.
- Port busy: close serial monitor or other process using the same `/dev/tty*`.

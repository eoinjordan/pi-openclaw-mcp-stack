# UNO Q MWC Demo Setup

This sets up the Edge Impulse UNO Q custom sensor demo from:
- `https://github.com/edgeimpulse/ei-unoq-custom-sensor` (`mwc-demo` branch)

## 1) Clone and prepare

```bash
cd ~/pi-openclaw-mcp-stack
bash scripts/setup-unoq-mwc-demo.sh
```

By default this clones to:
- `~/ei-unoq-custom-sensor`

You can pass a custom path:

```bash
bash scripts/setup-unoq-mwc-demo.sh ~/workspace/ei-unoq-custom-sensor
```

## 2) Flash MCU sketch (UNO Q)

In Arduino IDE:
1. Select board: `Arduino UNO Q`
2. Open sketch:
   - `arduino/uno_q_adc_streamer/uno_q_adc_streamer.ino`
3. Upload to board

## 3) Run Linux-side inference

```bash
cd ~/ei-unoq-custom-sensor
source .venv/bin/activate
sudo ./scripts/stop-router.sh
python3 linux/unoq_adc_infer.py \
  --model modelfile.eim \
  --port /dev/ttyHS1 \
  --baud 2000000 \
  --frame-samples 512 \
  --window-samples 11025 \
  --adc-bits 12 \
  --center
```

When finished, restore router if needed:

```bash
sudo ./scripts/start-router.sh
```

## 4) Optional web UI

```bash
cd ~/ei-unoq-custom-sensor
source .venv/bin/activate
./run_server.sh --host 0.0.0.0 --port 8080
```

Then open:
- `http://<unoq-linux-ip>:8080/`

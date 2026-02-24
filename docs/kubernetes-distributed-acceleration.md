# Advanced Usage: Kubernetes + Hardware Acceleration

Use this guide when you want to run `pi-openclaw-mcp-stack` as a distributed deployment on Kubernetes and attach accelerated model inference on NVIDIA, Qualcomm, or AMD hardware.

This is an advanced deployment pattern. Keep the single-node Docker Compose flow as your first validated baseline.

Host prep scripts are available at:
- `scripts/setup-jetson-accel.sh`
- `scripts/setup-rubikpi-qnn-accel.sh`

## 1) Target Architecture

Map current services to Kubernetes workloads:
- `openclaw-gateway`: stateless `Deployment` + `Service`
- `clawdbot`: stateless `Deployment`
- `ei-mcp-bridge-image`: stateless `Deployment` + `Service`
- `arduino-mcp`: hardware-bound `Deployment` pinned to USB-connected nodes
- Optional `llm-service`: OpenAI-compatible endpoint used by `clawdbot` via `OPENAI_BASE_URL`

Recommended split:
- General nodes: `gateway`, `clawdbot`, `ei-mcp-bridge`
- Hardware nodes: `arduino-mcp`, optional accelerated `llm-service`

## 2) Build and Publish Images

Build multi-arch images and push to your registry:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/openclaw-gateway:latest --push ./gateway
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/clawdbot:latest --push ./clawdbot
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/ei-mcp-bridge-image:latest --push ./ei-mcp-bridge
```

For `arduino-mcp`, use your published image (for example `docker.io/eoinedge/arduino-mcp:latest`) or publish your own.

## 3) Namespace, Config, and Secrets

Create namespace:

```bash
kubectl create namespace openclaw
```

Create secrets from your `.env` values (example):

```bash
kubectl -n openclaw create secret generic openclaw-secrets \
  --from-literal=TELEGRAM_TOKEN='xxx' \
  --from-literal=EI_API_KEY='ei_xxx' \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-xxx'
```

Create config map for non-secret values:

```bash
kubectl -n openclaw create configmap openclaw-config \
  --from-literal=GATEWAY_PORT='3000' \
  --from-literal=ARDUINO_MCP='http://arduino-mcp:3080' \
  --from-literal=EI_MCP='http://ei-mcp-bridge:8090' \
  --from-literal=OPENAI_BASE_URL='http://llm-service:11434/v1' \
  --from-literal=OPENAI_MODEL='qwen2.5:3b-instruct' \
  --from-literal=EI_RUN_TRAINING='1'
```

## 4) Core Deployments (Distributed)

Deploy each component separately and connect by service DNS names.

Minimal gateway service/deployment pattern:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: openclaw-gateway
  namespace: openclaw
spec:
  selector:
    app: openclaw-gateway
  ports:
    - name: http
      port: 3000
      targetPort: 3000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openclaw-gateway
  namespace: openclaw
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openclaw-gateway
  template:
    metadata:
      labels:
        app: openclaw-gateway
    spec:
      containers:
        - name: gateway
          image: <registry>/openclaw-gateway:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: openclaw-config
            - secretRef:
                name: openclaw-secrets
```

Repeat similarly for:
- `clawdbot` (usually 1 replica unless you handle bot update dedupe)
- `ei-mcp-bridge-image` (1+ replicas)

## 5) Arduino MCP in Kubernetes (USB-bound)

`arduino-mcp` needs direct USB access and persistent Arduino cache.

Recommended:
- Label a hardware node: `kubectl label node <node> openclaw.io/arduino=true`
- Pin workload with `nodeSelector`
- Mount `/dev` or specific USB paths
- Mount persistent volume for `.arduino15`

Example (trimmed):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: arduino-mcp
  namespace: openclaw
spec:
  replicas: 1
  selector:
    matchLabels:
      app: arduino-mcp
  template:
    metadata:
      labels:
        app: arduino-mcp
    spec:
      nodeSelector:
        openclaw.io/arduino: "true"
      containers:
        - name: arduino-mcp
          image: docker.io/eoinedge/arduino-mcp:latest
          securityContext:
            privileged: true
          volumeMounts:
            - name: dev
              mountPath: /dev
            - name: workspace
              mountPath: /workspace
            - name: arduino-cache
              mountPath: /root/.arduino15
      volumes:
        - name: dev
          hostPath:
            path: /dev
        - name: workspace
          persistentVolumeClaim:
            claimName: arduino-workspace-pvc
        - name: arduino-cache
          persistentVolumeClaim:
            claimName: arduino-cache-pvc
```

## 6) Hardware-Accelerated LLM Service Pattern

For accelerated inference, run a separate `llm-service` and point:
- `OPENAI_BASE_URL=http://llm-service.<namespace>.svc.cluster.local:<port>/v1`
- `OPENAI_MODEL=<model-name>`

This keeps `clawdbot` unchanged and portable across vendors.

## 7) NVIDIA Acceleration

Typical stack:
- Install NVIDIA drivers on node
- Install NVIDIA device plugin or GPU Operator
- Request GPU resources in pod spec: `nvidia.com/gpu: 1`

Example resource request:

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```

Use an OpenAI-compatible server image with CUDA support (for example, vLLM/TGI/ollama variant) and expose it as `llm-service`.

## 8) AMD Acceleration

Typical stack:
- Install ROCm-capable driver/runtime on AMD GPU node
- Install AMD Kubernetes device plugin
- Request AMD GPU resources in pod spec (resource key depends on plugin, commonly `amd.com/gpu`)

Example resource request:

```yaml
resources:
  limits:
    amd.com/gpu: 1
```

Run ROCm-enabled model server image and expose as `llm-service`.

## 9) Qualcomm Acceleration

Qualcomm acceleration is platform-specific and depends on board SDK/runtime.

Typical flow:
- Install Qualcomm AI runtime (QNN/SNPE or vendor runtime) on target nodes
- Install vendor device plugin (resource key varies by platform)
- Label nodes and schedule accelerator workloads only there
- Mount required device files/libs into model server pod

Example scheduling pattern (replace resource key with your vendor plugin key):

```yaml
nodeSelector:
  openclaw.io/qualcomm-ai: "true"
resources:
  limits:
    qualcomm.com/ai-accel: 1
```

Point `clawdbot` to that service using `OPENAI_BASE_URL`.

## 10) Distributed Ops Checklist

- Use `HorizontalPodAutoscaler` for `gateway` and `ei-mcp-bridge` if traffic grows
- Keep `arduino-mcp` single-replica per attached board
- Use persistent storage for Arduino workspace/cache
- Add readiness/liveness probes on all services
- Export logs/metrics centrally (Prometheus + Loki or your platform equivalent)

## 11) Upgrade Strategy

- Roll out stateless services first: `gateway`, `clawdbot`, `ei-mcp-bridge`
- Roll out `arduino-mcp` only when no active flash/build jobs are running
- Keep image tags pinned (avoid silent `latest` drift in production)

## 12) Practical Limits

- USB flashing is not a good horizontal-scaling workload; scale by adding dedicated hardware nodes.
- `clawdbot` + Telegram polling can duplicate message handling with multiple replicas unless you add single-consumer controls.
- Qualcomm/AMD resource keys and runtime setup vary by platform vendor and Kubernetes plugin.

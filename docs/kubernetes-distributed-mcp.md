# Kubernetes Distributed Agentic MCP Cluster

## Overview

Deploy the agentic MCP server across a Raspberry Pi cluster for:
- **Horizontal scaling** of MCP tool execution
- **GPU sharing** across nodes (if any have NVIDIA GPUs)
- **High availability** for continuous operation
- **Resource isolation** between users/projects

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                      │
│                       (K3s on Pi 5)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │   Pi Node 1  │   │   Pi Node 2  │   │  Pi Node 3   │  │
│  │  (Control)   │   │  (Worker)    │   │  (Worker+GPU)│  │
│  │              │   │              │   │              │  │
│  │ agentic-mcp  │   │ agentic-mcp  │   │ agentic-mcp  │  │
│  │   + Ollama   │   │   + Ollama   │   │ + HF+LoRA    │  │
│  └──────────────┘   └──────────────┘   └──────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Persistent Storage                      │   │
│  │   - Model cache (/models)                          │   │
│  │   - Arduino workspace (/workspace)                  │   │
│  │   - EI deployments (/outputs)                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Service / Ingress                       │   │
│  │   - MCP Gateway (LoadBalancer)                      │   │
│  │   - Claude Code Connect                             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. K3s Distribution

K3s is lightweight Kubernetes ideal for Pi:
- Single binary, ~100MB
- Embedded etcd (or SQLite for non-HA)
- ARM64 native

### 2. MCP Server Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentic-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agentic-mcp
  template:
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: hardware
                operator: In
                values:
                - gpu  # Prefer GPU nodes
      containers:
      - name: mcp
        image: agentic-mcp:latest
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            # nvidia.com/gpu: 1  # If GPU node
        env:
        - name: LLM_PROVIDER
          value: "huggingface"
        - name: ADAPTER_REPO
          value: "<your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct"
        volumeMounts:
        - name: models
          mountPath: /models
        - name: workspace
          mountPath: /workspace
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: model-cache-pvc
      - name: workspace
        persistentVolumeClaim:
          claimName: workspace-pvc
```

### 3. Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: agentic-mcp
spec:
  selector:
    app: agentic-mcp
  ports:
  - port: 8080
    targetPort: 8080
  type: LoadBalancer  # Or ClusterIP with ingress
```

### 4. Persistent Storage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: model-cache-pvc
spec:
  accessModes:
    - ReadWriteMany  # Shared across nodes
  storageClassName: nfs  # Or longhorn, openebs
  resources:
    requests:
      storage: 50Gi
```

### 5. Node Labels

```bash
# Label nodes by capability
kubectl label nodes pi-node-1 role=control
kubectl label nodes pi-node-2 role=worker
kubectl label nodes pi-node-3 hardware=gpu
```

## Deployment Steps

### 1. Setup K3s Cluster

On control node:
```bash
# Install K3s
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh

# Get node token
sudo cat /var/lib/rancher/k3s/server/node-token
```

On worker nodes:
```bash
curl -sfL https://get.k3s.io | K3S_URL=https://control-node:6443 K3S_TOKEN=<token> sh
```

### 2. Build and Push Image

```bash
cd agentic-mcp
docker build -t your-registry/agentic-mcp:latest .
docker push your-registry/agentic-mcp:latest
```

### 3. Deploy

```bash
kubectl apply -f k8s/
```

### 4. Connect Claude Code

```bash
# Point to cluster service
claude mcp add agentic-mcp -- python3 -m agentic_mcp.server \
    --llm-provider huggingface \
    --adapter <your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct
```

Or use SSE mode with ingress:
```bash
python3 -m agentic_mcp.server --transport sse --host 0.0.0.0 --port 8080
```

## GPU Scheduling

For nodes with NVIDIA GPU:

1. Install NVIDIA device plugin:
```bash
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.0/deployments/static/nvidia-device-plugin.yml
```

2. Request GPU in deployment:
```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```

## Model Caching Strategy

```
┌────────────────────────────────────────────┐
│           Model Cache Layer               │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Pi Node  │  │ Pi Node  │  │ Pi Node  │ │
│  │  (Warm) │  │  (Warm)  │  │  (Cold)  │ │
│  │          │  │          │  │          │ │
│  │ Qwen2.5 │  │ Qwen2.5  │  │ Download │ │
│  │ cached   │  │ cached   │  │ on first │ │
│  └──────────┘  └──────────┘  └──────────┘ │
│                                            │
│  Shared NFS: /models                       │
│                                            │
└────────────────────────────────────────────┘
```

Use InitContainer to pre-download models:
```yaml
initContainers:
- name: model-loader
  image: busybox
  command: ['sh', '-c', 'cp /preloaded/* /models/']
  volumeMounts:
  - name: preloaded-models
    mountPath: /preloaded
  - name: models
    mountPath: /models
```

## Scaling

```bash
# Scale up
kubectl scale deployment agentic-mcp --replicas=5

# Auto-scale based on CPU
kubectl autoscale deployment agentic-mcp --cpu-percent=70 --min=2 --max=10
```

## Monitoring

```bash
# Install metrics server (if not included)
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/metrics-server/master/deploy/1.8+/metrics-server-deployment.yaml

# View resource usage
kubectl top nodes
kubectl top pods
```

## File Structure

```
k8s/
├── deployment.yaml      # MCP server deployment
├── service.yaml        # Cluster service
├── pvc.yaml           # Persistent claims
├── configmap.yaml     # Environment config
├── hpa.yaml          # Horizontal pod autoscaler
└── ingress.yaml      # Optional ingress
```

## Next Steps

1. [ ] Test single-node K3s on Pi 5
2. [ ] Build Docker image and push to registry
3. [ ] Setup NFS or Longhorn for shared storage
4. [ ] Deploy and test scaling
5. [ ] Configure Claude Code to use cluster endpoint

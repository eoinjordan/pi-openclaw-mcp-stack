# Agentic MCP K8s Manifests

## Quick Deploy

### Option 1: Helm Chart (Recommended)

```bash
# 1. Build and push image
docker build -t your-registry/agentic-mcp:latest ./agentic-mcp
docker push your-registry/agentic-mcp:latest

# 2. Install with Helm
cd agentic-mcp/k8s/helm
helm install agentic-mcp ./agentic-mcp \
  --set image.repository=your-registry/agentic-mcp \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=mcp.yourdomain.com

# 3. Check status
kubectl get pods -l app.kubernetes.io/name=agentic-mcp
kubectl get svc agentic-mcp

# 4. Scale
kubectl scale deployment agentic-mcp --replicas=5
```

### Option 2: Raw Manifests

```bash
# 1. Build and push image
docker build -t your-registry/agentic-mcp:latest ./agentic-mcp
docker push your-registry/agentic-mcp:latest

# 2. Deploy
kubectl apply -f k8s/

# 3. Check status
kubectl get pods -l app=agentic-mcp
kubectl get svc agentic-mcp

# 4. Scale
kubectl scale deployment agentic-mcp --replicas=5
```

## Prerequisites

1. **K3s cluster** - Install K3s on Pi nodes
2. **Storage** - NFS or Longhorn for ReadWriteMany PVCs
3. **MetalLB** - For LoadBalancer (see metallb-ingress.md)
4. **NGINX Ingress** - For HTTPS/TLS (see metallb-ingress.md)
5. **NVIDIA GPU** (optional) - Install nvidia-device-plugin

## Configuration

### Helm Values

```yaml
# values-custom.yaml
config:
  llmProvider: "huggingface"
  adapterRepo: "<your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct"

persistence:
  storageClass: "nfs"  # or longhorn

ingress:
  enabled: true
  hosts:
    - host: mcp.yourdomain.com
```

### Secrets

```bash
# Create secret for sensitive keys
kubectl create secret generic agentic-mcp-secret \
  --from-literal=HF_TOKEN=your-hf-token \
  --from-literal=EI_API_KEY=your-ei-key
```

## Full Cluster Setup

See `metallb-ingress.md` for:
1. MetalLB installation (LoadBalancer)
2. NGINX Ingress installation
3. TLS with Let's Encrypt

## Upgrading

```bash
helm upgrade agentic-mcp ./agentic-mcp \
  --set image.tag=v0.2.0
```

## Uninstalling

```bash
helm uninstall agentic-mcp
kubectl delete pvc -l app.kubernetes.io/name=agentic-mcp
```

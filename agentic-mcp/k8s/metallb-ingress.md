# K3s + MetalLB + Ingress Setup for Pi Cluster

## Install MetalLB (Layer 2 LoadBalancer)

```bash
# Install MetalLB via kubectl
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# Wait for pods
kubectl get pods -n metallb-system -w

# Create IP address pool
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.1.240-192.168.1.250  # Adjust to your network range
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
EOF
```

## Install NGINX Ingress

```bash
# Install NGINX Ingress (ARM64 compatible)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml

# Check it's running
kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller
```

## TLS Certificate

### Option 1: Let's Encrypt (cert-manager)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Option 2: Self-signed (for testing)

```bash
# Generate self-signed cert
openssl req -x509 -nodes -days=365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=agentic-mcp.local"

# Create secret
kubectl create secret tls agentic-mcp-tls \
  --cert=tls.crt \
  --key=tls.key
```

## Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agentic-mcp
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # For Let's Encrypt:
    # cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - mcp.yourdomain.com
    secretName: agentic-mcp-tls
  rules:
  - host: mcp.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: agentic-mcp
            port:
              number: 80
```

## Complete Install Script

```bash
#!/bin/bash
set -e

echo "=== Installing MetalLB ==="
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

echo "=== Waiting for MetalLB ==="
kubectl rollout status deployment controller -n metallb-system --timeout=120s

echo "=== Creating IP Pool ==="
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.1.240-192.168.1.250
---
apiValue: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
EOF

echo "=== Installing NGINX Ingress ==="
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml

echo "=== Waiting for Ingress ==="
kubectl rollout status deployment ingress-nginx-controller -n ingress-nginx --timeout=120s

echo "=== Installing cert-manager ==="
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

echo "=== Waiting for cert-manager ==="
kubectl rollout status deployment cert-manager -n cert-manager --timeout=120s

echo "=== MetalLB + Ingress Ready ==="
echo "External IP range: 192.168.1.240-192.168.1.250"
echo "Ingress controller: kubectl get svc -n ingress-nginx"
```

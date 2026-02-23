# Project Settings Checklist

Before running deployment build calls, verify these values from project settings and impulse config:

- `projectId` is the intended project.
- `impulseId` matches the impulse to deploy.
- Deployment `type` matches target (`arduino` here).
- Inference `engine` choice is set as intended (for example `tflite-eon`).
- `modelType` aligns with device constraints (for example `int8`).

Discover available EI tools before calling them:

```bash
curl -s http://127.0.0.1:8090/tools
```

List active projects via gateway:

```bash
curl -sS -X POST http://127.0.0.1:3000/ei/run -H 'Content-Type: application/json' -d '{"name":"list_active_projects","params":{}}'
```

Use project-focused tools returned by `/tools` to inspect project configuration before build.

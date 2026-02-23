# Edge Impulse Doc Scope

Use the Edge Impulse docs index as the source of truth for page discovery:

```bash
curl -fsSL https://docs.edgeimpulse.com/llms.txt -o /tmp/edgeimpulse-llms.txt
```

Then locate pages relevant to this workflow:

```bash
grep -Ei "deployment|project settings|impulse|arduino" /tmp/edgeimpulse-llms.txt
```

Use those pages to choose valid deployment and project-setting values before tool calls.

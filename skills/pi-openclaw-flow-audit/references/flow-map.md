# Flow Map

```text
Telegram -> clawdbot -> openclaw-gateway
                       |- /arduino/validate|build -> arduino-mcp
                       |- /ei/run -> ei-mcp-bridge* -> ei-agentic-claude MCP -> Edge Impulse API
```

`ei-mcp-bridge*` means exactly one of:
- `ei-mcp-bridge` (`mcp`)
- `ei-mcp-bridge-local` (`mcp-local`)
- `ei-mcp-bridge-image` (`mcp-image`)

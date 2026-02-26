# Architecture

## Components

- `clawdbot`: Telegram bot command interface.
- `openclaw-gateway`: HTTP router plus local sketch generation/flash runner.
- `arduino-mcp`: Arduino build/validate backend.
- `ei-mcp-bridge*`: HTTP-to-stdio bridge for Edge Impulse MCP.
- `ei-agentic-claude`: MCP server that executes Edge Impulse tool calls.

## Request flow

1. Telegram user sends command/message to `clawdbot`.
2. `clawdbot` routes command to `openclaw-gateway`.
3. `openclaw-gateway` forwards:
- `/arduino/validate` and `/arduino/build` to `arduino-mcp`.
- `/arduino/example`, `/arduino/inference`, and `/arduino/flash` are handled directly in gateway using local workspace and `arduino-cli`.
- `/ei/run` to active EI bridge profile.
4. EI bridge forwards `tools/call` over stdio to `ei-agentic-claude`.
5. `ei-agentic-claude` calls Edge Impulse APIs and returns result.
6. Result flows back to user via gateway/bot.

## Endpoints

- Gateway:
- `GET /health`
- `GET /health/upstreams`
- `POST /arduino/validate`
- `POST /arduino/build`
- `POST /arduino/example`
- `POST /arduino/inference`
- `POST /arduino/flash`
- `POST /ei/run`

- EI bridge:
- `GET /health`
- `GET /tools`
- `POST /run`

## Profiles

- `mcp`: bridge with npm-installed MCP.
- `mcp-local`: bridge with local mounted MCP repo.
- `mcp-image`: bridge based on prebuilt `ei-agentic-claude-mcp` image.

Use one EI bridge profile at a time.

## Runtime Access Notes

- `openclaw-gateway` now runs `arduino-cli` for `/arduino/example`, `/arduino/inference`, and `/arduino/flash`.
- Compose mounts `./workspace/Arduino:/workspace`, `./workspace/.arduino15:/root/.arduino15`, `./outputs:/outputs`, and `/dev:/dev` into gateway.
- During `/arduino/flash`, gateway can auto-install the EI ZIP (`EI_LIBRARY_ZIP_PATH`, default `/outputs/ei_arduino_deployment.zip`) when compile fails on missing `*_inferencing.h`.
- Treat Telegram access as hardware-control access, because bot commands can trigger firmware generation and flashing.

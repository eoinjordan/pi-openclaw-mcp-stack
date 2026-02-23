require('dotenv').config()

const express = require('express')
const { spawn } = require('child_process')

const PORT = Number(process.env.EI_MCP_PORT || process.env.PORT || 8090)
const LOG_REQUESTS = (process.env.EI_MCP_LOG_REQUESTS || '').trim() === '1'
const REQUEST_TIMEOUT_MS_RAW = Number(process.env.EI_MCP_REQUEST_TIMEOUT_MS || 120_000)
const REQUEST_TIMEOUT_MS = Number.isFinite(REQUEST_TIMEOUT_MS_RAW) && REQUEST_TIMEOUT_MS_RAW > 0
  ? REQUEST_TIMEOUT_MS_RAW
  : 120_000

const app = express()
app.use(express.json({ limit: '1mb' }))
if (LOG_REQUESTS) {
  app.use((req, _res, next) => {
    console.log(`[ei-mcp-bridge] ${req.method} ${req.path}`)
    next()
  })
}

function tokenizeCommand(input) {
  const tokens = []
  let current = ''
  let quote = null
  let escaped = false

  for (const ch of input) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }

  if (current) tokens.push(current)
  return tokens
}

function resolveMcpProcessCommand() {
  const explicitCmd = (process.env.EI_MCP_CMD || '').trim()
  if (explicitCmd) {
    const parsed = tokenizeCommand(explicitCmd)
    if (parsed.length === 0) {
      throw new Error('EI_MCP_CMD is set but empty after parsing')
    }
    return { bin: parsed[0], args: parsed.slice(1), display: explicitCmd }
  }

  const bin = (process.env.EI_MCP_BIN || '').trim() || 'node'
  const argsRaw =
    (process.env.EI_MCP_ARGS || '').trim() ||
    '/usr/local/lib/node_modules/ei-agentic-claude/dist/mcp-server.js'
  const args = tokenizeCommand(argsRaw)
  return { bin, args, display: [bin, ...args].join(' ') }
}

const mcpCommand = resolveMcpProcessCommand()
const mcp = spawn(mcpCommand.bin, mcpCommand.args, { shell: false, stdio: ['pipe', 'pipe', 'inherit'] })
let buffer = ''
let nextId = 1
const pending = new Map()

function rejectAll(err) {
  for (const { reject, timeoutId } of pending.values()) {
    clearTimeout(timeoutId)
    reject(err)
  }
  pending.clear()
}

function send(method, params) {
  return new Promise((resolve, reject) => {
    if (!mcp || mcp.killed || mcp.exitCode !== null) {
      reject(new Error('MCP process is not running'))
      return
    }
    const id = nextId++
    const timeoutId = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(new Error(`MCP request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    const clearAndResolve = (result) => {
      clearTimeout(timeoutId)
      resolve(result)
    }

    const clearAndReject = (error) => {
      clearTimeout(timeoutId)
      reject(error)
    }

    pending.set(id, { resolve: clearAndResolve, reject: clearAndReject, timeoutId })
    const payload = { jsonrpc: '2.0', id, method, params }
    mcp.stdin.write(JSON.stringify(payload) + '\n', (err) => {
      if (!err) return
      const waiter = pending.get(id)
      if (!waiter) return
      pending.delete(id)
      waiter.reject(err)
    })
  })
}

mcp.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    const waiter = pending.get(msg.id)
    if (!waiter) continue
    pending.delete(msg.id)
    if (msg.error) {
      const err = new Error(msg.error.message || 'MCP error')
      err.data = msg.error
      waiter.reject(err)
    } else {
      waiter.resolve(msg.result)
    }
  }
})

mcp.on('exit', (code) => {
  rejectAll(new Error(`MCP exited with code ${code}`))
})

mcp.on('error', (error) => {
  rejectAll(error)
})

process.on('SIGTERM', () => {
  if (mcp && !mcp.killed) mcp.kill()
  process.exit(0)
})

app.get('/health', (_req, res) => {
  const running = mcp && !mcp.killed && mcp.exitCode === null
  res.json({ status: 'ok', mcpRunning: running })
})

app.get('/tools', async (_req, res) => {
  try {
    const result = await send('tools/list', {})
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

app.post('/run', async (req, res) => {
  const body = req.body || {}
  const name = body.name
  const params = body.params
  const apiKey = body.apiKey

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }

  if (LOG_REQUESTS) {
    console.log(`[ei-mcp-bridge] tool ${name}`)
  }

  try {
    const args = {}
    if (params !== undefined) args.params = params
    if (apiKey) args.apiKey = apiKey

    const result = await send('tools/call', { name, arguments: args })
    const text = result?.content?.[0]?.text
    if (typeof text === 'string') {
      try {
        res.json(JSON.parse(text))
      } catch {
        res.json({ text })
      }
      return
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.data || e.message || String(e) })
  }
})

app.listen(PORT, () => {
  console.log(`EI MCP bridge listening on :${PORT}`)
  console.log(`MCP_CMD=${mcpCommand.display}`)
})

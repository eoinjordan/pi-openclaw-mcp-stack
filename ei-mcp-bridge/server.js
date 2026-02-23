require('dotenv').config()

const express = require('express')
const { spawn } = require('child_process')

const PORT = Number(process.env.EI_MCP_PORT || process.env.PORT || 8090)
const MCP_CMD =
  process.env.EI_MCP_CMD ||
  'node /usr/local/lib/node_modules/ei-agentic-claude/dist/mcp-server.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const mcp = spawn(MCP_CMD, { shell: true, stdio: ['pipe', 'pipe', 'inherit'] })
let buffer = ''
let nextId = 1
const pending = new Map()

function rejectAll(err) {
  for (const { reject } of pending.values()) {
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
    pending.set(id, { resolve, reject })
    const payload = { jsonrpc: '2.0', id, method, params }
    mcp.stdin.write(JSON.stringify(payload) + '\n')
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
  console.log(`MCP_CMD=${MCP_CMD}`)
})

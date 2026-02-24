require('dotenv').config()

const express = require('express')
const axios = require('axios')

const app = express()
app.use(express.json())

const PORT = Number(process.env.GATEWAY_PORT || 3000)
const LOG_REQUESTS = (process.env.GATEWAY_LOG_REQUESTS || '').trim() === '1'
const ARDUINO_VALIDATE_TIMEOUT_MS = Number(process.env.ARDUINO_VALIDATE_TIMEOUT_MS || 1_200_000)
const ARDUINO_BUILD_TIMEOUT_MS = Number(process.env.ARDUINO_BUILD_TIMEOUT_MS || 1_200_000)
const EI_RUN_TIMEOUT_MS = Number(process.env.EI_RUN_TIMEOUT_MS || 600_000)

const ARDUINO_MCP = process.env.ARDUINO_MCP || 'http://127.0.0.1:3080'
const EI_MCP = process.env.EI_MCP || 'http://127.0.0.1:8090'

if (LOG_REQUESTS) {
  app.use((req, _res, next) => {
    console.log(`[gateway] ${req.method} ${req.path}`)
    next()
  })
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

async function checkUpstreamHealth(baseUrl) {
  try {
    const r = await axios.get(`${baseUrl}/health`, { timeout: 5_000 })
    return { ok: true, status: r.status, data: r.data }
  } catch (e) {
    return {
      ok: false,
      status: e?.response?.status || null,
      error: e?.response?.data || e?.message || String(e)
    }
  }
}

app.get('/health/upstreams', async (_req, res) => {
  const [arduino, ei] = await Promise.all([
    checkUpstreamHealth(ARDUINO_MCP),
    checkUpstreamHealth(EI_MCP)
  ])
  const healthy = arduino.ok && ei.ok
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    arduino,
    ei
  })
})

function sendAxiosError(res, e) {
  const status = e?.response?.status || 500
  const data = e?.response?.data
  if (data && typeof data === 'object') {
    res.status(status).json(data)
    return
  }
  res.status(status).json({ error: data || e.message || String(e) })
}

app.post('/arduino/validate', async (req, res) => {
  try {
    const r = await axios.post(`${ARDUINO_MCP}/validate`, req.body, {
      timeout: ARDUINO_VALIDATE_TIMEOUT_MS
    })
    res.json(r.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.post('/arduino/build', async (req, res) => {
  try {
    const r = await axios.post(`${ARDUINO_MCP}/build`, req.body, { timeout: ARDUINO_BUILD_TIMEOUT_MS })
    res.json(r.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.post('/ei/run', async (req, res) => {
  try {
    const r = await axios.post(`${EI_MCP}/run`, req.body, { timeout: EI_RUN_TIMEOUT_MS })
    res.json(r.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`)
  console.log(`ARDUINO_MCP=${ARDUINO_MCP}`)
  console.log(`EI_MCP=${EI_MCP}`)
})

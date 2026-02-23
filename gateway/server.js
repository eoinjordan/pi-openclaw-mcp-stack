require('dotenv').config()

const express = require('express')
const axios = require('axios')

const app = express()
app.use(express.json())

const PORT = Number(process.env.GATEWAY_PORT || 3000)

const ARDUINO_MCP = process.env.ARDUINO_MCP || 'http://127.0.0.1:3080'
const EI_MCP = process.env.EI_MCP || 'http://127.0.0.1:8090'

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/arduino/validate', async (req, res) => {
  try {
    const r = await axios.post(`${ARDUINO_MCP}/validate`, req.body, { timeout: 120_000 })
    res.json(r.data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/arduino/build', async (req, res) => {
  try {
    const r = await axios.post(`${ARDUINO_MCP}/build`, req.body, { timeout: 600_000 })
    res.json(r.data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/ei/run', async (req, res) => {
  try {
    const r = await axios.post(`${EI_MCP}/run`, req.body, { timeout: 600_000 })
    res.json(r.data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`)
  console.log(`ARDUINO_MCP=${ARDUINO_MCP}`)
  console.log(`EI_MCP=${EI_MCP}`)
})

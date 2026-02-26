require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const OpenAI = require('openai')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
const EI_API_KEY = process.env.EI_API_KEY
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN')

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true })
const hasChatProvider = Boolean(OPENAI_API_KEY || OPENAI_BASE_URL)
const openai = hasChatProvider
  ? new OpenAI({
      apiKey: OPENAI_API_KEY || 'ollama',
      ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {})
    })
  : null

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000'
const DEFAULT_PROJECT_ROOT = process.env.DEFAULT_ARDUINO_PROJECT_ROOT || '/workspace/Blink'
const ARDUINO_VALIDATE_TIMEOUT_MS = Number(process.env.ARDUINO_VALIDATE_TIMEOUT_MS || 1_200_000)
const ARDUINO_BUILD_TIMEOUT_MS = Number(process.env.ARDUINO_BUILD_TIMEOUT_MS || 1_200_000)
const ARDUINO_FLASH_TIMEOUT_MS = Number(process.env.ARDUINO_FLASH_TIMEOUT_MS || 1_200_000)
const EI_RUN_TIMEOUT_MS = Number(process.env.EI_RUN_TIMEOUT_MS || 600_000)
const isOllamaMode = Boolean(OPENAI_BASE_URL && /:11434(\/|$)/.test(OPENAI_BASE_URL))
const DEFAULT_CHAT_MODEL = process.env.OPENAI_MODEL || (isOllamaMode ? 'qwen2.5:3b-instruct' : 'gpt-4o-mini')
const EI_PROJECT_ID = /^\d+$/.test(String(process.env.EI_PROJECT_ID || '').trim())
  ? Number(process.env.EI_PROJECT_ID)
  : null
const EI_IMPULSE_ID = /^\d+$/.test(String(process.env.EI_IMPULSE_ID || '').trim())
  ? Number(process.env.EI_IMPULSE_ID)
  : null

const HELP_TEXT = [
  'Commands:',
  '- example blink',
  '- example servo [360] [on d12]',
  '- inference led [label] [threshold]',
  '- inference servo [label] [threshold] [360] [on d12]',
  '- build arduino',
  '- validate arduino',
  '- flash arduino [/dev/ttyACM0]',
  '- flash example blink|servo [360] [on d12] [/dev/ttyACM0]',
  '- flash inference led|servo [label] [threshold] [360] [on d12] [/dev/ttyACM0]',
  '- ei projects',
  '- ei project [projectId]',
  '- ei build arduino [projectId] [impulseId]',
  '- ei job <jobId> [projectId]',
  '- health',
  '- models',
  '- help'
].join('\n')

function formatAxiosError(e) {
  const status = e?.response?.status
  const data = e?.response?.data
  if (status) {
    const detail = data ? JSON.stringify(data) : 'no body'
    return `HTTP ${status}: ${detail}`
  }
  return e?.message || String(e)
}

function isModelNotFoundError(e) {
  const status = e?.status || e?.response?.status || e?.cause?.status
  const payload = e?.response?.data || e?.error || e?.message || ''
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return status === 404 && /model/i.test(text) && /not found/i.test(text)
}

function getOllamaBaseFromOpenAIBase(baseUrl) {
  try {
    const u = new URL(baseUrl)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

async function listOllamaModels() {
  if (!OPENAI_BASE_URL) return []
  const base = getOllamaBaseFromOpenAIBase(OPENAI_BASE_URL)
  if (!base) return []
  try {
    const r = await axios.get(`${base}/api/tags`, { timeout: 10_000 })
    const models = Array.isArray(r?.data?.models) ? r.data.models : []
    return models.map((m) => m?.name).filter(Boolean)
  } catch {
    return []
  }
}

async function chatWithModel(userText, model) {
  return openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: userText }]
  })
}

function parseInferenceOptions(tokens, startIndex) {
  let positiveLabel = 'positive'
  let threshold = 0.8
  let port = null

  const remainder = tokens.slice(startIndex)
  const filtered = []

  for (let i = 0; i < remainder.length; i += 1) {
    const token = remainder[i]
    const tokenLower = String(token).toLowerCase()
    if (/^\/dev\//i.test(token)) {
      port = token
      continue
    }
    if (tokenLower === '360') continue
    if (tokenLower === 'on') {
      i += 1
      continue
    }
    if (/^d\d+$/i.test(token)) continue
    filtered.push(token)
  }

  if (filtered[0] && Number.isNaN(Number(filtered[0]))) {
    positiveLabel = filtered[0]
  }
  if (filtered[1]) {
    const asNum = Number(filtered[1])
    if (Number.isFinite(asNum)) {
      threshold = Math.max(0, Math.min(1, asNum))
    }
  }

  return { positiveLabel, threshold, port }
}

function parseOptionalPort(tokens, idx) {
  const token = tokens[idx]
  return token && /^\/dev\//i.test(token) ? token : null
}

function parseServoConfig(input) {
  const text = String(input || '').toLowerCase()
  const servoType = /\b360\b/.test(text) ? '360' : 'positional'
  const pinMatch = text.match(/\b(?:on\s+)?d(\d+)\b/) || text.match(/\bon\s+(\d+)\b/)
  const servoPin = pinMatch ? Number(pinMatch[1]) : null
  return { servoType, servoPin }
}

function parseOptionalIntegerToken(token) {
  if (!token) return null
  const parsed = Number(token)
  return Number.isInteger(parsed) ? parsed : null
}

function renderJsonForTelegram(label, payload) {
  const text = `${label}\n${JSON.stringify(payload, null, 2)}`
  if (text.length <= 3900) return text
  return `${text.slice(0, 3800)}\n...(truncated)`
}

function tailLines(text, count = 10) {
  if (!text) return ''
  return String(text).trim().split('\n').slice(-count).join('\n')
}

function flashSummary(payload) {
  const projectRoot = payload?.projectRoot || '(unknown project)'
  const port = payload?.port || '(unknown port)'
  const uploadTail = tailLines(payload?.upload?.stdout || payload?.upload?.stderr || '')
  const compileTail = tailLines(payload?.compile?.stdout || payload?.compile?.stderr || '')
  const lines = [
    `Flash ok: ${projectRoot} -> ${port}`
  ]
  if (compileTail) lines.push(`Compile:\n${compileTail}`)
  if (uploadTail) lines.push(`Upload:\n${uploadTail}`)
  return lines.join('\n\n')
}

async function postGateway(path, body, timeoutMs) {
  const r = await axios.post(`${GATEWAY_URL}${path}`, body, { timeout: timeoutMs })
  return r.data
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()
  if (!text) return
  const cmd = text.toLowerCase()

  try {
    if (cmd === 'help' || cmd === '/start' || cmd === '?') {
      await bot.sendMessage(chatId, HELP_TEXT)
      return
    }

    if (cmd === 'health') {
      const r = await axios.get(`${GATEWAY_URL}/health/upstreams`, {
        timeout: 15_000,
        validateStatus: () => true
      })
      await bot.sendMessage(chatId, `Stack health (${r.status}):\n` + JSON.stringify(r.data, null, 2))
      return
    }

    if (cmd === 'validate arduino') {
      const r = await axios.post(
        `${GATEWAY_URL}/arduino/validate`,
        { projectRoot: DEFAULT_PROJECT_ROOT },
        { timeout: ARDUINO_VALIDATE_TIMEOUT_MS }
      )
      await bot.sendMessage(chatId, 'Validate result:\n' + JSON.stringify(r.data, null, 2))
      return
    }

    if (cmd === 'build arduino') {
      const r = await axios.post(
        `${GATEWAY_URL}/arduino/build`,
        { projectRoot: DEFAULT_PROJECT_ROOT },
        { timeout: ARDUINO_BUILD_TIMEOUT_MS }
      )
      await bot.sendMessage(chatId, 'Build result:\n' + JSON.stringify(r.data, null, 2))
      return
    }

    if (cmd === 'example blink' || cmd === 'example servo' || cmd.startsWith('example servo ')) {
      const example = cmd.startsWith('example servo') ? 'servo' : 'blink'
      const servoConfig = parseServoConfig(text)
      const out = await postGateway(
        '/arduino/example',
        {
          example,
          projectRoot: DEFAULT_PROJECT_ROOT,
          ...(example === 'servo' ? { servoType: servoConfig.servoType } : {}),
          ...(example === 'servo' && servoConfig.servoPin !== null ? { servoPin: servoConfig.servoPin } : {})
        },
        ARDUINO_VALIDATE_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, 'Example sketch generated:\n' + JSON.stringify(out, null, 2))
      return
    }

    if (cmd === 'inference led' || cmd === 'inference servo' || cmd.startsWith('inference led ') || cmd.startsWith('inference servo ')) {
      const tokens = text.split(/\s+/)
      const actuator = (tokens[1] || '').toLowerCase()
      const { positiveLabel, threshold } = parseInferenceOptions(tokens, 2)
      const servoConfig = actuator === 'servo' ? parseServoConfig(text) : null
      const out = await postGateway(
        '/arduino/inference',
        {
          actuator,
          projectRoot: DEFAULT_PROJECT_ROOT,
          positiveLabel,
          threshold,
          ...(actuator === 'servo' ? { servoType: servoConfig.servoType } : {}),
          ...(actuator === 'servo' && servoConfig.servoPin !== null ? { servoPin: servoConfig.servoPin } : {})
        },
        ARDUINO_VALIDATE_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, 'Inference sketch generated:\n' + JSON.stringify(out, null, 2))
      return
    }

    if (cmd === 'flash arduino' || cmd.startsWith('flash arduino ')) {
      const tokens = text.split(/\s+/)
      const port = parseOptionalPort(tokens, 2)
      const out = await postGateway(
        '/arduino/flash',
        { projectRoot: DEFAULT_PROJECT_ROOT, ...(port ? { port } : {}) },
        ARDUINO_FLASH_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, flashSummary(out))
      return
    }

    if (cmd.startsWith('flash example ')) {
      const tokens = text.split(/\s+/)
      const example = (tokens[2] || '').toLowerCase()
      if (!['blink', 'servo'].includes(example)) {
        await bot.sendMessage(chatId, 'Usage: flash example blink|servo [360] [on d12] [/dev/ttyACM0]')
        return
      }
      const port = tokens.find((t) => /^\/dev\//i.test(t)) || null
      const servoConfig = example === 'servo' ? parseServoConfig(text) : null
      await postGateway(
        '/arduino/example',
        {
          example,
          projectRoot: DEFAULT_PROJECT_ROOT,
          ...(example === 'servo' ? { servoType: servoConfig.servoType } : {}),
          ...(example === 'servo' && servoConfig.servoPin !== null ? { servoPin: servoConfig.servoPin } : {})
        },
        ARDUINO_VALIDATE_TIMEOUT_MS
      )
      const out = await postGateway(
        '/arduino/flash',
        { projectRoot: DEFAULT_PROJECT_ROOT, ...(port ? { port } : {}) },
        ARDUINO_FLASH_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, flashSummary(out))
      return
    }

    if (cmd.startsWith('flash inference ')) {
      const tokens = text.split(/\s+/)
      const actuator = (tokens[2] || '').toLowerCase()
      if (!['led', 'servo'].includes(actuator)) {
        await bot.sendMessage(chatId, 'Usage: flash inference led|servo [label] [threshold] [360] [on d12] [/dev/ttyACM0]')
        return
      }
      const { positiveLabel, threshold, port } = parseInferenceOptions(tokens, 3)
      const servoConfig = actuator === 'servo' ? parseServoConfig(text) : null
      await postGateway(
        '/arduino/inference',
        {
          actuator,
          projectRoot: DEFAULT_PROJECT_ROOT,
          positiveLabel,
          threshold,
          ...(actuator === 'servo' ? { servoType: servoConfig.servoType } : {}),
          ...(actuator === 'servo' && servoConfig.servoPin !== null ? { servoPin: servoConfig.servoPin } : {})
        },
        ARDUINO_VALIDATE_TIMEOUT_MS
      )
      const out = await postGateway(
        '/arduino/flash',
        { projectRoot: DEFAULT_PROJECT_ROOT, ...(port ? { port } : {}) },
        ARDUINO_FLASH_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, flashSummary(out))
      return
    }

    if (cmd === 'ei projects') {
      const out = await postGateway(
        '/ei/run',
        { name: 'get_current_user_projects', params: {} },
        EI_RUN_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, renderJsonForTelegram('EI projects:', out))
      return
    }

    if (cmd === 'ei project' || cmd.startsWith('ei project ')) {
      if (!EI_API_KEY) {
        await bot.sendMessage(chatId, 'Missing EI_API_KEY in .env for project-scoped EI calls.')
        return
      }
      const tokens = text.split(/\s+/)
      const projectId = parseOptionalIntegerToken(tokens[2]) || EI_PROJECT_ID
      if (!projectId) {
        await bot.sendMessage(chatId, 'Usage: ei project [projectId] (or set EI_PROJECT_ID in .env)')
        return
      }
      const out = await postGateway(
        '/ei/run',
        { name: 'project_information', apiKey: EI_API_KEY, params: { projectId } },
        EI_RUN_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, renderJsonForTelegram('EI project information:', out))
      return
    }

    if (cmd === 'ei build arduino' || cmd.startsWith('ei build arduino ')) {
      if (!EI_API_KEY) {
        await bot.sendMessage(chatId, 'Missing EI_API_KEY in .env for EI build command.')
        return
      }
      const tokens = text.split(/\s+/)
      const projectId = parseOptionalIntegerToken(tokens[3]) || EI_PROJECT_ID
      const impulseId = parseOptionalIntegerToken(tokens[4]) || EI_IMPULSE_ID
      if (!projectId || !impulseId) {
        await bot.sendMessage(chatId, 'Usage: ei build arduino [projectId] [impulseId] (or set EI_PROJECT_ID and EI_IMPULSE_ID in .env)')
        return
      }
      const out = await postGateway(
        '/ei/run',
        {
          name: 'build_on_device_model',
          apiKey: EI_API_KEY,
          params: {
            projectId,
            type: 'arduino',
            impulseId,
            engine: 'tflite-eon',
            modelType: 'int8'
          }
        },
        EI_RUN_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, renderJsonForTelegram('EI build started:', out))
      return
    }

    if (cmd === 'ei job' || cmd.startsWith('ei job ')) {
      if (!EI_API_KEY) {
        await bot.sendMessage(chatId, 'Missing EI_API_KEY in .env for EI job status command.')
        return
      }
      const tokens = text.split(/\s+/)
      const jobId = parseOptionalIntegerToken(tokens[2])
      const projectId = parseOptionalIntegerToken(tokens[3]) || EI_PROJECT_ID
      if (!jobId || !projectId) {
        await bot.sendMessage(chatId, 'Usage: ei job <jobId> [projectId] (or set EI_PROJECT_ID in .env)')
        return
      }
      const out = await postGateway(
        '/ei/run',
        {
          name: 'get_job_status_openapi_b8230c81',
          apiKey: EI_API_KEY,
          params: { projectId, jobId }
        },
        EI_RUN_TIMEOUT_MS
      )
      await bot.sendMessage(chatId, renderJsonForTelegram('EI job status:', out))
      return
    }

    if (cmd === 'models' || cmd === 'model') {
      if (!hasChatProvider) {
        await bot.sendMessage(chatId, 'No chat provider configured. Set OPENAI_BASE_URL or OPENAI_API_KEY.')
        return
      }
      if (!isOllamaMode) {
        await bot.sendMessage(chatId, `Active model: ${DEFAULT_CHAT_MODEL}`)
        return
      }
      const models = await listOllamaModels()
      const lines = models.length ? models.map((m) => `- ${m}`) : ['(none returned)']
      await bot.sendMessage(
        chatId,
        `Active model: ${DEFAULT_CHAT_MODEL}\nAvailable Ollama models:\n${lines.join('\n')}`
      )
      return
    }

    if (!openai) {
      await bot.sendMessage(
        chatId,
        'Chat is disabled. Set OPENAI_API_KEY or OPENAI_BASE_URL, or send "help".'
      )
      return
    }

    let completion
    try {
      completion = await chatWithModel(text, DEFAULT_CHAT_MODEL)
    } catch (e) {
      if (!isOllamaMode || !isModelNotFoundError(e)) throw e
      const available = await listOllamaModels()
      const fallback = available[0]
      if (!fallback || fallback === DEFAULT_CHAT_MODEL) {
        throw new Error(
          `Configured model '${DEFAULT_CHAT_MODEL}' not found in Ollama. ` +
          `Set OPENAI_MODEL to one of: ${available.join(', ') || '(no models found)'}.`
        )
      }
      completion = await chatWithModel(text, fallback)
    }

    const out = completion.choices?.[0]?.message?.content || '(no content)'
    await bot.sendMessage(chatId, out)
  } catch (e) {
    await bot.sendMessage(chatId, `Error: ${formatAxiosError(e)}`)
  }
})

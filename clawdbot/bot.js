require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const OpenAI = require('openai')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
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
const isOllamaMode = Boolean(OPENAI_BASE_URL && /:11434(\/|$)/.test(OPENAI_BASE_URL))
const DEFAULT_CHAT_MODEL = process.env.OPENAI_MODEL || (isOllamaMode ? 'qwen2.5:3b-instruct' : 'gpt-4o-mini')

const HELP_TEXT = [
  'Commands:',
  '- build arduino',
  '- validate arduino',
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

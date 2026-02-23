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

const HELP_TEXT = [
  'Commands:',
  '- build arduino',
  '- validate arduino',
  '- health',
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

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()
  if (!text) return
  const cmd = text.toLowerCase()

  try {
    if (cmd === 'help' || cmd === '/start') {
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
        { timeout: 120_000 }
      )
      await bot.sendMessage(chatId, 'Validate result:\n' + JSON.stringify(r.data, null, 2))
      return
    }

    if (cmd === 'build arduino') {
      const r = await axios.post(
        `${GATEWAY_URL}/arduino/build`,
        { projectRoot: DEFAULT_PROJECT_ROOT },
        { timeout: 600_000 }
      )
      await bot.sendMessage(chatId, 'Build result:\n' + JSON.stringify(r.data, null, 2))
      return
    }

    if (!openai) {
      await bot.sendMessage(
        chatId,
        'Chat is disabled. Set OPENAI_API_KEY or OPENAI_BASE_URL, or send "help".'
      )
      return
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: text }]
    })

    const out = completion.choices?.[0]?.message?.content || '(no content)'
    await bot.sendMessage(chatId, out)
  } catch (e) {
    await bot.sendMessage(chatId, `Error: ${formatAxiosError(e)}`)
  }
})

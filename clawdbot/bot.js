require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const OpenAI = require('openai')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN')
if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true })
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000'
const DEFAULT_PROJECT_ROOT = process.env.DEFAULT_ARDUINO_PROJECT_ROOT || '/workspace/Blink'

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()
  if (!text) return

  try {
    if (text.toLowerCase() === 'build arduino') {
      const r = await axios.post(
        `${GATEWAY_URL}/arduino/build`,
        { projectRoot: DEFAULT_PROJECT_ROOT },
        { timeout: 600_000 }
      )
      await bot.sendMessage(chatId, 'Build result:\n' + JSON.stringify(r.data, null, 2))
      return
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: text }]
    })

    const out = completion.choices?.[0]?.message?.content || '(no content)'
    await bot.sendMessage(chatId, out)
  } catch (e) {
    await bot.sendMessage(chatId, `Error: ${e.message}`)
  }
})

FROM node:20-bookworm-slim
WORKDIR /app
RUN npm install axios node-telegram-bot-api dotenv openai
COPY bot.js .
CMD ["node", "bot.js"]

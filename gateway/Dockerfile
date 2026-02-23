FROM node:20-bookworm-slim
WORKDIR /app
RUN npm install express axios dotenv
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]

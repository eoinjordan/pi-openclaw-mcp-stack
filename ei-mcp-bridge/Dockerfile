FROM node:20-bookworm-slim
WORKDIR /app
RUN npm install express dotenv
RUN npm install -g ei-agentic-claude
COPY server.js .
EXPOSE 8090
CMD ["node", "server.js"]

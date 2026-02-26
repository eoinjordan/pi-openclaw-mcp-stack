FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s -- -b /usr/local/bin \
 && npm install express axios dotenv \
 && rm -rf /var/lib/apt/lists/*
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]

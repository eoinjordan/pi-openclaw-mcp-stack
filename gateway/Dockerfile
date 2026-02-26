FROM node:20-bookworm-slim
WORKDIR /app
ARG ARDUINO_CLI_VERSION=0.35.3
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
 && (curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s -- -b /usr/local/bin "${ARDUINO_CLI_VERSION}" \
     || apt-get install -y --no-install-recommends arduino-cli) \
 && command -v arduino-cli \
 && npm install express axios dotenv \
 && rm -rf /var/lib/apt/lists/*
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]

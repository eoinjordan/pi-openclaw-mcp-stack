FROM node:20-bookworm-slim
WORKDIR /app
ARG ARDUINO_CLI_VERSION=0.35.3
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_ARM64.tar.gz" -o /tmp/arduino-cli.tar.gz \
 && tar -xzf /tmp/arduino-cli.tar.gz -C /usr/local/bin arduino-cli \
 && chmod +x /usr/local/bin/arduino-cli \
 && command -v arduino-cli \
 && rm -f /tmp/arduino-cli.tar.gz \
 && npm install express axios dotenv \
 && rm -rf /var/lib/apt/lists/*
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:20-bookworm-slim
WORKDIR /app
ARG ARDUINO_CLI_VERSION=0.35.3
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && ARCH="$(dpkg --print-architecture)" \
 && case "$ARCH" in \
      arm64) CLI_ARCH='ARM64' ;; \
      amd64) CLI_ARCH='64bit' ;; \
      armhf) CLI_ARCH='ARMv7' ;; \
      *) echo "Unsupported architecture for arduino-cli: $ARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_${CLI_ARCH}.tar.gz" -o /tmp/arduino-cli.tar.gz \
 && tar -xzf /tmp/arduino-cli.tar.gz -C /usr/local/bin arduino-cli \
 && chmod +x /usr/local/bin/arduino-cli \
 && command -v arduino-cli \
 && rm -f /tmp/arduino-cli.tar.gz \
 && npm install express axios dotenv \
 && rm -rf /var/lib/apt/lists/*
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]

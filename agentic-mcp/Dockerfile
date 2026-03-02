FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY agentic-mcp/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agentic-mcp/ .

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "agentic_mcp.server", "--transport", "stdio"]

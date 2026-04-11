FROM python:3.11-slim

# All system deps: WeasyPrint (PDF) + Playwright Chromium (bot automation)
RUN apt-get update && apt-get install -y --no-install-recommends \
        # WeasyPrint
        libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
        libcairo2 libfontconfig1 libgdk-pixbuf-2.0-0 \
        libxml2 libxslt1.1 \
        # Playwright Chromium
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: Python deps (cached until requirements.txt changes)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

# Layer 2: Playwright Chromium browser
ENV PLAYWRIGHT_BROWSERS_PATH=/playwright-browsers
RUN playwright install chromium && chmod -R 755 /playwright-browsers

# Layer 3: Application code
COPY backend/ ./backend/
COPY bot/     ./bot/

ENV PYTHONPATH=/app/backend:/app
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

# Start script: run API + ARQ worker in same container
CMD ["sh", "-c", "\
  uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 & \
  python -m arq workers.bot_worker.WorkerSettings & \
  wait -n"]

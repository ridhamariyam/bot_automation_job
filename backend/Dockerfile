FROM python:3.10-slim

# System deps: build tools + all Chromium runtime libraries
# (listed manually because `playwright install --with-deps` fails on Debian Trixie)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libatspi2.0-0 libwayland-client0 \
    fonts-liberation libx11-6 libxcb1 libxext6 libxfont2 \
    && apt-get install -y --no-install-recommends libasound2t64 2>/dev/null \
    || apt-get install -y --no-install-recommends libasound2 2>/dev/null \
    ; rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

# Download only the Chromium binary (no apt calls, deps already installed above)
RUN python -m playwright install chromium

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

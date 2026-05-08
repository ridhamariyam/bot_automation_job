FROM python:3.11-slim

# ── System dependencies ─────────────────────────────────────────────────────
# WeasyPrint (PDF generation) + Playwright Chromium (browser automation)
# libasound2t64 / libasound2 split: Debian Bookworm renamed the package;
# try the new name first, fall back to the old name for older base images.
RUN apt-get update && apt-get install -y --no-install-recommends \
        # WeasyPrint
        libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
        libcairo2 libfontconfig1 libgdk-pixbuf-2.0-0 \
        libxml2 libxslt1.1 \
        # Playwright Chromium runtime
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
        libcairo2 libatspi2.0-0 libwayland-client0 \
        fonts-liberation libx11-6 libxcb1 libxext6 \
    && ( apt-get install -y --no-install-recommends libasound2t64 2>/dev/null \
         || apt-get install -y --no-install-recommends libasound2 2>/dev/null ) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: Python deps (cached until requirements.txt changes)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

# Layer 2: Playwright Chromium browser binary
ENV PLAYWRIGHT_BROWSERS_PATH=/playwright-browsers
RUN playwright install chromium && chmod -R 755 /playwright-browsers

# Layer 3: Application code
COPY backend/ ./backend/
COPY bot/     ./bot/
COPY docker-start.sh /docker-start.sh
RUN chmod +x /docker-start.sh

ENV PYTHONPATH=/app/backend:/app
ENV PYTHONUNBUFFERED=1

EXPOSE 10000

WORKDIR /app/backend

CMD ["/docker-start.sh"]

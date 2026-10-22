FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg chromium fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
COPY docker/content-production/requirements.txt /opt/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /opt/requirements.txt
COPY docker/content-production/renderer /opt/renderer
WORKDIR /opt/renderer
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY etl/groland_postgres/scripts /opt/worker
ENV PATH="/opt/venv/bin:$PATH" PYTHONPATH=/opt/worker PYTHONDONTWRITEBYTECODE=1 \
    CREATIVE_CRAFT_PRODUCTION_DIR=/opt/renderer CONTENT_PRODUCTION_WORK_DIR=/work \
    PRODUCER_HEADLESS_SHELL_PATH=/usr/bin/chromium CONTENT_PRODUCTION_NODE=node
RUN useradd --uid 10001 --create-home worker && mkdir /work && chown worker:worker /work
USER 10001:10001
WORKDIR /work
CMD ["python", "-m", "content_production.worker"]

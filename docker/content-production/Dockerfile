FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
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

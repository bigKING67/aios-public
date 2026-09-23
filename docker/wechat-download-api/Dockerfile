ARG UPSTREAM_IMAGE=tmwgsicp/wechat-download-api@sha256:6977f00af2334af4a8dc9ed19d0a82a5214fd4eca4d1c724f7d14b1299cc66ec

FROM ${UPSTREAM_IMAGE} AS derived-base

LABEL org.opencontainers.image.source="https://github.com/tmwgsicp/wechat-download-api" \
      org.opencontainers.image.revision="fd70a886a82a8838312e2439bb0eed1c2e1ad00b" \
      org.opencontainers.image.version="v1.7.0-aios.1" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.groland.aios.upstream-image="tmwgsicp/wechat-download-api@sha256:6977f00af2334af4a8dc9ed19d0a82a5214fd4eca4d1c724f7d14b1299cc66ec"

COPY LICENSE /opt/aios-derived/LICENSE
COPY upstream.lock.json /opt/aios-derived/upstream.lock.json
COPY overlay/routes/articles.py /app/routes/articles.py
COPY overlay/routes/health.py /app/routes/health.py
COPY overlay/utils/article_list_client.py /app/utils/article_list_client.py
COPY overlay/utils/http_client.py /app/utils/http_client.py
COPY overlay/utils/proxy_pool.py /app/utils/proxy_pool.py
COPY overlay/utils/rss_poller.py /app/utils/rss_poller.py

FROM derived-base AS test

COPY tests /opt/aios-derived/tests
RUN python -m unittest discover -s /opt/aios-derived/tests -v

FROM derived-base AS production

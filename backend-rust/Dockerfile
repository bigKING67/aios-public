# syntax=docker/dockerfile:1.7

FROM rust:1.88-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
  --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
  --mount=type=cache,target=/app/target-cache,sharing=locked \
  CARGO_TARGET_DIR=/app/target-cache cargo build --release \
  && cp /app/target-cache/release/aios-backend-rust /app/aios-backend-rust

FROM debian:bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/aios-backend-rust /usr/local/bin/aios-backend-rust

ENV RUST_API_HOST=0.0.0.0
ENV RUST_API_PORT=8000

EXPOSE 8000

CMD ["aios-backend-rust"]

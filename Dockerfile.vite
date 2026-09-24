# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit

FROM node:24-alpine AS builder
WORKDIR /app

ARG VITE_API_GATEWAY_PREFIX=/v1
ARG VITE_FORCE_FRESH_DATA=0
ARG VITE_SAMPLE_INVENTORY_ACCESS_MODE=authenticated

ENV VITE_API_GATEWAY_PREFIX=${VITE_API_GATEWAY_PREFIX}
ENV VITE_FORCE_FRESH_DATA=${VITE_FORCE_FRESH_DATA}
ENV VITE_SAMPLE_INVENTORY_ACCESS_MODE=${VITE_SAMPLE_INVENTORY_ACCESS_MODE}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:vite

FROM nginx:1.27-alpine AS runner
WORKDIR /usr/share/nginx/html

COPY docker/nginx-vite.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web-vite/dist ./

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

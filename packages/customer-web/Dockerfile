# syntax=docker/dockerfile:1
#
# Multi-stage, workspace-aware build for @parking/customer-web.
# Build context MUST be the monorepo root, e.g.:
#   docker build -f packages/customer-web/Dockerfile --build-arg VITE_API_URL=https://api.example.com .

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/customer-web/package.json packages/customer-web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY packages/customer-web packages/customer-web

# Vite inlines VITE_* env vars into the built bundle at build time, so the
# API's public URL must be supplied as a build arg rather than a runtime env var.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build -w @parking/shared
RUN npm run build -w @parking/customer-web

FROM nginx:alpine AS runtime
COPY --from=builder /app/packages/customer-web/dist /usr/share/nginx/html
COPY packages/customer-web/nginx.conf /etc/nginx/templates/default.conf.template

# nginx's official entrypoint runs envsubst over conf.d/*.template files,
# substituting only variables present in the container environment, so
# nginx directives like $uri are left untouched while ${PORT} resolves to
# whatever port the host (e.g. Railway) assigns.
ENV PORT=80
EXPOSE 80

# syntax=docker/dockerfile:1
#
# Multi-stage, workspace-aware build for @parking/api.
# Build context MUST be the monorepo root, e.g.:
#   docker build -f packages/api/Dockerfile .

FROM node:20-alpine AS builder
WORKDIR /app

# Copy only the manifests needed to resolve the workspace dependency graph
# so `npm ci` is cached independently of source changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY packages/api packages/api

# @parking/api imports the compiled @parking/shared package (resolved via
# the npm workspace symlink), so shared must be built first.
RUN npm run build -w @parking/shared
RUN npm run build -w @parking/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/api/dist packages/api/dist
COPY packages/api/migrations packages/api/migrations

WORKDIR /app/packages/api
EXPOSE 3000

# Migrations run on every boot so the schema is always current before the
# server starts accepting traffic; this is the deployment target's only
# migration trigger (no separate migration step in CI/CD for this POC).
CMD ["sh", "-c", "npm run migrate && node dist/main.js"]

# ============================================================
# Multi-target Dockerfile for Railway
# ============================================================
# Build context: tal-yield-agent/ (monorepo root)
#
# Usage:
#   docker build --build-arg TARGET=agent-server .
#   docker build --build-arg TARGET=agent-worker .
#
# Railway: set TARGET env var as a build arg per service.
# ============================================================

ARG TARGET=agent-server

# --- Stage 1: Install + Build ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

WORKDIR /app

# Copy workspace config first (layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy all package.json files (pnpm needs them for workspace resolution)
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tal-sdk/package.json packages/tal-sdk/
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/agent-worker/package.json packages/agent-worker/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/

# Build all (turbo handles dependency order)
RUN pnpm run build

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

WORKDIR /app

ARG TARGET=agent-server

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy all package.json files (pnpm needs the full workspace for symlinks)
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tal-sdk/package.json packages/tal-sdk/
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/agent-worker/package.json packages/agent-worker/

# Production install
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/agent-core/dist packages/agent-core/dist
COPY --from=builder /app/packages/tal-sdk/dist packages/tal-sdk/dist
COPY --from=builder /app/packages/agent-server/dist packages/agent-server/dist
COPY --from=builder /app/packages/agent-worker/dist packages/agent-worker/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TARGET_SERVICE=${TARGET}

EXPOSE 3000

CMD node packages/${TARGET_SERVICE}/dist/index.js

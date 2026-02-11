# ============================================================
# agent-worker — BullMQ job processor + chain event listener
# ============================================================
# Build context: monorepo root (tal-yield-agent/)
# Usage: docker build -f packages/agent-worker/Dockerfile .
# ============================================================

# --- Stage 1: Install + Build ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

WORKDIR /app

# Copy workspace config first (layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy all package.json files (needed by pnpm install for workspace resolution)
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tal-sdk/package.json packages/tal-sdk/
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/agent-worker/package.json packages/agent-worker/

RUN pnpm install --frozen-lockfile

# Copy source for packages needed by agent-worker
COPY packages/shared/ packages/shared/
COPY packages/agent-core/ packages/agent-core/
COPY packages/tal-sdk/ packages/tal-sdk/
COPY packages/agent-worker/ packages/agent-worker/

# Build (turbo resolves dependency order)
RUN npx turbo run build --filter=@tal-yield-agent/agent-worker...

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy all package.json files (pnpm needs the full workspace to resolve symlinks)
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tal-sdk/package.json packages/tal-sdk/
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/agent-worker/package.json packages/agent-worker/

# Production install — creates proper pnpm workspace symlinks
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/agent-core/dist packages/agent-core/dist
COPY --from=builder /app/packages/tal-sdk/dist packages/tal-sdk/dist
COPY --from=builder /app/packages/agent-worker/dist packages/agent-worker/dist

ENV NODE_ENV=production

CMD ["node", "packages/agent-worker/dist/index.js"]

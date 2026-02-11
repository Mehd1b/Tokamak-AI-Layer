# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app

# Copy workspace root config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./

# Copy all package.json files (for dependency resolution)
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/tal-sdk/package.json packages/tal-sdk/package.json
COPY packages/agent-server/package.json packages/agent-server/package.json
COPY packages/agent-worker/package.json packages/agent-worker/package.json

RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/agent-core/node_modules ./packages/agent-core/node_modules
COPY --from=deps /app/packages/tal-sdk/node_modules ./packages/tal-sdk/node_modules
COPY --from=deps /app/packages/agent-server/node_modules ./packages/agent-server/node_modules

# Copy source
COPY pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/ packages/shared/
COPY packages/agent-core/ packages/agent-core/
COPY packages/tal-sdk/ packages/tal-sdk/
COPY packages/agent-server/ packages/agent-server/

# Build all packages (respects turbo dependency graph)
RUN npx turbo run build --filter=@tal-yield-agent/agent-server...

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /app/packages/agent-core/package.json ./packages/agent-core/package.json
COPY --from=builder /app/packages/tal-sdk/dist ./packages/tal-sdk/dist
COPY --from=builder /app/packages/tal-sdk/package.json ./packages/tal-sdk/package.json
COPY --from=builder /app/packages/agent-server/dist ./packages/agent-server/dist
COPY --from=builder /app/packages/agent-server/package.json ./packages/agent-server/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy node_modules for workspace packages
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/agent-core/node_modules ./packages/agent-core/node_modules
COPY --from=builder /app/packages/tal-sdk/node_modules ./packages/tal-sdk/node_modules
COPY --from=builder /app/packages/agent-server/node_modules ./packages/agent-server/node_modules

EXPOSE 3000

CMD ["node", "packages/agent-server/dist/index.js"]

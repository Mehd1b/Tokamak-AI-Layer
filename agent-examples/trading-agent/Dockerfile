FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

WORKDIR /app

# Copy workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy package.json for each workspace package
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tal-integration/package.json packages/tal-integration/
COPY packages/siwa-auth/package.json packages/siwa-auth/
COPY packages/agent-server/package.json packages/agent-server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm run build

# ── Production image ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 agent \
 && adduser --system --uid 1001 agent

# Copy the entire node_modules tree (pnpm uses symlinks within .pnpm store)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/agent-core/node_modules ./packages/agent-core/node_modules
COPY --from=builder /app/packages/tal-integration/node_modules ./packages/tal-integration/node_modules
COPY --from=builder /app/packages/siwa-auth/node_modules ./packages/siwa-auth/node_modules
COPY --from=builder /app/packages/agent-server/node_modules ./packages/agent-server/node_modules

# Copy built artifacts and package.json files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /app/packages/agent-core/package.json ./packages/agent-core/
COPY --from=builder /app/packages/tal-integration/dist ./packages/tal-integration/dist
COPY --from=builder /app/packages/tal-integration/package.json ./packages/tal-integration/
COPY --from=builder /app/packages/siwa-auth/dist ./packages/siwa-auth/dist
COPY --from=builder /app/packages/siwa-auth/package.json ./packages/siwa-auth/
COPY --from=builder /app/packages/agent-server/dist ./packages/agent-server/dist
COPY --from=builder /app/packages/agent-server/package.json ./packages/agent-server/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

USER agent

CMD ["node", "packages/agent-server/dist/index.js"]

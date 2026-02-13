# ============================================================
# TAL Yield Agent — Development Commands
# ============================================================

.PHONY: install build test clean dev up down logs db-reset

# ======================== Development ========================

install:
	pnpm install

build:
	pnpm build

test:
	pnpm test

clean:
	pnpm clean
	rm -rf node_modules packages/*/node_modules

# Dev server (requires Redis running)
dev-server:
	pnpm --filter agent-server dev

dev-worker:
	pnpm --filter agent-worker dev

# ======================== Docker ========================

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

logs-server:
	docker compose logs -f agent-server

logs-worker:
	docker compose logs -f agent-worker

# Build images without cache
rebuild:
	docker compose build --no-cache

# ======================== Database ========================

db-reset:
	docker compose exec postgres psql -U tal -d tal_yield_agent -f /docker-entrypoint-initdb.d/01-init.sql

db-shell:
	docker compose exec postgres psql -U tal -d tal_yield_agent

# ======================== Infrastructure ========================

# Start only infra (Redis, Postgres, IPFS)
infra:
	docker compose up -d redis postgres ipfs

# ======================== Testing ========================

test-core:
	pnpm --filter agent-core test

test-sdk:
	pnpm --filter tal-sdk test

test-server:
	pnpm --filter agent-server test

test-worker:
	pnpm --filter agent-worker test

# ======================== Health ========================

health:
	@curl -s http://localhost:3000/api/v1/health | python3 -m json.tool 2>/dev/null || echo "Server not running"

stats:
	@curl -s http://localhost:3000/api/v1/agent/stats | python3 -m json.tool 2>/dev/null || echo "Server not running"

pools:
	@curl -s http://localhost:3000/api/v1/pools | python3 -m json.tool 2>/dev/null || echo "Server not running"

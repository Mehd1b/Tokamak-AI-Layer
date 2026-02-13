-- ============================================================
-- TAL Yield Agent - PostgreSQL Schema
-- Run once on fresh database: psql -f init.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Pools: Tracked DeFi pools with current state
-- ============================================================
CREATE TABLE pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol VARCHAR(100) NOT NULL,
  protocol_type VARCHAR(50) NOT NULL,
  chain_id INT NOT NULL,
  pool_id VARCHAR(255) NOT NULL,
  pool_address VARCHAR(255),
  tokens JSONB NOT NULL DEFAULT '[]',
  current_apy DECIMAL(10, 4),
  tvl DECIMAL(20, 2),
  volume_24h DECIMAL(20, 2),
  il_risk DECIMAL(8, 6) DEFAULT 0,
  protocol_risk_score INT DEFAULT 0,
  audit_status JSONB NOT NULL DEFAULT '{}',
  contract_age INT DEFAULT 0,
  risk_score INT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chain_id, pool_id)
);

CREATE INDEX idx_pools_protocol ON pools(protocol);
CREATE INDEX idx_pools_chain ON pools(chain_id);
CREATE INDEX idx_pools_apy ON pools(current_apy DESC);
CREATE INDEX idx_pools_tvl ON pools(tvl DESC);

-- ============================================================
-- Snapshots: Immutable data snapshots for strategy generation
-- ============================================================
CREATE TABLE snapshots (
  id VARCHAR(66) PRIMARY KEY,  -- keccak256 hash (0x + 64 hex chars)
  data JSONB NOT NULL,
  pool_count INT NOT NULL DEFAULT 0,
  ipfs_cid VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_created ON snapshots(created_at DESC);

-- ============================================================
-- Tasks: Strategy generation tasks (mirrors on-chain escrow)
-- ============================================================
CREATE TABLE tasks (
  id VARCHAR(66) PRIMARY KEY,       -- on-chain taskRef (bytes32 hash)
  requester VARCHAR(42) NOT NULL,   -- Ethereum address
  tier VARCHAR(20) NOT NULL DEFAULT 'basic',
  risk_profile JSONB NOT NULL,
  capital_usd DECIMAL(20, 2),
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'disputed', 'refunded')),
  snapshot_id VARCHAR(66) REFERENCES snapshots(id),
  execution_hash VARCHAR(66),
  report_data JSONB,
  report_ipfs VARCHAR(100),
  on_chain_tx VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_requester ON tasks(requester);
CREATE INDEX idx_tasks_created ON tasks(created_at DESC);

-- ============================================================
-- Validations: Validator re-execution results
-- ============================================================
CREATE TABLE validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(66) NOT NULL REFERENCES tasks(id),
  validator VARCHAR(42) NOT NULL,    -- Ethereum address
  is_valid BOOLEAN NOT NULL,
  execution_hash VARCHAR(66) NOT NULL,
  hash_match BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validations_task ON validations(task_id);
CREATE INDEX idx_validations_validator ON validations(validator);

-- ============================================================
-- Reputation Events: Feedback, APY accuracy, dispute outcomes
-- ============================================================
CREATE TABLE reputation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(66) REFERENCES tasks(id),
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('feedback', 'apy_accuracy', 'dispute_outcome')),
  agent_id BIGINT,
  data JSONB NOT NULL,
  on_chain_tx VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reputation_task ON reputation_events(task_id);
CREATE INDEX idx_reputation_type ON reputation_events(event_type);
CREATE INDEX idx_reputation_agent ON reputation_events(agent_id);

-- ============================================================
-- APY History: Historical APY data points per pool
-- ============================================================
CREATE TABLE apy_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id VARCHAR(255) NOT NULL,
  chain_id INT NOT NULL,
  apy DECIMAL(10, 4) NOT NULL,
  tvl DECIMAL(20, 2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_apy_pool ON apy_history(pool_id, chain_id);
CREATE INDEX idx_apy_recorded ON apy_history(recorded_at DESC);

-- ============================================================
-- Job Log: BullMQ job execution tracking
-- ============================================================
CREATE TABLE job_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name VARCHAR(100) NOT NULL,
  job_id VARCHAR(255),
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('started', 'completed', 'failed')),
  data JSONB,
  result JSONB,
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_name ON job_log(job_name);
CREATE INDEX idx_job_status ON job_log(status);
CREATE INDEX idx_job_created ON job_log(created_at DESC);

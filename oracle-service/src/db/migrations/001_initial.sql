-- Registered optimistic vaults
CREATE TABLE IF NOT EXISTS vaults (
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  bond_chain_id INTEGER NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (address, chain_id)
);

-- Relayed events (idempotency)
CREATE TABLE IF NOT EXISTS relayed_events (
  id SERIAL PRIMARY KEY,
  vault_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('ProofSubmitted', 'ExecutionSlashed')),
  execution_nonce BIGINT NOT NULL,
  operator TEXT,
  slasher TEXT,
  bond_amount TEXT,
  l1_tx_hash TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'relayed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  relayed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Per-vault checkpoint for historical replay
CREATE TABLE IF NOT EXISTS checkpoints (
  vault_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (vault_address, chain_id)
);

-- Operator resolution cache
CREATE TABLE IF NOT EXISTS vault_operators (
  vault_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  execution_nonce BIGINT NOT NULL,
  operator TEXT NOT NULL,
  PRIMARY KEY (vault_address, chain_id, execution_nonce)
);

CREATE INDEX IF NOT EXISTS idx_relayed_events_status ON relayed_events (status);
CREATE INDEX IF NOT EXISTS idx_relayed_events_vault ON relayed_events (vault_address, chain_id);
CREATE INDEX IF NOT EXISTS idx_vaults_chain ON vaults (chain_id);

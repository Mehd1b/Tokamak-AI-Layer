# Claude Code Teams Prompt: DeFi Yield Strategy Agent on TAL

## Project Identity

**Name:** `tal-yield-agent`
**Description:** Production-ready DeFi Yield Strategy Agent built on the Tokamak Agent Layer (TAL). Analyzes yield farming opportunities across DeFi protocols, scores them by risk-adjusted return, and generates allocation strategies — all with on-chain trust guarantees via TAL's reputation, validation, escrow, and staking infrastructure.

---

## Role

You are a team of senior blockchain engineers and AI agent architects. You are building a production-grade DeFi Yield Strategy Agent that integrates with the Tokamak Agent Layer (TAL) protocol — specifically ERC-8004 for agent identity, the TAL reputation registry, StakeSecured validation, and the escrow payment system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DeFi Yield Strategy Agent                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Data Ingest  │  │  Analysis    │  │  Strategy Gen    │  │
│  │  Layer        │→ │  Engine      │→ │  & Report        │  │
│  │              │  │              │  │                  │  │
│  │ - DeFi Llama │  │ - APY calc   │  │ - Risk scoring   │  │
│  │ - On-chain   │  │ - TVL trends │  │ - Allocation     │  │
│  │ - Oracles    │  │ - IL model   │  │ - PDF/JSON out   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     TAL Integration Layer                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Identity     │  │  Task        │  │  Reputation      │  │
│  │  (ERC-8004)   │  │  Escrow      │  │  Registry        │  │
│  │              │  │              │  │                  │  │
│  │ - Agent NFT  │  │ - Pay per    │  │ - Track record   │  │
│  │ - Metadata   │  │   strategy   │  │ - APY accuracy   │  │
│  │ - Operator   │  │ - Refund on  │  │ - Feedback       │  │
│  │   keys       │  │   failure    │  │   aggregation    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  Staking     │  │  Validation  │                        │
│  │  Module      │  │  (Stake      │                        │
│  │              │  │   Secured)   │                        │
│  │ - TON stake  │  │ - Re-exec    │                        │
│  │ - Slashing   │  │ - Data snap  │                        │
│  │ - Rewards    │  │ - Consensus  │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Project Scaffolding & Smart Contracts

### 1.1 Initialize Monorepo

```bash
# Use Turborepo or Nx monorepo structure
packages/
  contracts/          # Solidity — Foundry
  agent-core/         # TypeScript — core analysis engine
  agent-server/       # TypeScript — API server (Fastify)
  agent-worker/       # TypeScript — background job runner
  tal-sdk/            # TypeScript — TAL contract interaction wrappers
  shared/             # Shared types, constants, ABIs
```

- **Language:** TypeScript (strict mode) for all off-chain code, Solidity 0.8.24+ for contracts
- **Package manager:** pnpm with workspaces
- **Node version:** 20 LTS
- **Testing:** Vitest for TS, Foundry for Solidity

### 1.2 Smart Contracts (`packages/contracts/`)

Use **Foundry** for development, testing, and deployment.

#### `YieldAgentIdentity.sol`
- Inherits from / interacts with `TALIdentityRegistry` (ERC-8004)
- Registers the agent on-chain with:
  - `agentId` (uint256, the NFT token ID)
  - `metadataURI` pointing to IPFS JSON (agent description, capabilities, pricing, supported protocols)
  - `operatorAddress` — the hot wallet that submits strategy results on-chain
- Implements `IAgentMetadata` interface for TAL discovery

#### `YieldTaskEscrow.sol`
- Integrates with TAL's `TaskEscrow` module
- Custom logic:
  - `submitStrategyRequest(riskProfile, capital, targetChains)` — user deposits TON, creates task
  - `deliverStrategy(taskId, strategyHash, reportIPFSHash)` — agent delivers, starts dispute window
  - `claimPayment(taskId)` — agent claims after `REFUND_DEADLINE` passes with no dispute
  - `disputeAndRefund(taskId, reason)` — user disputes within deadline, triggers validator review
- Pricing: 0.5 TON (basic), 2 TON (advanced), 5 TON (premium portfolio-specific)
- Constants: `REFUND_DEADLINE = 48 hours`, `DISPUTE_WINDOW = 72 hours`

#### `YieldValidationModule.sol`
- Implements `StakeSecured` validation model
- Validators must stake minimum 100 TON to participate
- `submitValidation(taskId, isValid, executionHash)` — validator submits re-execution result
- `resolveDispute(taskId)` — majority consensus among validators determines outcome
- Slashing: validators who vote against consensus lose 10% stake
- Reward: validators who vote with consensus earn share of validation fee (0.1 TON per validation)

#### `YieldReputationTracker.sol`
- Extends TAL `ReputationRegistry`
- Tracks agent-specific metrics:
  - `totalStrategiesDelivered`
  - `avgPredictedVsActualAPY` (updated retroactively after 7/30/90 day windows)
  - `disputeRate`
  - `feedbackScore` (1-5, weighted by user stake)
- Emits events for off-chain indexing

### 1.3 Contract Tests

Write comprehensive Foundry tests:
- Full lifecycle: register → request → deliver → claim
- Dispute flow: request → deliver → dispute → validator consensus → refund or release
- Edge cases: expired deadlines, insufficient stake, double-claim, reentrancy
- Gas optimization benchmarks

### 1.4 Deployment Scripts

- Deploy to Tokamak L2 testnet first, then mainnet
- Use `forge script` with deterministic deployment (CREATE2)
- Generate ABI artifacts to `packages/shared/abis/`

---

## Phase 2: Data Ingestion Layer

### 2.1 DeFi Protocol Adapters (`packages/agent-core/src/adapters/`)

Build modular adapters for each data source. Each adapter implements `IProtocolAdapter`:

```typescript
interface IProtocolAdapter {
  getPoolData(poolId: string): Promise<PoolData>;
  getHistoricalAPY(poolId: string, days: number): Promise<APYTimeseries>;
  getTVL(poolId: string): Promise<BigNumber>;
  getProtocolRisk(): Promise<RiskMetrics>;
}

interface PoolData {
  protocol: string;
  chain: ChainId;
  poolId: string;
  tokens: TokenInfo[];
  currentAPY: number;
  tvl: BigNumber;
  volume24h: BigNumber;
  ilRisk: number;           // 0-1 impermanent loss risk score
  protocolRiskScore: number; // 0-100
  auditStatus: AuditInfo;
  contractAge: number;       // days since deployment
}
```

#### Supported Protocols (Phase 1):
| Protocol | Chain | Type | Adapter |
|----------|-------|------|---------|
| Aave V3 | Ethereum, Arbitrum, Optimism | Lending | `AaveV3Adapter` |
| Compound V3 | Ethereum | Lending | `CompoundV3Adapter` |
| Uniswap V3 | Ethereum, Arbitrum, Optimism | AMM/LP | `UniswapV3Adapter` |
| Curve | Ethereum | StableSwap | `CurveAdapter` |
| Lido | Ethereum | Liquid Staking | `LidoAdapter` |
| Tokamak Staking | Tokamak L2 | Staking | `TokamakStakingAdapter` |

#### Data Sources:
- **DeFi Llama API** — aggregated TVL, APY, protocol metadata (primary)
- **On-chain RPC** — real-time pool state, user positions (Alchemy/Infura)
- **The Graph subgraphs** — historical data, event indexing
- **Chainlink / Redstone oracles** — price feeds for IL calculation

### 2.2 Data Snapshot System

Critical for **StakeSecured validation** — validators must re-execute with the exact same data.

```typescript
interface DataSnapshot {
  snapshotId: string;          // keccak256 hash of all data
  timestamp: number;
  blockNumbers: Record<ChainId, number>;  // pinned block per chain
  poolStates: PoolData[];
  priceFeed: Record<string, number>;
  metadata: {
    sources: string[];
    fetchDuration: number;
  };
}
```

- Store snapshots on **IPFS** (via Pinata or web3.storage)
- Reference `snapshotId` in on-chain task submission
- Snapshots are immutable — validators fetch the same snapshot to re-execute
- Retention: 90 days on IPFS, permanent on Arweave for disputed strategies

### 2.3 Data Pipeline

- **Cron scheduler** (BullMQ on Redis): refresh pool data every 5 minutes
- **Cache layer** (Redis): hot cache for latest pool states
- **Event listener** (ethers.js WebSocket): real-time TVL/APY change detection
- **Rate limiter**: respect API limits (DeFi Llama: 300/5min, The Graph: varies)

---

## Phase 3: Analysis Engine

### 3.1 Risk Scoring Model (`packages/agent-core/src/analysis/`)

#### `RiskScorer`

Composite risk score (0-100) from weighted factors:

```typescript
interface RiskProfile {
  level: 'conservative' | 'moderate' | 'aggressive';
  maxILTolerance: number;        // percentage
  minTVL: BigNumber;             // minimum pool TVL
  maxProtocolAge: number;        // minimum days deployed
  chainPreferences: ChainId[];
  excludeProtocols: string[];
  maxSinglePoolAllocation: number; // percentage cap
}

interface RiskScore {
  overall: number;               // 0-100
  breakdown: {
    smartContractRisk: number;   // audit status, code age, bug bounty
    marketRisk: number;          // token volatility, correlation
    liquidityRisk: number;       // TVL depth, withdrawal ease
    protocolRisk: number;        // governance, admin keys, centralization
    impermanentLoss: number;     // historical IL estimation
    regulatoryRisk: number;      // jurisdiction, token classification
  };
  confidence: number;            // 0-1, how reliable is this score
}
```

**Scoring algorithm:**
- Smart contract risk: audit count × age × bug bounty → 0-25 score
- Market risk: 30-day token volatility + correlation matrix → 0-20 score
- Liquidity risk: TVL / total protocol TVL + withdrawal queue depth → 0-20 score
- Protocol risk: admin key setup + governance decentralization → 0-15 score
- IL risk: historical price divergence simulation → 0-15 score
- Regulatory: basic heuristic (stablecoin = low, governance token = medium) → 0-5 score

### 3.2 APY Prediction Model

#### `APYPredictor`

```typescript
interface APYPrediction {
  pool: string;
  currentAPY: number;
  predicted7d: { mean: number; low: number; high: number };
  predicted30d: { mean: number; low: number; high: number };
  predicted90d: { mean: number; low: number; high: number };
  confidence: number;
  methodology: string;           // stored for validator re-execution
  factors: APYFactor[];          // explainable factors
}
```

**Methodology:**
- **Base rate:** Exponential moving average of historical APY (30d, 90d windows)
- **TVL adjustment:** APY compression as TVL grows (inverse relationship model)
- **Incentive decay:** Token emission schedule → declining reward component
- **Market regime:** Bull/bear classification affects base APY expectations
- **Correlation:** Cross-protocol yield correlation (when Aave rates rise, Compound follows)

**Important:** All predictions must be **deterministic** given the same `DataSnapshot`. No randomness. This is critical for StakeSecured validation.

### 3.3 Strategy Generator

#### `StrategyGenerator`

```typescript
interface StrategyReport {
  reportId: string;
  requestId: string;              // on-chain task ID
  snapshotId: string;             // data snapshot used
  timestamp: number;
  riskProfile: RiskProfile;
  capital: BigNumber;             // user's stated capital

  // Core output
  allocations: Allocation[];
  expectedAPY: {
    blended: number;              // weighted average across allocations
    range: { low: number; high: number };
  };
  riskScore: RiskScore;

  // Explainability
  reasoning: string[];            // step-by-step reasoning chain
  alternativesConsidered: AlternativeStrategy[];
  warnings: string[];

  // Verification
  executionHash: string;          // keccak256 of deterministic execution trace
  reportIPFSHash: string;        // full report stored on IPFS
}

interface Allocation {
  protocol: string;
  pool: string;
  chain: ChainId;
  percentage: number;             // allocation percentage
  amountUSD: number;
  expectedAPY: APYPrediction;
  riskScore: number;
  entrySteps: TransactionStep[];  // how to enter this position
  exitConditions: ExitCondition[];
}
```

**Strategy generation pipeline:**
1. Filter pools by `RiskProfile` constraints
2. Score each pool: `risk_adjusted_return = predicted_apy × (1 - risk_score/100)`
3. Optimize allocation using mean-variance optimization (Markowitz-style) with constraints
4. Apply diversification rules (max per protocol, max per chain, min pools)
5. Generate entry transaction steps for each allocation
6. Compute blended expected APY
7. Hash the full execution trace for on-chain verification

### 3.4 Execution Trace & Verification

Every computation step is logged in a deterministic execution trace:

```typescript
interface ExecutionTrace {
  steps: TraceStep[];
  inputHash: string;        // hash of DataSnapshot + RiskProfile
  outputHash: string;       // hash of StrategyReport
  executionHash: string;    // keccak256(inputHash + outputHash + all step hashes)
}
```

Validators re-execute by:
1. Fetching the same `DataSnapshot` from IPFS
2. Running the same analysis pipeline
3. Comparing their `executionHash` with the agent's submitted hash
4. If hashes match → valid. If not → investigate divergence.

---

## Phase 4: TAL Integration Layer

### 4.1 TAL SDK Wrapper (`packages/tal-sdk/`)

Thin TypeScript wrapper around TAL contract interactions:

```typescript
class TALClient {
  // Identity
  async registerAgent(metadata: AgentMetadata): Promise<AgentId>;
  async updateMetadata(agentId: AgentId, metadata: Partial<AgentMetadata>): Promise<void>;
  async setOperator(agentId: AgentId, operatorAddress: Address): Promise<void>;

  // Escrow
  async getTaskRequests(agentId: AgentId, status: TaskStatus): Promise<Task[]>;
  async deliverStrategy(taskId: TaskId, strategyHash: string, reportIPFS: string): Promise<void>;
  async claimPayment(taskId: TaskId): Promise<void>;

  // Reputation
  async getReputation(agentId: AgentId): Promise<ReputationData>;
  async submitFeedback(agentId: AgentId, taskId: TaskId, score: number, comment: string): Promise<void>;
  async updateAPYAccuracy(agentId: AgentId, taskId: TaskId, actualAPY: number): Promise<void>;

  // Staking
  async getStakeBalance(agentId: AgentId): Promise<BigNumber>;
  async stake(amount: BigNumber): Promise<void>;
  async requestUnstake(amount: BigNumber): Promise<void>;

  // Validation
  async getValidationQueue(): Promise<ValidationTask[]>;
  async submitValidation(taskId: TaskId, isValid: boolean, executionHash: string): Promise<void>;
}
```

### 4.2 Agent Registration Flow

On first deployment:
1. Deploy agent identity contract / mint ERC-8004 NFT via `TALIdentityRegistry`
2. Upload metadata JSON to IPFS:
   ```json
   {
     "name": "DeFi Yield Strategy Agent",
     "version": "1.0.0",
     "description": "Risk-adjusted yield farming strategy generation",
     "capabilities": ["yield-analysis", "risk-scoring", "portfolio-optimization"],
     "supportedProtocols": ["aave-v3", "compound-v3", "uniswap-v3", "curve", "lido"],
     "supportedChains": [1, 10, 42161],
     "pricing": {
       "basic": "0.5 TON",
       "advanced": "2 TON",
       "premium": "5 TON"
     },
     "validationModel": "StakeSecured",
     "minStake": "100 TON"
   }
   ```
3. Stake minimum 100 TON for StakeSecured participation
4. Set operator address (hot wallet for automated delivery)

### 4.3 Task Lifecycle Implementation

```
User                          Agent                         Validators
  │                             │                               │
  │─── submitRequest(TON) ────→│                               │
  │                             │── listen for TaskCreated ──→  │
  │                             │                               │
  │                             │── fetch DataSnapshot ──────→  │
  │                             │── run Analysis Engine ─────→  │
  │                             │── generate Strategy ────────→ │
  │                             │── upload to IPFS ───────────→ │
  │                             │                               │
  │                             │── deliverStrategy(hash) ───→  │
  │                             │                               │
  │←── strategy report ────────│                               │
  │                             │                          ┌────│
  │    [DISPUTE WINDOW: 48h]   │                          │    │
  │                             │                          │    │
  │   (if no dispute)          │                          │    │
  │                             │── claimPayment() ──────→ │    │
  │                             │                          │    │
  │   (if disputed)            │                          │    │
  │─── dispute(reason) ──────→ │                          │    │
  │                             │                     validators│
  │                             │                     re-execute│
  │                             │                     & vote    │
  │                             │                          └────│
  │←── refund OR release ──────│←── resolveDispute() ─────────│
```

### 4.4 Reputation Feedback Loop

After strategy delivery, two feedback mechanisms:

1. **Immediate feedback:** User rates the strategy (1-5 stars + optional comment) → written to `ReputationRegistry`
2. **Retroactive APY accuracy:** A background cron job checks actual pool APYs after 7/30/90 days, computes prediction error, and updates the agent's `avgPredictedVsActualAPY` metric on-chain

---

## Phase 5: API Server & Worker

### 5.1 API Server (`packages/agent-server/`)

**Framework:** Fastify with TypeBox validation

#### Endpoints:

```
POST   /api/v1/strategy/request     — Submit strategy request (triggers on-chain task)
GET    /api/v1/strategy/:taskId      — Get strategy report status/result
GET    /api/v1/strategy/:taskId/report — Download full report (JSON/PDF)

GET    /api/v1/pools                  — List all tracked pools with current data
GET    /api/v1/pools/:poolId          — Pool detail with historical APY
GET    /api/v1/pools/search           — Search/filter pools

GET    /api/v1/agent/reputation       — Agent reputation summary
GET    /api/v1/agent/stats            — Delivery stats, accuracy metrics

POST   /api/v1/validate/submit        — Validator submits re-execution result
GET    /api/v1/validate/queue          — Pending validation tasks

GET    /api/v1/health                  — Health check
GET    /api/v1/snapshot/:id            — Retrieve data snapshot for validation
```

**Auth:** API keys for basic access, wallet signature (EIP-712) for on-chain operations.

### 5.2 Worker (`packages/agent-worker/`)

**Queue system:** BullMQ on Redis

#### Job Types:
| Job | Trigger | Priority |
|-----|---------|----------|
| `pool-data-refresh` | Cron (5 min) | Normal |
| `strategy-generate` | TaskCreated event | High |
| `strategy-deliver` | Strategy complete | Critical |
| `apy-accuracy-check` | Cron (daily) | Low |
| `snapshot-pin` | After data refresh | Normal |
| `reputation-update` | Feedback received | Normal |
| `payment-claim` | Dispute window expired | High |

### 5.3 Event Listener

Listen for on-chain events via WebSocket:
- `TaskCreated(taskId, requester, tier, riskProfile)` → trigger strategy generation
- `TaskDisputed(taskId, reason)` → alert operator, prepare for validation
- `ValidationSubmitted(taskId, validator, isValid)` → track consensus
- `DisputeResolved(taskId, outcome)` → claim payment or process refund
- `FeedbackSubmitted(agentId, taskId, score)` → update local reputation cache

---

## Phase 6: Deployment & Operations

### 6.1 Infrastructure

```yaml
# Docker Compose for local dev, Kubernetes for production
services:
  agent-server:
    build: packages/agent-server
    ports: ["3000:3000"]
    env: [DATABASE_URL, REDIS_URL, RPC_URL, IPFS_GATEWAY]

  agent-worker:
    build: packages/agent-worker
    env: [REDIS_URL, RPC_URL, OPERATOR_PRIVATE_KEY]

  redis:
    image: redis:7-alpine

  postgres:
    image: postgres:16-alpine

  ipfs:
    image: ipfs/kubo:latest  # local IPFS node for dev
```

### 6.2 Database Schema (PostgreSQL)

```sql
-- Core tables
CREATE TABLE pools (
  id UUID PRIMARY KEY,
  protocol VARCHAR NOT NULL,
  chain_id INT NOT NULL,
  pool_address VARCHAR NOT NULL,
  tokens JSONB NOT NULL,
  current_apy DECIMAL,
  tvl DECIMAL,
  risk_score INT,
  last_updated TIMESTAMPTZ,
  UNIQUE(chain_id, pool_address)
);

CREATE TABLE snapshots (
  id VARCHAR PRIMARY KEY,   -- keccak256 hash
  data JSONB NOT NULL,
  ipfs_hash VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id VARCHAR PRIMARY KEY,    -- on-chain taskId
  requester VARCHAR NOT NULL,
  tier VARCHAR NOT NULL,
  risk_profile JSONB NOT NULL,
  capital DECIMAL,
  status VARCHAR DEFAULT 'pending',
  snapshot_id VARCHAR REFERENCES snapshots(id),
  strategy_hash VARCHAR,
  report_ipfs VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
);

CREATE TABLE validations (
  id UUID PRIMARY KEY,
  task_id VARCHAR REFERENCES tasks(id),
  validator VARCHAR NOT NULL,
  is_valid BOOLEAN NOT NULL,
  execution_hash VARCHAR NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reputation_events (
  id UUID PRIMARY KEY,
  task_id VARCHAR REFERENCES tasks(id),
  event_type VARCHAR NOT NULL,  -- 'feedback', 'apy_accuracy', 'dispute_outcome'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.3 Environment Configuration

```env
# Chain
RPC_URL_ETHEREUM=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_URL_TOKAMAK_L2=https://rpc.tokamak.network
CHAIN_ID=55004

# TAL Contracts
TAL_IDENTITY_REGISTRY=0x...
TAL_TASK_ESCROW=0x...
TAL_REPUTATION_REGISTRY=0x...
TAL_STAKING_MODULE=0x...
YIELD_AGENT_ID=<NFT_TOKEN_ID>

# Operator
OPERATOR_PRIVATE_KEY=<encrypted via sops>
OPERATOR_ADDRESS=0x...

# Data
DEFILLAMA_API=https://yields.llama.fi
GRAPH_API_KEY=...
IPFS_GATEWAY=https://gateway.pinata.cloud
PINATA_API_KEY=...

# Infra
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

---

## Coding Standards

1. **TypeScript strict mode** everywhere — no `any`, no implicit returns
2. **Zod schemas** for all external data validation (API inputs, contract events, oracle data)
3. **Deterministic execution** — the analysis engine MUST produce identical output given identical input. No `Date.now()`, no `Math.random()`, no non-deterministic data fetching inside the engine. All time/randomness is injected via the DataSnapshot.
4. **Error handling** — use `neverthrow` Result types for all fallible operations. No unhandled promise rejections.
5. **Logging** — structured JSON logging via Pino. Every strategy execution logs a full trace.
6. **Testing requirements:**
   - Unit tests for all analysis functions (>90% coverage)
   - Integration tests for contract interactions (Foundry fork tests)
   - End-to-end test: full task lifecycle from request to claim
   - Property-based tests for the optimization algorithm (fast-check)
   - Snapshot tests for determinism: same input → same output across runs
7. **Gas optimization** — all contract calls should be gas-benchmarked. Target <200k gas for delivery, <100k for claims.
8. **Security:**
   - Operator key stored in hardware wallet or KMS (AWS/GCP) in production
   - All IPFS content is content-addressed (integrity guaranteed)
   - No user private keys ever touch the agent
   - Rate limiting on all API endpoints
   - Input sanitization on all user-provided risk profiles

---

## File Naming Conventions

```
packages/contracts/src/YieldAgentIdentity.sol     # PascalCase for Solidity
packages/contracts/test/YieldAgentIdentity.t.sol   # .t.sol for Foundry tests
packages/agent-core/src/adapters/aave-v3.ts        # kebab-case for TS files
packages/agent-core/src/analysis/risk-scorer.ts
packages/agent-core/src/analysis/apy-predictor.ts
packages/agent-core/src/strategy/generator.ts
packages/agent-server/src/routes/strategy.ts
packages/agent-worker/src/jobs/strategy-generate.ts
packages/shared/src/types/index.ts
packages/shared/src/abis/YieldTaskEscrow.json
```

---

## Build Order

Execute in this exact order. Each phase must pass tests before moving to the next:

1. **Phase 1:** Contracts → deploy to local Anvil → all Foundry tests green
2. **Phase 2:** Data adapters → snapshot system → pipeline tests with mocked data
3. **Phase 3:** Risk scorer → APY predictor → strategy generator → determinism snapshot tests
4. **Phase 4:** TAL SDK → registration flow → task lifecycle integration test
5. **Phase 5:** API server → worker → end-to-end lifecycle test
6. **Phase 6:** Docker setup → testnet deployment → monitoring

---

## Success Criteria

- [ ] Agent registers on TAL with valid ERC-8004 identity
- [ ] User can submit strategy request via escrow (0.5 / 2 / 5 TON tiers)
- [ ] Agent generates deterministic strategy report within 30 seconds
- [ ] Strategy report uploaded to IPFS, hash submitted on-chain
- [ ] Validators can re-execute and get matching execution hash
- [ ] Payment claimed after dispute window with no disputes
- [ ] Dispute flow works: refund on failed validation consensus
- [ ] Reputation metrics update: delivery count, APY accuracy, feedback score
- [ ] API serves pool data, strategy reports, and agent stats
- [ ] All tests pass with >90% coverage on core analysis engine
# Verification Agent: DeFi Yield Strategy Agent Audit

## Role

You are a senior blockchain security auditor and systems architect. Your job is to verify that the DeFi Yield Strategy Agent implementation matches the specification in `AGENTS.md` — completely, correctly, and securely. You are adversarial by default: assume nothing works until proven otherwise.

## IMPORTANT CONTEXT

The smart contracts (TAL Identity, Task Escrow, Validation Module, Reputation Tracker) are **already implemented and deployed**. They are NOT part of this codebase. The `packages/contracts/` directory in the spec was skipped during implementation.

Your verification focuses on:
1. The off-chain code (agent-core, agent-server, agent-worker, tal-sdk, shared)
2. Correct integration with the deployed contracts (ABIs, addresses, function calls)
3. Determinism of the analysis engine (critical for StakeSecured validation)
4. Data layer, API, and worker completeness

Do NOT flag missing Solidity source files as failures. DO flag incorrect ABI usage, wrong function signatures, or mismatched contract interaction patterns.

---

## Verification Protocol

Run every check below **in order**. For each check, report one of:
- ✅ **PASS** — implemented correctly per spec
- ⚠️ **PARTIAL** — implemented but incomplete or deviates from spec (explain how)
- ❌ **FAIL** — missing or broken (explain what's wrong)
- 🔍 **NOTE** — observation that doesn't block but should be addressed

Produce a final report as `VERIFICATION_REPORT.md` in the project root.

---

## Stage 1: Structural Verification

### 1.1 Monorepo Structure
Since contracts are external, verify the off-chain packages exist:
```
packages/
  agent-core/         # Core analysis engine
  agent-server/       # Fastify API server
  agent-worker/       # BullMQ worker
  tal-sdk/            # TAL contract wrappers
  shared/             # Shared types, ABIs
```

Check:
- [ ] All 5 off-chain packages exist (contracts package is optional/absent — that's expected)
- [ ] pnpm workspace configured (`pnpm-workspace.yaml`)
- [ ] TypeScript strict mode enabled in all TS packages (`"strict": true` in every `tsconfig.json`)
- [ ] Each package has its own `package.json` with correct dependencies
- [ ] No circular dependencies between packages (run `pnpm why` or check imports)

### 1.2 File Naming Conventions
- [ ] TypeScript files: kebab-case (e.g., `risk-scorer.ts`, `aave-v3.ts`)
- [ ] ABI files in `packages/shared/src/abis/` or similar location
- [ ] Flag any files that violate naming conventions

---

## Stage 2: Contract Integration Verification

Since contracts are deployed externally, verify the off-chain code interacts with them correctly.

### 2.1 ABI Availability
- [ ] ABI JSON files exist for all TAL contracts the agent interacts with:
  - TALIdentityRegistry (ERC-8004)
  - TaskEscrow (or YieldTaskEscrow)
  - ValidationModule (or YieldValidationModule)
  - ReputationRegistry (or YieldReputationTracker)
- [ ] ABIs are imported and used in `tal-sdk` (not hardcoded function selectors)

### 2.2 Contract Address Configuration
- [ ] Contract addresses are configurable via environment variables (not hardcoded)
- [ ] `.env.example` or config file references:
  - `TAL_IDENTITY_REGISTRY`
  - `TAL_TASK_ESCROW`
  - `TAL_REPUTATION_REGISTRY`
  - `TAL_STAKING_MODULE`
- [ ] Network/chain ID is configurable

### 2.3 Function Signature Matching
Verify the tal-sdk calls match the expected contract interfaces:

**Escrow interactions:**
- [ ] Task submission sends correct parameters (riskProfile, capital, targetChains) + TON value
- [ ] Strategy delivery sends (taskId, strategyHash, reportIPFSHash)
- [ ] Payment claim sends (taskId) and checks dispute window expiry
- [ ] Dispute handling sends (taskId, reason)

**Reputation interactions:**
- [ ] Feedback submission sends (agentId, taskId, score, comment)
- [ ] APY accuracy update sends (agentId, taskId, actualAPY)
- [ ] Reputation query reads correct fields

**Identity interactions:**
- [ ] Agent registration follows ERC-8004 pattern
- [ ] Metadata URI points to IPFS
- [ ] Operator address is set correctly

### 2.4 Event Listening
- [ ] Event names and topic hashes match deployed contract events
- [ ] Event decoding uses correct ABI (not manual parsing)
- [ ] Events listened for: `TaskCreated`, `TaskDisputed`, `ValidationSubmitted`, `DisputeResolved`, `FeedbackSubmitted`

### 2.5 Error Handling for Contract Calls
- [ ] Reverted transactions are caught and handled gracefully
- [ ] Gas estimation before sends (not just hardcoded gas limits)
- [ ] Nonce management for the operator wallet (no stuck transactions)
- [ ] Retry logic for failed RPC calls

---

## Stage 3: Data Layer Verification

### 3.1 Protocol Adapters
Verify adapters exist for all spec'd protocols:
- [ ] `AaveV3Adapter` — Ethereum, Arbitrum, Optimism
- [ ] `CompoundV3Adapter` — Ethereum
- [ ] `UniswapV3Adapter` — Ethereum, Arbitrum, Optimism
- [ ] `CurveAdapter` — Ethereum
- [ ] `LidoAdapter` — Ethereum
- [ ] `TokamakStakingAdapter` — Tokamak L2

Each adapter must implement `IProtocolAdapter`:
- [ ] `getPoolData(poolId)` returns `PoolData` matching spec interface
- [ ] `getHistoricalAPY(poolId, days)` returns `APYTimeseries`
- [ ] `getTVL(poolId)` returns `BigNumber`
- [ ] `getProtocolRisk()` returns `RiskMetrics`

### 3.2 DataSnapshot System
- [ ] `DataSnapshot` interface matches spec (snapshotId, timestamp, blockNumbers, poolStates, priceFeed, metadata)
- [ ] `snapshotId` is computed as keccak256 hash of all data
- [ ] Snapshots stored on IPFS (Pinata or web3.storage integration)
- [ ] Snapshot retrieval by ID works
- [ ] Snapshots are immutable once created

### 3.3 Data Pipeline
- [ ] BullMQ job for pool data refresh (check cron interval ~5 min)
- [ ] Redis cache for hot pool data
- [ ] WebSocket event listener for real-time updates (ethers.js / viem)
- [ ] Rate limiting implemented for external APIs

### 3.4 Data Layer Tests
```bash
cd packages/agent-core
pnpm test
```
- [ ] Adapter tests exist (mocked external data)
- [ ] Snapshot creation and hashing tests
- [ ] Pipeline integration tests

---

## Stage 4: Analysis Engine Verification

### 4.1 Risk Scorer
- [ ] `RiskProfile` interface matches spec (level, maxILTolerance, minTVL, etc.)
- [ ] `RiskScore` has all breakdown categories: smartContractRisk, marketRisk, liquidityRisk, protocolRisk, impermanentLoss, regulatoryRisk
- [ ] Score range is 0-100
- [ ] Confidence score is 0-1
- [ ] Scoring weights align with spec ranges (smart contract 0-25, market 0-20, liquidity 0-20, protocol 0-15, IL 0-15, regulatory 0-5)

### 4.2 APY Predictor
- [ ] `APYPrediction` interface matches spec (predicted7d, predicted30d, predicted90d with mean/low/high)
- [ ] Uses exponential moving average
- [ ] TVL adjustment (APY compression) implemented
- [ ] Incentive decay model present
- [ ] Market regime classification exists
- [ ] Cross-protocol correlation considered

### 4.3 Strategy Generator
- [ ] `StrategyReport` interface matches spec (allocations, expectedAPY, riskScore, reasoning, executionHash, reportIPFSHash)
- [ ] `Allocation` includes entrySteps and exitConditions
- [ ] Pipeline follows spec order: filter → score → optimize → diversify → generate steps → hash
- [ ] Mean-variance optimization implemented (or equivalent)
- [ ] Diversification rules enforced (max per protocol, max per chain, min pools)

### 4.4 CRITICAL: Determinism Verification
This is the most important check. The entire StakeSecured validation model depends on it.

```bash
# Grep for non-determinism violations in the analysis engine
grep -rn "Date.now\|Math.random\|new Date()\|crypto.randomUUID\|crypto.getRandomValues" packages/agent-core/src/ --include="*.ts" || echo "No violations found"

# Also check for non-deterministic imports
grep -rn "import.*from.*uuid\|import.*from.*nanoid" packages/agent-core/src/ --include="*.ts" || echo "No random ID imports"
```

Verify:
- [ ] No `Date.now()` calls inside the analysis engine
- [ ] No `Math.random()` calls inside the analysis engine
- [ ] No non-deterministic data fetching inside the engine (all data comes from DataSnapshot)
- [ ] No non-deterministic ID generation inside analysis logic
- [ ] Execution trace hashing implemented
- [ ] **Run the same DataSnapshot + RiskProfile twice → get identical executionHash** (check if a test for this exists)

### 4.5 Execution Trace
- [ ] `ExecutionTrace` interface exists (steps, inputHash, outputHash, executionHash)
- [ ] Every computation step is logged
- [ ] `executionHash = keccak256(inputHash + outputHash + step hashes)`
- [ ] Validators can reconstruct the trace from a DataSnapshot

### 4.6 Analysis Engine Tests
- [ ] Unit tests for risk scorer (>90% coverage target)
- [ ] Unit tests for APY predictor
- [ ] Unit tests for strategy generator
- [ ] Property-based tests (fast-check) for optimization algorithm
- [ ] **Snapshot determinism tests: same input → same output**
- [ ] All tests pass

---

## Stage 5: TAL SDK Verification

### 5.1 TAL Client Interface
Verify `TALClient` class implements all spec'd methods:

**Identity:**
- [ ] `registerAgent(metadata)` → returns AgentId
- [ ] `updateMetadata(agentId, metadata)`
- [ ] `setOperator(agentId, operatorAddress)`

**Escrow:**
- [ ] `getTaskRequests(agentId, status)`
- [ ] `deliverStrategy(taskId, strategyHash, reportIPFS)`
- [ ] `claimPayment(taskId)`

**Reputation:**
- [ ] `getReputation(agentId)`
- [ ] `submitFeedback(agentId, taskId, score, comment)`
- [ ] `updateAPYAccuracy(agentId, taskId, actualAPY)`

**Staking:**
- [ ] `getStakeBalance(agentId)`
- [ ] `stake(amount)`
- [ ] `requestUnstake(amount)`

**Validation:**
- [ ] `getValidationQueue()`
- [ ] `submitValidation(taskId, isValid, executionHash)`

### 5.2 Provider & Signer Configuration
- [ ] Uses ethers.js v6 or viem (not ethers v5 — check package.json)
- [ ] Supports both read-only provider and signer for write operations
- [ ] Operator wallet signer used for delivery/claim (not user's wallet)
- [ ] Chain ID validation before sending transactions

### 5.3 TAL SDK Tests
- [ ] Unit tests with mocked contract calls
- [ ] Integration test that simulates full lifecycle against a local/fork node (if present)
- [ ] Error handling tests (reverts, timeouts, wrong chain)

---

## Stage 6: API & Worker Verification

### 6.1 API Endpoints
Verify all spec'd endpoints exist and have proper validation:

```
POST   /api/v1/strategy/request        ← exists? input validation?
GET    /api/v1/strategy/:taskId         ← exists?
GET    /api/v1/strategy/:taskId/report  ← exists? returns JSON/PDF?
GET    /api/v1/pools                    ← exists?
GET    /api/v1/pools/:poolId            ← exists?
GET    /api/v1/pools/search             ← exists? filter params?
GET    /api/v1/agent/reputation         ← exists?
GET    /api/v1/agent/stats              ← exists?
POST   /api/v1/validate/submit          ← exists?
GET    /api/v1/validate/queue           ← exists?
GET    /api/v1/health                   ← exists?
GET    /api/v1/snapshot/:id             ← exists?
```

- [ ] All 12 endpoints implemented
- [ ] Fastify with TypeBox or Zod validation on inputs
- [ ] Auth: API key support
- [ ] Auth: EIP-712 wallet signature for on-chain operations
- [ ] Rate limiting on all endpoints
- [ ] Error handling returns proper HTTP status codes

### 6.2 Worker Jobs
Verify all spec'd BullMQ jobs exist:
- [ ] `pool-data-refresh` (cron, ~5 min)
- [ ] `strategy-generate` (event triggered, high priority)
- [ ] `strategy-deliver` (after generation, critical priority)
- [ ] `apy-accuracy-check` (cron, daily)
- [ ] `snapshot-pin` (after data refresh)
- [ ] `reputation-update` (feedback triggered)
- [ ] `payment-claim` (dispute window expiry, high priority)

### 6.3 Event Listener
- [ ] Listens for `TaskCreated` event
- [ ] Listens for `TaskDisputed` event
- [ ] Listens for `ValidationSubmitted` event
- [ ] Listens for `DisputeResolved` event
- [ ] Listens for `FeedbackSubmitted` event
- [ ] Uses WebSocket provider (not HTTP polling)
- [ ] Reconnection logic on disconnect

---

## Stage 7: Infrastructure & Operations Verification

### 7.1 Docker
- [ ] `Dockerfile` exists for `agent-server`
- [ ] `Dockerfile` exists for `agent-worker`
- [ ] `docker-compose.yml` includes: server, worker, redis, postgres
- [ ] IPFS configuration (gateway or local node)
- [ ] Services build successfully: `docker compose build`

### 7.2 Database Schema
- [ ] `pools` table with all spec'd columns
- [ ] `snapshots` table with IPFS hash reference
- [ ] `tasks` table with full lifecycle tracking
- [ ] `validations` table
- [ ] `reputation_events` table
- [ ] Migrations exist and run cleanly
- [ ] Unique constraints: `(chain_id, pool_address)` on pools

### 7.3 Environment Configuration
- [ ] `.env.example` exists with all spec'd variables
- [ ] RPC URLs for Ethereum and Tokamak L2
- [ ] TAL contract addresses configurable
- [ ] Operator key handling (not hardcoded — env var, encrypted, or KMS reference)
- [ ] IPFS configuration (Pinata API key)
- [ ] Database and Redis URLs

---

## Stage 8: Code Quality & Security Audit

### 8.1 TypeScript Quality
```bash
pnpm -r exec -- npx tsc --noEmit 2>&1
```
- [ ] Zero TypeScript errors
- [ ] No `any` types: `grep -rn ": any\|as any" packages/*/src/ --include="*.ts"`
- [ ] No implicit returns

### 8.2 Validation
- [ ] Zod schemas for all external data (API inputs, contract events, oracle data)
- [ ] All user-provided risk profiles sanitized
- [ ] No raw user input passed to contract calls without validation

### 8.3 Error Handling
- [ ] `neverthrow` Result types used for fallible operations (or equivalent pattern)
- [ ] No unhandled promise rejections (check for `.catch` or try/catch)
- [ ] Graceful degradation when external APIs (DeFi Llama, The Graph, RPCs) fail

### 8.4 Logging
- [ ] Structured JSON logging (Pino or equivalent)
- [ ] Strategy execution logs full trace
- [ ] No sensitive data in logs (private keys, user data)

### 8.5 Security Checklist
- [ ] Operator private key never in source code or committed env files
- [ ] `.gitignore` excludes `.env`, private keys, node_modules
- [ ] No user private keys touch the agent code
- [ ] IPFS content is content-addressed (integrity verified on retrieval)
- [ ] API rate limiting configured
- [ ] Input sanitization on risk profiles
- [ ] No SQL injection vectors (parameterized queries or ORM)
- [ ] Dependencies: `pnpm audit` — check for known vulnerabilities

---

## Stage 9: Test Suite Verification

### 9.1 Run All Tests
```bash
pnpm -r test
```
- [ ] All tests pass
- [ ] No skipped tests without justification

### 9.2 Coverage Report
```bash
pnpm -r test -- --coverage 2>/dev/null || echo "Coverage not configured"
```

### 9.3 Coverage Requirements
- [ ] Core analysis engine (risk-scorer, apy-predictor, strategy-generator): >90% line coverage
- [ ] TAL SDK: >80% line coverage
- [ ] API routes: >80% line coverage
- [ ] Worker jobs: >70% line coverage

### 9.4 Test Quality
- [ ] Tests use mocks for external dependencies (RPCs, APIs, IPFS)
- [ ] No tests depend on live network calls
- [ ] Property-based tests exist for optimization algorithm (fast-check)
- [ ] Determinism snapshot tests exist (same input → same output)

---

## Stage 10: End-to-End Lifecycle Test

The ultimate verification. Trace the entire flow in code or tests:

```
1. Agent registration data prepared (identity + metadata)      ← verified?
2. TAL SDK can submit registration to deployed contracts        ← verified?
3. User submits strategy request with TON deposit               ← verified?
4. Event listener catches TaskCreated                           ← verified?
5. Worker creates DataSnapshot, pins to IPFS                    ← verified?
6. Analysis engine generates strategy (deterministic)           ← verified?
7. Strategy report uploaded to IPFS                             ← verified?
8. TAL SDK calls deliverStrategy on deployed escrow             ← verified?
9. User receives strategy report via API                        ← verified?
10. Payment claim after dispute window                          ← verified?
11. Feedback submission → reputation update                     ← verified?
12. APY accuracy check cron job                                 ← verified?
13. Validator re-execution produces matching hash               ← verified?
```

- [ ] E2E test or integration test exists covering the core flow
- [ ] Test passes (even if against mocked contracts / local fork)

---

## Report Format

Generate `VERIFICATION_REPORT.md` with:

```markdown
# Verification Report: DeFi Yield Strategy Agent

**Date:** [timestamp]
**Spec:** AGENTS.md
**Scope:** Off-chain implementation only (contracts are deployed externally)
**Verdict:** [PASS / PASS WITH NOTES / FAIL]

## Summary
- Total checks: X
- ✅ PASS: X
- ⚠️ PARTIAL: X
- ❌ FAIL: X
- 🔍 NOTE: X

## Critical Failures (must fix)
[list]

## Partial Implementations (should fix)
[list]

## Contract Integration Issues
[any ABI mismatches, wrong function signatures, missing event listeners]

## Determinism Audit
[detailed findings from Stage 4.4 — this is the highest priority]

## Notes & Recommendations
[list]

## Detailed Results
[Stage-by-stage breakdown]
```

---

## Execution Instructions

1. Start by reading `AGENTS.md` to understand the full spec
2. Note that `packages/contracts/` was intentionally skipped — contracts are deployed externally
3. Focus verification on off-chain code and its integration with deployed contracts
4. Walk through each stage sequentially — do not skip
5. Run every command, read every file, check every interface
6. Be adversarial — try to find where the implementation deviates from spec
7. Pay special attention to Stage 2 (contract integration) and Stage 4.4 (determinism)
8. Generate `VERIFICATION_REPORT.md` as the final deliverable
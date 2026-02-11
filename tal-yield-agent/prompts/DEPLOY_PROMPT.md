# Deploy & Integration Test: Thanos Sepolia Full Lifecycle

Read `AGENTS.md`, `VERIFY.md`, and `VERIFICATION_REPORT.md` for full context.

## Objective

Deploy the DeFi Yield Strategy Agent to Thanos Sepolia and execute the complete task lifecycle against the live deployed TAL contracts. This is NOT a unit test — this is a real on-chain integration test.

---

## Network & Contract Context

```
Network: Thanos Sepolia
Chain ID: 111551119090
RPC URL: https://rpc.thanos-sepolia.tokamak.network

IDENTITY_REGISTRY=0x3f89CD27fD877827E7665A9883b3c0180E22A525
REPUTATION_REGISTRY=0x0052258E517835081c94c0B685409f2EfC4D502b
VALIDATION_REGISTRY=0x09447147C6E75a60A449f38532F06E19F5F632F3
TASK_FEE_ESCROW=0x43f9E59b6bFCacD70fcba4f3F6234a6a9F064b8C
```

The operator wallet private key is in the `.env` file as `OPERATOR_PRIVATE_KEY`. Do NOT log, print, or expose this key in any output.

---

## Step 0 — Pre-flight Checks

Before touching the chain, verify everything compiles and tests pass locally:

```bash
# 1. Type check
pnpm -r exec -- npx tsc --noEmit

# 2. All unit tests pass
pnpm -r test

# 3. Verify .env has required variables
# (check these exist, do NOT print values)
grep -q "OPERATOR_PRIVATE_KEY" .env && echo "✅ OPERATOR_PRIVATE_KEY set" || echo "❌ MISSING"
grep -q "RPC_URL" .env && echo "✅ RPC_URL set" || echo "❌ MISSING"
grep -q "IDENTITY_REGISTRY" .env && echo "✅ Contract addresses set" || echo "❌ MISSING"
```

If any check fails, stop and report. Do not proceed to on-chain operations with broken code.

---

## Step 1 — Wallet & Network Verification

Create a script: `scripts/integration/00-preflight.ts`

```typescript
// This script verifies:
// 1. RPC connection to Thanos Sepolia works
// 2. Operator wallet has sufficient TON balance for gas + staking
// 3. All 4 contract addresses are valid (deployed, have code)
// 4. Chain ID matches expected (111551119090)
```

The script should:
1. Connect to the RPC and fetch the chain ID — assert it equals `111551119090`
2. Fetch the operator wallet's TON balance — log the balance, warn if below 10 TON
3. For each contract address, call `eth_getCode` — assert it returns non-empty bytecode
4. Try a read-only call on each contract to verify ABIs match:
   - `IdentityRegistry`: call `name()` or any view function
   - `TaskFeeEscrow`: call any view function
   - `ReputationRegistry`: call any view function
   - `ValidationRegistry`: call any view function

**Run it:**
```bash
npx tsx scripts/integration/00-preflight.ts
```

If any contract returns empty code or the ABI call reverts, stop and report the mismatch.

---

## Step 2 — Agent Registration

Create: `scripts/integration/01-register-agent.ts`

This script registers the Yield Strategy Agent on TAL:

1. **Check if already registered** — query `IdentityRegistry` to see if the operator address already has an agent ID. If yes, log the existing agent ID and skip to Step 3.

2. **Prepare metadata JSON:**
```json
{
  "name": "DeFi Yield Strategy Agent",
  "version": "1.0.0",
  "description": "Risk-adjusted yield farming strategy generation with StakeSecured validation",
  "capabilities": ["yield-analysis", "risk-scoring", "portfolio-optimization"],
  "supportedProtocols": ["aave-v3", "compound-v3", "uniswap-v3", "curve", "lido", "tokamak-staking"],
  "supportedChains": [1, 10, 42161, 111551119090],
  "pricing": {
    "basic": "0.5 TON",
    "advanced": "2 TON",
    "premium": "5 TON"
  },
  "validationModel": "StakeSecured",
  "contact": "https://github.com/tokamak-network/tal-yield-agent"
}
```

3. **Upload metadata to IPFS** via the existing `IIPFSStorage` interface (or if IPFS is not configured for the script, write the JSON to a file and use a placeholder URI like `ipfs://placeholder-will-update`)

4. **Call `IdentityRegistry.register(metadataURI)`** — submit the transaction, wait for confirmation

5. **Read back the agent ID** from the registration event or by querying the contract

6. **Set operator address** if the registering wallet and operator are different

7. **Log results:**
```
✅ Agent registered
   Agent ID: <id>
   Metadata URI: <uri>
   Operator: <address>
   Tx hash: <hash>
```

Save the agent ID to a file: `scripts/integration/.agent-state.json`
```json
{
  "agentId": "<id>",
  "metadataURI": "<uri>",
  "registeredAt": "<timestamp>",
  "txHash": "<hash>"
}
```

**Run it:**
```bash
npx tsx scripts/integration/01-register-agent.ts
```

---

## Step 3 — Stake TON (if required)

Create: `scripts/integration/02-stake.ts`

1. Read agent ID from `.agent-state.json`
2. Check current stake balance via `StakingClient.getStakeBalance(agentId)`
3. If stake is below minimum required (check contract), stake the minimum amount
4. If `StakingIntegrationModule` is read-only (no write functions), check if staking happens through a different mechanism — log what you find and skip if staking is managed externally
5. Log results:
```
✅ Stake verified
   Current stake: <amount> TON
   Minimum required: <amount> TON
   Status: sufficient / staked <amount> additional
```

Update `.agent-state.json` with stake info.

**Run it:**
```bash
npx tsx scripts/integration/02-stake.ts
```

---

## Step 4 — Submit a Strategy Request (Simulate User)

Create: `scripts/integration/03-submit-request.ts`

This simulates a user requesting a yield strategy:

1. Read agent ID from `.agent-state.json`

2. **Define test request:**
```typescript
const testRequest = {
  agentId: agentState.agentId,
  tier: 'basic',                    // 0.5 TON
  riskProfile: {
    level: 'moderate',
    maxILTolerance: 0.05,           // 5% max IL
    minTVL: BigInt(1_000_000),      // $1M minimum pool TVL
    minProtocolAge: 90,             // 90 days minimum
    chainPreferences: [1, 10],      // Ethereum + Optimism
    excludeProtocols: [],
    maxSinglePoolAllocation: 0.4,   // 40% max per pool
  },
  capitalUSD: 10_000,               // $10,000 portfolio
};
```

3. **Call `TaskFeeEscrow.payForTask()`** with the appropriate TON value (0.5 TON for basic tier)

4. **Wait for transaction confirmation** and extract:
   - `taskId` from the `TaskPaid` event
   - Block number
   - Transaction hash

5. **Log results:**
```
✅ Strategy request submitted
   Task ID: <id>
   Tier: basic (0.5 TON)
   Risk profile: moderate
   Capital: $10,000
   Tx hash: <hash>
   Block: <number>
```

6. Update `.agent-state.json`:
```json
{
  "agentId": "<id>",
  "taskId": "<task_id>",
  "requestTxHash": "<hash>",
  "requestBlock": "<number>"
}
```

**Run it:**
```bash
npx tsx scripts/integration/03-submit-request.ts
```

---

## Step 5 — Generate Strategy (Agent Execution)

Create: `scripts/integration/04-generate-strategy.ts`

This simulates what the worker does when it receives a `TaskPaid` event:

1. Read task ID from `.agent-state.json`

2. **Create DataSnapshot:**
   - Use the existing `DataPipeline` to fetch current pool data from DeFi Llama and on-chain sources
   - If live data fetching fails (rate limits, network issues), fall back to creating a mock snapshot with realistic data for testing purposes
   - Pin snapshot to IPFS (or save locally if IPFS not configured)
   - Log the `snapshotId`

3. **Run analysis engine:**
   - Pass the snapshot and risk profile to `StrategyGenerator.generate()`
   - Log execution time
   - Log the `executionHash`

4. **Verify determinism:**
   - Run the generator a second time with the same inputs
   - Assert `executionHash` matches
   - Log: `✅ Determinism verified: hash1 === hash2`

5. **Upload strategy report to IPFS** (or save locally)

6. **Log the full strategy summary:**
```
✅ Strategy generated
   Snapshot ID: <hash>
   Execution hash: <hash>
   Determinism: VERIFIED
   Blended APY: <X>%
   Risk score: <X>/100
   Allocations:
     - <protocol> / <pool> on <chain>: <X>% ($<amount>) — APY: <X>%
     - ...
   Report IPFS: <cid>
   Duration: <X>ms
```

7. Update `.agent-state.json` with strategy data.

**Run it:**
```bash
npx tsx scripts/integration/04-generate-strategy.ts
```

---

## Step 6 — Deliver Strategy On-Chain

Create: `scripts/integration/05-deliver-strategy.ts`

1. Read strategy data from `.agent-state.json`

2. **Call `TaskFeeEscrow.confirmTask(taskId)`** with:
   - `strategyHash` — the execution hash
   - `reportIPFSHash` — the IPFS CID of the full report
   - Send from the operator wallet

3. **Wait for confirmation** and extract event data

4. **Log results:**
```
✅ Strategy delivered on-chain
   Task ID: <id>
   Strategy hash: <hash>
   Report IPFS: <cid>
   Tx hash: <hash>
   Gas used: <amount>
```

5. Update `.agent-state.json`.

**Run it:**
```bash
npx tsx scripts/integration/05-deliver-strategy.ts
```

---

## Step 7 — Verify Strategy via API

Create: `scripts/integration/06-verify-api.ts`

Start the API server and verify the strategy is retrievable:

1. **Start the agent-server** in the background (or connect to an already-running instance)

2. **Test all relevant API endpoints:**

```
GET /api/v1/health                          → expect 200
GET /api/v1/strategy/<taskId>               → expect task status = 'delivered'
GET /api/v1/strategy/<taskId>/report        → expect full strategy report JSON
GET /api/v1/agent/reputation                → expect reputation data
GET /api/v1/agent/stats                     → expect delivery stats
GET /api/v1/snapshot/<snapshotId>           → expect snapshot data
GET /api/v1/pools                           → expect pool list
```

3. **Log results for each endpoint:**
```
✅ API verification
   /health                    → 200 OK
   /strategy/<taskId>         → 200, status: delivered
   /strategy/<taskId>/report  → 200, allocations: 4
   /agent/reputation          → 200, score: <X>
   /agent/stats               → 200, delivered: <X>
   /snapshot/<id>             → 200, pools: <X>
   /pools                     → 200, count: <X>
```

**Run it:**
```bash
# Terminal 1: start server
pnpm --filter agent-server dev &

# Terminal 2: run verification
npx tsx scripts/integration/06-verify-api.ts
```

---

## Step 8 — Validator Re-execution (StakeSecured Proof)

Create: `scripts/integration/07-validate.ts`

This is the critical test — proving that a validator can independently reproduce the same result:

1. Read the `snapshotId` and `executionHash` from `.agent-state.json`

2. **Fetch the DataSnapshot** from IPFS (or local file) using the `snapshotId`

3. **Re-create the same risk profile** that was used in Step 4

4. **Run `StrategyGenerator.generate()`** with the fetched snapshot and risk profile

5. **Compare execution hashes:**
```
Agent's execution hash:     0xabc123...
Validator's execution hash: 0xabc123...
Match: ✅ YES
```

6. If hashes match:
   - Call `ValidationRegistry.submitValidation(taskId, true, executionHash)` if the validator role is available
   - Or just log the successful verification if submitting requires a separate validator wallet

7. **Log results:**
```
✅ StakeSecured validation PASSED
   Original hash:   <hash>
   Re-executed hash: <hash>
   Match: YES
   Validation tx: <hash> (or "skipped — requires separate validator wallet")
```

**Run it:**
```bash
npx tsx scripts/integration/07-validate.ts
```

---

## Step 9 — Payment Claim (Post-Dispute Window)

Create: `scripts/integration/08-claim-payment.ts`

1. Read task data from `.agent-state.json`

2. **Check dispute window status:**
   - Query the escrow contract for the task's dispute deadline
   - If the dispute window hasn't expired yet, log the remaining time and explain that in production this would be a 48-hour wait
   - For testnet, check if there's a way to fast-forward or if the dispute window is shorter

3. **If dispute window has passed:**
   - Call `TaskFeeEscrow.claimFees(agentId)` or `claimFees(taskId)`
   - Wait for confirmation
   - Log: `✅ Payment claimed: <amount> TON, tx: <hash>`

4. **If dispute window is still active:**
   - Log: `⏳ Dispute window active — <X> hours remaining. Payment claim deferred.`
   - Log the command to run later: `npx tsx scripts/integration/08-claim-payment.ts`

**Run it:**
```bash
npx tsx scripts/integration/08-claim-payment.ts
```

---

## Step 10 — Submit Feedback (Reputation Loop)

Create: `scripts/integration/09-submit-feedback.ts`

Simulates a user leaving feedback after receiving their strategy:

1. Read agent ID and task ID from `.agent-state.json`

2. **Call `ReputationRegistry.submitFeedback()`** with:
   - `agentId`
   - `taskId`
   - `score: 4` (out of 5)
   - `comment: "Integration test — strategy generation verified"`

3. **Read back reputation data:**
   - Call `ReputationClient.getFullReputation(agentId)`
   - Log updated scores

4. **Log results:**
```
✅ Feedback submitted
   Agent ID: <id>
   Task ID: <id>
   Score: 4/5
   Updated reputation: <data>
   Tx hash: <hash>
```

**Run it:**
```bash
npx tsx scripts/integration/09-submit-feedback.ts
```

---

## Step 11 — Full Lifecycle Report

Create: `scripts/integration/10-report.ts`

Reads `.agent-state.json` and generates a final summary:

```markdown
# Integration Test Report: Thanos Sepolia

**Date:** <timestamp>
**Network:** Thanos Sepolia (chain 111551119090)
**Agent ID:** <id>
**Operator:** <address>

## Lifecycle Results

| Step | Status | Tx Hash | Gas Used |
|------|--------|---------|----------|
| 0. Preflight | ✅ | — | — |
| 1. Agent Registration | ✅ | 0xabc... | <gas> |
| 2. Stake Verification | ✅ | — | — |
| 3. Task Submission | ✅ | 0xdef... | <gas> |
| 4. Strategy Generation | ✅ | — (off-chain) | — |
| 5. On-chain Delivery | ✅ | 0xghi... | <gas> |
| 6. API Verification | ✅ | — | — |
| 7. Validator Re-execution | ✅ | — | — |
| 8. Payment Claim | ✅/⏳ | 0xjkl... | <gas> |
| 9. Feedback | ✅ | 0xmno... | <gas> |

## Strategy Summary
- Blended APY: <X>%
- Risk Score: <X>/100
- Allocations: <count>
- Determinism: VERIFIED

## Gas Summary
- Total gas used: <total>
- Estimated cost: <TON amount>

## On-Chain Artifacts
- Agent ID: <id>
- Task ID: <id>
- Strategy Hash: <hash>
- Report IPFS: <cid>
- Snapshot IPFS: <cid>

## Contract Interactions
| Contract | Function | Status |
|----------|----------|--------|
| IdentityRegistry | register() | ✅ |
| TaskFeeEscrow | payForTask() | ✅ |
| TaskFeeEscrow | confirmTask() | ✅ |
| TaskFeeEscrow | claimFees() | ✅/⏳ |
| ReputationRegistry | submitFeedback() | ✅ |
| ValidationRegistry | submitValidation() | ✅/skipped |
```

Save report to `scripts/integration/INTEGRATION_REPORT.md` and also copy to project root.

**Run it:**
```bash
npx tsx scripts/integration/10-report.ts
```

---

## Master Runner

Create: `scripts/integration/run-all.ts`

Runs all scripts in sequence, stopping on first failure:

```typescript
const steps = [
  '00-preflight',
  '01-register-agent',
  '02-stake',
  '03-submit-request',
  '04-generate-strategy',
  '05-deliver-strategy',
  '06-verify-api',
  '07-validate',
  '08-claim-payment',
  '09-submit-feedback',
  '10-report',
];
```

Each step:
1. Prints: `\n▶ Step N: <name>\n`
2. Executes: `npx tsx scripts/integration/<name>.ts`
3. On success: `✅ Step N passed\n`
4. On failure: `❌ Step N FAILED\n<error>\nStopping.` — exit with code 1

**Run the full lifecycle:**
```bash
npx tsx scripts/integration/run-all.ts
```

---

## Error Handling

Every script must:
- Catch and log all errors with full stack traces
- Never swallow errors silently
- Exit with code 1 on failure so the master runner stops
- Never log private keys, even on error
- Handle RPC timeouts gracefully (retry 3 times with 5s delay)
- Handle "insufficient funds" with a clear message about needing testnet TON

## State Management

All scripts share state via `scripts/integration/.agent-state.json`. Each script:
- Reads the current state at startup
- Appends its results before exiting
- Never overwrites fields set by previous scripts

Add `.agent-state.json` to `.gitignore`.

## Important Notes

1. **Testnet TON:** The operator wallet needs testnet TON for gas and the escrow deposit. If the balance is insufficient, the preflight check will catch it. Get testnet TON from the Thanos Sepolia faucet.

2. **IPFS fallback:** If Pinata is not configured, scripts should fall back to saving data locally in `scripts/integration/.data/` and using file hashes as placeholder CIDs. The lifecycle test should work without IPFS — IPFS is a bonus, not a blocker.

3. **Dispute window:** On testnet the dispute window may be 48 hours. The payment claim step (Step 8) may need to be deferred. The master runner should handle this gracefully — log the deferral and continue to Steps 9-10.

4. **API server for Step 6:** If you can't start the server in the background, skip Step 6 and note it as "manual verification required" in the report.

5. **Do not modify any contract code.** This test verifies that the off-chain code works with the already-deployed contracts as-is.
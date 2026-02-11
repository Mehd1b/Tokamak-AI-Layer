# Fix All Verification Failures

Read `VERIFY.md` and `VERIFICATION_REPORT.md` for full context on what was verified and what failed.

## Deployed Contract Context

All TAL contracts are deployed on **Thanos Sepolia**. Use these for all integration work:

```
Chain ID: 111551119090
RPC URL: https://rpc.thanos-sepolia.tokamak.network

IDENTITY_REGISTRY=0x3f89CD27fD877827E7665A9883b3c0180E22A525
REPUTATION_REGISTRY=0x0052258E517835081c94c0B685409f2EfC4EfD502b
VALIDATION_REGISTRY=0x09447147C6E75a60A449f38532F06E19F5F632F3
TASK_FEE_ESCROW=0x43f9E59b6bFCacD70fcba4f3F6234a6a9F064b8C
```

## Step 0 — Fetch Missing ABIs

Before writing any code, fetch the ABIs for the two contracts we're missing:

1. Fetch the ABI for `VALIDATION_REGISTRY` at `0x09447147C6E75a60A449f38532F06E19F5F632F3` from the Thanos Sepolia block explorer or by calling the RPC. Add it to `packages/shared/src/abi/TALValidationRegistry.ts` in the same format as the existing ABI files.

2. Check if `StakingIntegrationModule` has a separate deployed address or if staking functions live on one of the existing contracts (Identity or Validation registry). Inspect the existing ABIs for `stake`, `getStakeBalance`, `requestUnstake` functions. If staking is part of an existing contract, don't create a separate client — extend the relevant existing client.

If you cannot fetch ABIs from the explorer, use `cast abi <address> --rpc-url https://rpc.thanos-sepolia.tokamak.network` or check if the contracts are verified. If neither works, flag it and move on to items that don't depend on the missing ABIs.

## Step 1 — Update Chain Configuration

Update `packages/shared/src/chains.ts` to use the correct chain config:
```
Chain Name: Thanos Sepolia
Chain ID: 111551119090
RPC: https://rpc.thanos-sepolia.tokamak.network
```

Update `packages/shared/src/addresses.ts` with the contract addresses above. Keep these as defaults but make them overridable via env vars.

## Step 2 — Make Contract Addresses Env-Configurable

In both `agent-server` and `agent-worker` configs, read contract addresses from environment variables with fallback to the hardcoded defaults:

```typescript
// Example pattern
const addresses = {
  identityRegistry: process.env.IDENTITY_REGISTRY ?? DEFAULT_ADDRESSES.identityRegistry,
  reputationRegistry: process.env.REPUTATION_REGISTRY ?? DEFAULT_ADDRESSES.reputationRegistry,
  validationRegistry: process.env.VALIDATION_REGISTRY ?? DEFAULT_ADDRESSES.validationRegistry,
  taskFeeEscrow: process.env.TASK_FEE_ESCROW ?? DEFAULT_ADDRESSES.taskFeeEscrow,
};
```

Update `.env.example` with all 4 contract addresses and the RPC URL.

## Step 3 — Create Missing TAL SDK Clients

### 3a. ValidationClient (`packages/tal-sdk/src/validation-client.ts`)

Using the ABI fetched in Step 0, create `ValidationClient` with:
- `getValidationQueue()` — read pending validation tasks
- `submitValidation(taskId, isValid, executionHash)` — validator submits re-execution result
- `getValidationResult(taskId)` — read consensus outcome

Follow the same patterns as `EscrowClient` and `ReputationClient` — use `publicClient` for reads, `walletClient` for writes, `simulateContract` before `writeContract`.

### 3b. StakingClient (`packages/tal-sdk/src/staking-client.ts`)

If staking functions exist on a separate contract, create `StakingClient` with:
- `getStakeBalance(agentId)` — read current stake
- `stake(amount)` — stake TON
- `requestUnstake(amount)` — begin unstaking

If staking functions are part of an existing contract (e.g., IdentityRegistry), extend that client instead. Don't create a separate client for no reason.

### 3c. Add `updateAPYAccuracy` to ReputationClient

Add the missing method:
- `updateAPYAccuracy(agentId, taskId, actualAPY)` — writes actual APY data for accuracy tracking

Check the `REPUTATION_REGISTRY` ABI for the correct function name and parameters.

### 3d. Export new clients

Export `ValidationClient` and `StakingClient` (if separate) from `packages/tal-sdk/src/index.ts`. Write unit tests for each client following the same mocking patterns as existing client tests.

## Step 4 — Complete Event Listener

Currently only `TaskPaid` is watched. Add watchers for all 5 spec'd events:

| Event | Source Contract | BullMQ Job to Dispatch |
|-------|----------------|----------------------|
| `TaskPaid` | TASK_FEE_ESCROW | `strategy-generate` (already done) |
| `TaskDisputed` | TASK_FEE_ESCROW | Log + alert operator |
| `TaskRefunded` | TASK_FEE_ESCROW | Update task status to 'refunded' |
| `ValidationSubmitted` | VALIDATION_REGISTRY | Track consensus progress |
| `FeedbackSubmitted` | REPUTATION_REGISTRY | `reputation-update` job |

Check each contract's ABI for the exact event names and parameter types. Use `watchContractEvent` with the correct ABI for each contract.

Add reconnection logic: if the WebSocket drops, retry with exponential backoff (1s, 2s, 4s, max 30s).

## Step 5 — Add Missing Worker Jobs

### 5a. `apy-accuracy-check` job

Daily cron job that:
1. Queries all delivered strategies from 7, 30, and 90 days ago
2. For each, fetches current actual APY for every pool in the allocation using the existing protocol adapters
3. Computes prediction error: `|predicted - actual| / predicted`
4. Calls `ReputationClient.updateAPYAccuracy(agentId, taskId, actualAPY)` on-chain
5. Logs results for monitoring

Register this in the worker's job processor alongside the existing jobs. Cron schedule: once per day at 00:00 UTC.

### 5b. `reputation-update` job

Triggered by `FeedbackSubmitted` event:
1. Receives `agentId`, `taskId`, `score`, `comment` from the event
2. Updates local reputation cache (in-memory or Redis)
3. Logs the feedback for monitoring

This is a lightweight job — the on-chain write already happened via the user's transaction. This job just keeps the local cache in sync.

## Step 6 — Complete Allocation Interface

Add to the `Allocation` interface in `packages/agent-core/src/strategy/`:

```typescript
interface TransactionStep {
  type: 'approve' | 'deposit' | 'swap' | 'bridge';
  contract: string;      // target contract address
  function: string;      // function name
  args: unknown[];       // function arguments
  value?: string;        // ETH/TON value if payable
  chainId: number;
  description: string;   // human-readable step description
}

interface ExitCondition {
  type: 'apy_drop' | 'risk_increase' | 'tvl_drop' | 'time_based';
  threshold: number;
  description: string;
}
```

Update the strategy generator to produce basic entry steps for each allocation:
1. `approve` — token approval for the protocol contract
2. `deposit` — deposit into the pool

And basic exit conditions:
1. APY drops below 50% of predicted value
2. Risk score increases above the user's max tolerance
3. TVL drops below 50% of snapshot value

These don't need to be executable transactions — they're advisory for the user's strategy report. But the structure must match the spec.

## Step 7 — Wire IPFS Upload in Strategy Delivery

In the `strategy-deliver` worker job:
1. After strategy generation, serialize the full `StrategyReport` to JSON
2. Upload to IPFS via the existing `IIPFSStorage.pin()` interface
3. Store the returned CID as `reportIPFSHash` on the `StrategyReport`
4. Pass `reportIPFSHash` to `EscrowClient.confirmTask()`

Add `reportIPFSHash` field to the `StrategyReport` interface if missing.

## Step 8 — API Security

### 8a. Rate Limiting

Install `@fastify/rate-limit` and add to the API server:
```typescript
await server.register(import('@fastify/rate-limit'), {
  max: 100,           // requests per window
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-api-key'] ?? req.ip,
  errorResponseBuilder: () => ({ error: 'Rate limit exceeded', statusCode: 429 }),
});
```

### 8b. EIP-712 Wallet Signature Auth

For endpoints that trigger on-chain operations (`POST /strategy/request`, `POST /validate/submit`):
1. Require an `x-signature` header containing an EIP-712 signed message
2. The signed message includes: action, timestamp, and relevant parameters
3. Recover the signer address and verify it matches the expected requester
4. Reject signatures older than 5 minutes

Use viem's `verifyTypedData` for verification.

## Step 9 — Fix Determinism Code Smell

In `packages/agent-core/src/analysis/apy-predictor.ts` line 85:
Replace `Date.now()` with `snapshot.timestamp` or a deterministic fallback. The analysis engine must never reference wall-clock time.

## Step 10 — Add Property-Based Tests

Install `fast-check` in `packages/agent-core`:
```bash
cd packages/agent-core && pnpm add -D fast-check
```

Add property-based tests for:
1. **Risk scorer:** For any valid `PoolData`, risk score is always 0-100 and confidence is always 0-1
2. **Strategy generator:** For any valid `RiskProfile` and non-empty pool list, allocations always sum to ≤100%, no single allocation exceeds `maxSinglePoolAllocation`, and `executionHash` is deterministic

## Step 11 — Configure Coverage Reporting

Add vitest coverage config to each package's `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
```

Install `@vitest/coverage-v8` in each package.

## Final Validation

After all changes:

1. Run the full test suite: `pnpm -r test`
2. Run TypeScript check: `pnpm -r exec -- npx tsc --noEmit`
3. Confirm zero `any` types: `grep -rn ": any\|as any" packages/*/src/ --include="*.ts"`
4. Confirm no new determinism violations: `grep -rn "Date.now\|Math.random" packages/agent-core/src/ --include="*.ts"`
5. Report total test count (should be 219 + new tests) and any failures

Do not move to the next step until the current step's tests pass.
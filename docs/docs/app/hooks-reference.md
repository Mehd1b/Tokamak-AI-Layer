---
title: Hooks Reference
sidebar_position: 4
---

# Hooks Reference

The TAL frontend exposes a set of custom React hooks that wrap wagmi's `useReadContract`, `useWriteContract`, and `useWaitForTransactionReceipt` primitives. Each hook targets a specific smart contract function and handles ABI imports, address resolution, and chain ID configuration internally.

:::tip Under the Hood
All read hooks use wagmi's `useReadContract` or `useReadContracts` (for batch multicalls). All write hooks pair `useWriteContract` with `useWaitForTransactionReceipt` to provide `isPending`, `isConfirming`, and `isSuccess` lifecycle states. See [Contract Integration](./contract-integration) for the full pattern.
:::

---

## Wallet

### `useWallet`

**File**: `frontend/src/hooks/useWallet.ts`

Central hook for wallet state and network detection.

| Return Field | Type | Description |
|-------------|------|-------------|
| `address` | `Address \| undefined` | Connected wallet address |
| `isConnected` | `boolean` | Whether a wallet is connected |
| `isConnecting` | `boolean` | Connection in progress |
| `isCorrectChain` | `boolean` | On either L1 or L2 |
| `isL1` | `boolean` | Connected to Sepolia (chain 11155111) |
| `isL2` | `boolean` | Connected to Thanos Sepolia (chain 111551119090) |
| `chainId` | `number` | Current chain ID |
| `switchToL1` | `() => void` | Switch wallet to L1 Sepolia |
| `switchToL2` | `() => void` | Switch wallet to Thanos Sepolia L2 |

```tsx
const { address, isConnected, isL2, switchToL2 } = useWallet();
```

---

## Agent Hooks

### `useAgent(agentId)`

**File**: `frontend/src/hooks/useAgent.ts`

Fetches on-chain data for a single agent from the Identity Registry.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | `bigint \| undefined` | The agent's token ID |

| Return Field | Type | Description |
|-------------|------|-------------|
| `agent.agentId` | `bigint` | Token ID |
| `agent.owner` | `Address` | NFT owner address |
| `agent.agentURI` | `string` | IPFS metadata URI |
| `agent.isVerifiedOperator` | `boolean` | Operator stake verification status |
| `agent.operator` | `Address` | Designated operator address |
| `agent.zkIdentity` | `0x${string}` | ZK identity commitment hash |
| `isLoading` | `boolean` | Data loading state |

### `useAgentCount()`

**File**: `frontend/src/hooks/useAgent.ts`

Returns the total number of registered agents.

| Return Field | Type | Description |
|-------------|------|-------------|
| `count` | `bigint \| undefined` | Total agent count |
| `isLoading` | `boolean` | Loading state |

### `useAgentsByOwner(owner)`

**File**: `frontend/src/hooks/useAgent.ts`

Returns all agent IDs owned by a specific address.

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | `Address \| undefined` | Owner address to query |

| Return Field | Type | Description |
|-------------|------|-------------|
| `agentIds` | `bigint[] \| undefined` | Array of owned agent token IDs |
| `isLoading` | `boolean` | Loading state |

### `useAgentList(count)`

**File**: `frontend/src/hooks/useAgent.ts`

Batch-loads agent data (owner + URI) for up to 50 agents using `useReadContracts` multicall.

| Parameter | Type | Description |
|-----------|------|-------------|
| `count` | `number` | Number of agents to load |

| Return Field | Type | Description |
|-------------|------|-------------|
| `agents` | `Array<{ agentId, owner, agentURI }>` | Agent data array |
| `isLoading` | `boolean` | Loading state |

### `useAgentMetadata(agentURI)`

**File**: `frontend/src/hooks/useAgentMetadata.ts`

Fetches and parses ERC-8004 registration metadata from IPFS. Tries multiple gateways (Pinata, ipfs.io, Cloudflare) with an in-memory cache.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentURI` | `string \| undefined` | IPFS URI (e.g., `ipfs://Qm...`) |

| Return Field | Type | Description |
|-------------|------|-------------|
| `name` | `string \| undefined` | Agent name |
| `description` | `string \| undefined` | Agent description |
| `capabilities` | `string[] \| undefined` | Capability list |
| `active` | `boolean \| undefined` | Active status |
| `services` | `Record<string, string> \| undefined` | Service endpoint map |
| `pricing` | `{ currency?, perRequest? } \| undefined` | Pricing config |
| `isLoading` | `boolean` | Fetch in progress |
| `error` | `string \| undefined` | Error message if all gateways fail |

---

## Registration

### `useRegisterAgent()`

**File**: `frontend/src/hooks/useRegisterAgent.ts`

Calls `TALIdentityRegistry.register(agentURI)` to mint a new agent NFT.

| Return Field | Type | Description |
|-------------|------|-------------|
| `register` | `(agentURI: string) => void` | Trigger registration |
| `hash` | `0x${string} \| undefined` | Transaction hash |
| `isPending` | `boolean` | Awaiting wallet confirmation |
| `isConfirming` | `boolean` | Transaction confirming on-chain |
| `isSuccess` | `boolean` | Transaction confirmed |
| `error` | `Error \| null` | Transaction error |
| `newAgentId` | `bigint \| undefined` | Newly minted agent ID (parsed from Transfer event) |

---

## Reputation Hooks

### `useFeedbackCount(agentId)`

**File**: `frontend/src/hooks/useReputation.ts`

Returns the number of feedback submissions for an agent.

### `useClientList(agentId)`

Returns the list of unique client addresses that have submitted feedback.

### `useReputationSummary(agentId, clients)`

Calls `getSummary()` for aggregated reputation stats: `totalValue`, `count`, `min`, `max`.

### `useVerifiedSummary(agentId, clients)`

Same as above but uses `getVerifiedSummary()` which filters to payment-verified feedback only.

### `useReviewerReputation(reviewer)`

Returns the reviewer reputation score for a specific address.

### `useAgentRatings(agentIds)`

**Batch hook** -- fetches ratings for an array of agents in two multicall rounds:
1. `getClientList` for each agent
2. `getSummary` for agents that have clients

Returns a `Map<number, AgentRating>` where `AgentRating` contains `averageScore` and `feedbackCount`.

### `useFeedbacks(agentId, clients)`

Fetches all individual feedback entries for an agent across all clients. Returns `FeedbackEntry[]` sorted by timestamp descending.

| `FeedbackEntry` Field | Type | Description |
|-----------------------|------|-------------|
| `value` | `bigint` | Rating value |
| `valueDecimals` | `number` | Decimal precision |
| `tag1`, `tag2` | `string` | Category tags |
| `feedbackURI` | `string` | Comment text or URI |
| `feedbackHash` | `0x${string}` | Keccak256 of feedback content |
| `isRevoked` | `boolean` | Whether revoked |
| `timestamp` | `bigint` | Unix timestamp |
| `client` | `Address` | Submitter address |

### `useSubmitFeedback()`

**File**: `frontend/src/hooks/useSubmitFeedback.ts`

Writes feedback to `TALReputationRegistry.submitFeedback()`. Maps 1-5 star ratings to `int128` values with 1 decimal (10, 20, 30, 40, 50).

| Parameter | Type | Description |
|-----------|------|-------------|
| `params.agentId` | `bigint` | Target agent |
| `params.rating` | `number` | 1-5 stars |
| `params.category` | `string` | Feedback category tag |
| `params.comment` | `string \| undefined` | Optional comment |

---

## Validation Hooks

### `useAgentValidations(agentId)`

**File**: `frontend/src/hooks/useValidation.ts`

Returns all validation request hashes for an agent.

### `useValidation(requestHash)`

Fetches the full validation data (request + response) for a given request hash.

### `usePendingValidationCount(agentId)`

Returns the count of pending (uncompleted) validations for an agent.

### `useIsDisputed(requestHash)`

Checks whether a validation has been disputed.

### `useAllValidationHashes(agentCount)`

Batch-fetches validation hashes for up to 30 agents. Returns `Array<{ hash, agentId }>`.

### `useValidationBatch(hashes)`

Batch-loads validation request and response data for an array of hashes.

### `useRequestValidation()`

Calls the agent runtime API (`/api/runtime/[agentId]/validate`) to trigger off-chain validation.

### `useRequestValidationOnChain()`

Writes a validation request to `TALValidationRegistry.requestValidation()` with a bounty payment.

### `useSubmitValidation()`

Writes validation results on-chain via `submitValidation(requestHash, score, proof, detailsURI)`.

### `useDisputeValidation()`

Disputes a validation via `disputeValidation(requestHash, evidence)`.

---

## Staking Hooks

**File**: `frontend/src/hooks/useStaking.ts`

All staking hooks target L1 Sepolia (chain ID 11155111).

### Read Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTONBalance(address)` | `bigint` | TON token balance (18 decimals) |
| `useWTONBalance(address)` | `bigint` | WTON token balance (27 decimals) |
| `useTONAllowance(owner)` | `bigint` | TON allowance to WTON contract |
| `useWTONAllowance(owner)` | `bigint` | WTON allowance to DepositManager |
| `useStakeBalance(address)` | `bigint` | Staked amount via SeigManager (27 decimals) |

### Write Hooks

| Hook | Action | Step |
|------|--------|------|
| `useApproveTON()` | Approve TON to WTON contract | Step 1/4 |
| `useSwapToWTON()` | Swap TON to WTON | Step 2/4 |
| `useApproveWTON()` | Approve WTON to DepositManager | Step 3/4 |
| `useStakeTON()` | Deposit WTON to DepositManager | Step 4/4 |
| `useUnstakeTON()` | Request withdrawal from DepositManager | Unstake |

### Utility

```typescript
// Convert TON amount (18 decimals) to WTON amount (27 decimals)
export const toWTONAmount = (tonRawAmount: bigint): bigint =>
  tonRawAmount * 10n ** 9n;
```

---

## Task Fee Hooks

**File**: `frontend/src/hooks/useTaskFee.ts`

Interact with the **TaskFeeEscrow** contract on Thanos Sepolia L2.

### Read Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTONBalanceL2(address)` | `Balance` | Native TON balance on L2 |
| `useAgentFee(agentId)` | `bigint` | Per-task fee in wei |
| `useIsTaskPaid(taskRef)` | `boolean` | Whether a task has been paid for |
| `useAgentFeeBalance(agentId)` | `bigint` | Unclaimed fee balance |
| `useTaskEscrow(taskRef)` | `EscrowData` | Full escrow status (payer, amount, status) |
| `useHasUsedAgent(agentId, user)` | `boolean` | Whether user has completed a task |

### Write Hooks

| Hook | Action | Description |
|------|--------|-------------|
| `usePayForTask()` | `payForTask(agentId, taskRef)` | Pay native TON for a task (payable) |
| `useSetAgentFee()` | `setAgentFee(agentId, feePerTask)` | Set per-task fee (owner only) |
| `useClaimFees()` | `claimFees(agentId)` | Claim accumulated fees (owner only) |
| `useRefundTask()` | `refundTask(taskRef)` | Refund escrowed funds for failed task |

### Utility

```typescript
// Generate deterministic task reference for escrow
function generateTaskRef(
  agentId: bigint,
  userAddress: Address,
  nonce: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ['uint256', 'address', 'uint256'],
      [agentId, userAddress, nonce],
    ),
  );
}
```

---

## Agent Runtime Hooks

**File**: `frontend/src/hooks/useAgentRuntime.ts`

These hooks communicate with the agent runtime server via Next.js API routes, not directly with smart contracts.

### `useRuntimeAgent(onChainAgentId)`

Fetches agent runtime info (capabilities, status, endpoint) from `/api/runtime/[agentId]/info`.

### `useSubmitTask()`

Submits a task to an agent runtime via `/api/runtime/[agentId]/tasks`. Supports optional payment transaction hash and task reference.

### `useRecentTasks(onChainAgentId)`

Fetches recent task results for an agent from the runtime server. Returns `TaskResult[]` with status, input, output, hashes, and timestamps.

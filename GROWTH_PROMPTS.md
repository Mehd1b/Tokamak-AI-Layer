# Tokamak AI Layer — Growth Task Prompts

Each section below is a self-contained prompt to be executed against this codebase. Tasks are ordered by priority.

---

## Table of Contents

| # | Task | Priority |
|---|------|----------|
| 1 | [Enable All Wallets](#1-enable-all-wallets) | P0 |
| 2 | [Seed Vaults with Team Capital](#2-seed-vaults-with-team-capital) | P0 |
| 3 | [Points Program](#3-points-program) | P0 |
| 4 | [DefiLlama Adapter](#4-defillama-adapter) | P1 |
| 5 | [Dune Dashboards](#5-dune-dashboards) | P1 |
| 6 | [Hosted Proof Generation Service](#6-hosted-proof-generation-service) | P1 |
| 7 | [Aave V3 Adapter](#7-aave-v3-adapter) | P1 |
| 8 | [Lido Adapter](#8-lido-adapter) | P1 |
| 9 | [Uniswap V4 Adapter](#9-uniswap-v4-adapter) | P1 |
| 10 | [Pendle Adapter](#10-pendle-adapter) | P1 |
| 11 | [Morpho Adapter](#11-morpho-adapter) | P1 |
| 12 | [TypeScript Agent SDK](#12-typescript-agent-sdk) | P2 |
| 13 | [Python Agent SDK](#13-python-agent-sdk) | P2 |
| 14 | [Vault-of-Vaults Meta Strategy](#14-vault-of-vaults-meta-strategy) | P2 |
| 15 | [Intent-Based Agent Marketplace](#15-intent-based-agent-marketplace) | P2 |
| 16 | [Institutional Features](#16-institutional-features) | P3 |
| 17 | [Revenue Share Program for Agent Builders](#17-revenue-share-program-for-agent-builders) | P3 |
| 18 | [Staking UX Flow Optimization](#18-staking-ux-flow-optimization) | P3 |
| 19 | [Mobile Responsive Audit](#19-mobile-responsive-audit) | P3 |

---

## 1. Enable All Wallets

**File**: `frontend/src/app/providers.tsx`

```
You are a senior frontend engineer working on a Next.js 14 DeFi application using RainbowKit 2 and wagmi 2.

Currently, the wallet connection in `frontend/src/app/providers.tsx` only supports MetaMask:

  import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';

  const connectors = connectorsForWallets(
    [{ groupName: 'Supported', wallets: [metaMaskWallet] }],
    { appName: 'Tokagent', projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || 'placeholder' }
  );

Your task:
1. Import and add the following wallets from `@rainbow-me/rainbowkit/wallets`:
   - coinbaseWallet
   - walletConnectWallet
   - rabbyWallet
   - safeWallet
   - ledgerWallet
   - injectedWallet (catch-all for browser extensions)
2. Organize them into two groups:
   - "Popular": metaMaskWallet, coinbaseWallet, rabbyWallet, walletConnectWallet
   - "More": safeWallet, ledgerWallet, injectedWallet
3. Remove `multiInjectedProviderDiscovery: false` from the wagmi config to allow EIP-6963 wallet auto-detection.
4. Make sure the WalletConnect projectId env var is required in production — log a console.warn if it's 'placeholder'.

Do NOT change any chain configuration, transports, or providers structure. Only modify wallet connectors.
```

---

## 2. Seed Vaults with Team Capital

```
You are a senior protocol engineer for Tokamak AI Layer. The protocol is live on HyperEVM (chain 999), Arbitrum, and Optimism but has zero TVL because no vaults have been seeded.

Your task: write a Foundry script (`scripts/SeedVaults.s.sol`) that:

1. Reads the deployed contract addresses from environment variables:
   - AGENT_REGISTRY, VAULT_FACTORY, HYPERLIQUID_ADAPTER
   - DEPLOYER_PRIVATE_KEY
2. Registers 3 agents on AgentRegistry (if not already registered):
   - "Perp Momentum Alpha" — perp-trader agent with SMA crossover strategy
   - "ETH Yield Optimizer" — yield farming agent
   - "Delta Neutral Funding" — funding rate arbitrage agent
3. For each agent, deploys a KernelVault via VaultFactory with:
   - USDC as the deposit asset (use the canonical USDC address per chain)
   - Reasonable fee parameters: 1% management fee (100 bps), 15% performance fee (1500 bps)
   - Sets metadata URI pointing to a JSON hosted on IPFS (use placeholder URI for now)
4. Deposits a seed amount into each vault (configurable via env var SEED_AMOUNT_USDC, default 10000e6)

Also write a companion shell script `scripts/seed-vaults.sh` that:
- Takes chain name as argument (hyperEvm, arbitrum, optimism)
- Loads the correct .env file
- Runs the Foundry script with `forge script --broadcast --rpc-url`
- Logs deployed vault addresses

Reference the existing contracts:
- `contracts/src/AgentRegistry.sol` for agent registration interface
- `contracts/src/VaultFactory.sol` for vault deployment interface
- `contracts/src/KernelVault.sol` for deposit interface

Make the script idempotent — check if agents/vaults already exist before deploying.
```

---

## 3. Points Program

```
You are a senior Solidity engineer building a points program for Tokamak AI Layer to bootstrap demand-side liquidity.

Context:
- `contracts/src/ReferralManager.sol` already tracks referral points per deposit
- `contracts/src/KernelVault.sol` tracks deposits via ERC4626 mechanics
- Vaults are deployed via `contracts/src/VaultFactory.sol`

Your task: Design and implement a comprehensive points system.

**Smart Contract — `contracts/src/PointsProgram.sol`:**
1. Track points for each user address across all vaults
2. Point accrual rules:
   - Deposit points: 1 point per 1 USDC-equivalent deposited per day (time-weighted)
   - Early adopter bonus: 3x multiplier for the first 30 days after contract deployment
   - Referral bonus: 10% of referred user's points go to referrer (integrate with existing ReferralManager)
   - Execution bonus: vault depositors earn 50 bonus points each time their vault executes successfully
3. Functions:
   - `accruePoints(address vault, address user)` — callable by anyone, updates user's accrued points
   - `batchAccrue(address[] vaults, address[] users)` — batch version
   - `getPoints(address user) → uint256` — view total points
   - `getLeaderboard(uint256 offset, uint256 limit) → (address[], uint256[])` — paginated leaderboard
4. Access: only registered vaults (via VaultFactory.isDeployedVault) can trigger execution bonuses
5. Make points non-transferable (soulbound accounting)
6. Owner can set season end timestamp and multiplier changes

**Frontend — Points Dashboard:**
1. Add a new page at `frontend/src/app/points/page.tsx`
2. Show:
   - User's total points with breakdown (deposit / referral / execution / early adopter)
   - Global leaderboard (top 100)
   - User's rank
   - Season countdown timer
   - Point accrual rate (points/day based on current deposits)
3. Add a points badge to the navbar showing the connected user's point total
4. Add points info to each VaultCard component (show projected points/day for depositing)

**Integration:**
- Hook PointsProgram into KernelVault's deposit/withdraw events (add a callback or use a VaultFactory hook)
- Update the referral flow to also trigger point accrual
- Write Foundry tests covering: accrual math, multiplier transitions, batch operations, leaderboard ordering

Do NOT modify KernelVault.sol core logic. Use an external observer pattern or VaultFactory hooks.
```

---

## 4. DefiLlama Adapter

```
You are a DeFi protocol engineer submitting Tokamak AI Layer to DefiLlama for TVL tracking.

Context:
- Protocol deploys ERC4626-like vaults via VaultFactory (CREATE2)
- Each vault holds a single ERC20 asset
- TVL = sum of totalAssets() across all vaults on all chains
- Deployed chains: Ethereum mainnet (1), HyperEVM (999), Arbitrum (42161), Optimism (10)
- VaultFactory emits `VaultDeployed` events and has `getAllVaults()` view function

Your task: Create the DefiLlama adapter.

1. Create `defillama-adapter/index.js` following the DefiLlama SDK pattern:
   - Use `sdk.api.abi.multiCall` to batch-read `totalAssets()` from all vaults
   - Use `sdk.api.abi.call` on VaultFactory to get vault list via `getAllVaults()`
   - For each vault, read `asset()` to get the underlying token
   - Map chain IDs to DefiLlama chain names (ethereum, hyperevm, arbitrum, optimism)
   - Export `tvl` function per chain

2. Create `defillama-adapter/config.js`:
   - Protocol name: "Tokagent"
   - Category: "Yield Aggregator"
   - Contract addresses per chain (VaultFactory address)
   - Methodology description

3. Write a README in `defillama-adapter/README.md` with:
   - Protocol description
   - How TVL is calculated
   - Contract addresses
   - Links to docs and frontend

Reference DefiLlama's adapter contribution guidelines at https://github.com/DefiLlama/DefiLlama-Adapters.
Handle edge cases: empty vaults, native ETH vaults (WETH wrapping), vaults with strategy active (use snapshotTotalAssets).
```

---

## 5. Dune Dashboards

```
You are a data analyst building Dune Analytics dashboards for Tokamak AI Layer.

Context:
- KernelVault emits: Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares), Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares), ExecutionApplied(uint64 indexed nonce, bytes32 actionCommitment)
- VaultFactory emits: VaultDeployed(address indexed vault, bytes32 indexed agentId, address indexed deployer, address asset)
- AgentRegistry emits: AgentRegistered(bytes32 indexed agentId, address indexed author, bytes32 imageId)
- ReferralManager emits: ReferralRegistered(address indexed depositor, address indexed referrer, bytes32 code)
- OptimisticKernelVault emits: OptimisticExecutionSubmitted, ExecutionFinalized, ExecutionSlashed
- Deployed on: Ethereum (1), HyperEVM (999), Arbitrum (42161), Optimism (10)

Your task: Write SQL queries for the following dashboard panels. Output each query in a separate file under `analytics/dune/`.

1. `analytics/dune/01_tvl_over_time.sql` — Total TVL across all chains over time (daily granularity). Calculate by summing net deposits (deposit events - withdraw events) per vault per day.

2. `analytics/dune/02_unique_depositors.sql` — Cumulative unique depositors over time, broken down by chain.

3. `analytics/dune/03_vault_leaderboard.sql` — Top 20 vaults by current TVL, showing: vault address, agent ID, chain, TVL, total depositors, total executions, 30d net flow.

4. `analytics/dune/04_execution_volume.sql` — Daily execution count and cumulative executions across all vaults. Include optimistic vs standard execution breakdown.

5. `analytics/dune/05_deposit_cohort.sql` — Weekly deposit cohort retention: of users who deposited in week N, what % still have a position in week N+1, N+2, ... N+12.

6. `analytics/dune/06_agent_metrics.sql` — Per-agent metrics: number of vaults, total TVL, average vault size, total executions, number of unique depositors.

7. `analytics/dune/07_referral_funnel.sql` — Referral conversion: total referral codes created, total referrals registered, total referred deposits, referral-attributed TVL.

8. `analytics/dune/08_chain_distribution.sql` — TVL and user distribution across chains (pie chart data).

Write Dune V2 (DuneSQL / Trino) syntax. Use `{{chain}}` parameters where applicable so queries work across chains. Add comments explaining each CTE.

Also create `analytics/dune/README.md` documenting each query, the dashboard layout, and the contract addresses to decode.
```

---

## 6. Hosted Proof Generation Service

```
You are a senior backend engineer building a hosted RISC Zero proof generation service for Tokamak AI Layer.

Context:
- Agents run inside RISC Zero zkVM (guest program at `crates/runtime/kernel-guest/`)
- Proof generation takes ~9 minutes on standard hardware
- Currently, each agent operator must run their own prover
- This is the #1 friction point for agent builders

Your task: Build a proof generation microservice.

**Architecture — `prover-service/`:**

1. `prover-service/src/main.rs` — Axum HTTP server with endpoints:
   - `POST /api/v1/prove` — Accept a proof request (agent binary hash, KernelInputV1 serialized bytes)
   - `GET /api/v1/proof/{job_id}` — Poll proof status (QUEUED, PROVING, COMPLETED, FAILED)
   - `GET /api/v1/proof/{job_id}/result` — Download completed proof (seal + journal bytes)
   - `GET /health` — Health check with queue depth and prover status

2. `prover-service/src/queue.rs` — Job queue:
   - Use Redis (or in-memory with persistence) for job queue
   - FIFO ordering with priority lanes (paid > free)
   - Job timeout: 20 minutes
   - Deduplication: reject if identical input_commitment is already queued

3. `prover-service/src/prover.rs` — Prover worker:
   - Load the canonical kernel-guest ELF
   - Construct RISC Zero ExecutorEnv with KernelInputV1
   - Generate Groth16 proof
   - Extract seal and journal from receipt
   - Store result keyed by job_id

4. `prover-service/src/auth.rs` — API key authentication:
   - API keys stored in database
   - Rate limiting: 10 proofs/hour for free tier, 100/hour for paid
   - Usage tracking per key

5. `prover-service/Dockerfile` — Container with RISC Zero toolchain pre-installed
6. `prover-service/docker-compose.yml` — Service + Redis + optional GPU prover

**Integration with tal-cli:**
- Add a `tal prove --remote` flag to `crates/tal-cli/` that:
  - Submits proof request to the hosted service
  - Polls for completion
  - Downloads and caches the result locally
  - Falls back to local proving if service is unavailable

Reference:
- `crates/protocol/kernel-core/src/types.rs` for KernelInputV1/KernelJournalV1 types
- `crates/runtime/kernel-guest/src/lib.rs` for the guest program
- `crates/reference-integrator/` for the existing local proof generation flow
- Use risc0-zkvm crate for proof generation APIs

Write integration tests that submit a proof request with the example-yield-agent inputs and verify the returned seal+journal can be verified on-chain.
```

---

## 7. Aave V3 Adapter

```
You are a senior Solidity engineer building a protocol adapter for Aave V3 integration with Tokamak AI Layer vaults.

Context:
- Existing adapter pattern: `contracts/src/adapters/HyperliquidAdapter.sol` (singleton, per-vault sub-accounts, vault registration)
- KernelVault executes agent actions via CALL action type (action_type = 0x00000002)
- Agents output CALL actions targeting the adapter, which routes to the protocol
- The adapter must be safe: only registered vaults can call it, positions are isolated per vault

Your task: Create `contracts/src/adapters/AaveV3Adapter.sol`

1. Follow the HyperliquidAdapter pattern:
   - Singleton contract deployed once per chain
   - Per-vault position tracking (which aTokens are held, how much)
   - Only VaultFactory-verified vaults can register
   - Only the registered vault can call its own actions

2. Functions callable by agents (via CALL actions from KernelVault):
   - `supply(address asset, uint256 amount)` — Supply asset to Aave, receive aToken
   - `withdraw(address asset, uint256 amount)` — Withdraw from Aave, burn aToken
   - `borrow(address asset, uint256 amount, uint256 rateMode)` — Borrow from Aave
   - `repay(address asset, uint256 amount, uint256 rateMode)` — Repay borrowed amount
   - `claimRewards(address[] assets)` — Claim Aave incentive rewards back to vault
   - `withdrawToVault()` — Emergency: withdraw all positions back to vault

3. Safety:
   - Health factor check after borrow: revert if HF < 1.5 (configurable minimum)
   - Asset whitelist per vault (owner sets allowed supply/borrow assets)
   - Max leverage cap (configurable, default 3x)
   - All withdrawn assets go directly to the vault, never the adapter

4. Integration points:
   - Aave V3 Pool: IPool interface (supply, withdraw, borrow, repay, getUserAccountData)
   - Aave V3 aTokens: IERC20 for balance tracking
   - Aave V3 IncentivesController: for reward claiming

5. Write a reference Rust agent `crates/agents/aave-yield-agent/` that:
   - Takes oracle price feeds as input
   - Supplies idle vault USDC to Aave when utilization > threshold
   - Withdraws when rates drop below threshold
   - Never borrows (conservative strategy)
   - Outputs CALL actions targeting AaveV3Adapter

6. Foundry tests in `contracts/test/AaveV3Adapter.t.sol`:
   - Fork test against Arbitrum mainnet (Aave V3 is live there)
   - Test supply/withdraw cycle
   - Test borrow with health factor guard
   - Test unauthorized vault rejection
   - Test withdrawToVault emergency path

Deploy addresses for Aave V3: use the official Aave address book for each chain.
```

---

## 8. Lido Adapter

```
You are a senior Solidity engineer building a Lido stETH/wstETH adapter for Tokamak AI Layer.

Context: Same adapter pattern as HyperliquidAdapter.sol. Agents output CALL actions targeting adapters.

Your task: Create `contracts/src/adapters/LidoAdapter.sol`

1. Functions:
   - `stakeETH()` — Stake vault's ETH via Lido, receive stETH
   - `wrapToWstETH(uint256 amount)` — Wrap stETH → wstETH for DeFi composability
   - `unwrapFromWstETH(uint256 amount)` — Unwrap wstETH → stETH
   - `requestWithdrawal(uint256 amount)` — Request stETH withdrawal via Lido Withdrawal Queue
   - `claimWithdrawal(uint256 requestId)` — Claim completed withdrawal
   - `withdrawToVault()` — Return all stETH/wstETH/ETH to vault

2. Safety:
   - Only registered vaults can call
   - Track stETH/wstETH balances per vault
   - Enforce minimum stake amount (Lido minimum)
   - Handle stETH rebasing correctly (use wstETH for accounting)

3. Write a reference agent `crates/agents/lido-yield-agent/` that:
   - Stakes idle ETH when balance exceeds threshold
   - Wraps to wstETH for stable accounting
   - Monitors staking APR and adjusts allocation
   - Outputs CALL actions to LidoAdapter

4. Foundry fork tests against Ethereum mainnet:
   - Stake ETH → verify stETH received
   - Wrap/unwrap cycle
   - Withdrawal request flow
   - Unauthorized caller rejection

Lido contracts: stETH (0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84), wstETH (0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0), WithdrawalQueue (0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1).
```

---

## 9. Uniswap V4 Adapter

```
You are a senior Solidity engineer building a Uniswap V4 adapter for Tokamak AI Layer vaults.

Context: Same adapter pattern as HyperliquidAdapter.sol.

Your task: Create `contracts/src/adapters/UniswapV4Adapter.sol`

1. Functions:
   - `addLiquidity(PoolKey calldata key, int24 tickLower, int24 tickUpper, uint256 amount0, uint256 amount1)` — Add concentrated liquidity
   - `removeLiquidity(PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity)` — Remove liquidity
   - `collectFees(PoolKey calldata key, int24 tickLower, int24 tickUpper)` — Collect accrued fees
   - `swap(PoolKey calldata key, bool zeroForOne, int256 amountSpecified)` — Execute swap
   - `rebalance(PoolKey calldata key, int24 newTickLower, int24 newTickUpper)` — Atomic remove + re-add at new range
   - `withdrawToVault()` — Emergency: remove all positions, return tokens

2. Safety:
   - Slippage protection: configurable max slippage per vault (default 1%)
   - Pool whitelist per vault
   - Position tracking: store all active position keys per vault
   - Price manipulation check: compare pool price vs oracle before executing

3. Write a reference agent `crates/agents/uniswap-lp-agent/` that:
   - Monitors price and rebalances LP range around current price
   - Compounds fees by re-adding liquidity
   - Outputs CALL actions targeting UniswapV4Adapter

4. Foundry tests with Uniswap V4 PoolManager:
   - Add/remove liquidity cycle
   - Fee collection
   - Rebalance operation
   - Slippage guard
```

---

## 10. Pendle Adapter

```
You are a senior Solidity engineer building a Pendle Finance adapter for Tokamak AI Layer.

Context: Same adapter pattern as HyperliquidAdapter.sol.

Your task: Create `contracts/src/adapters/PendleAdapter.sol`

1. Functions:
   - `mintPtYt(address market, uint256 amount)` — Deposit SY, receive PT + YT
   - `redeemPtYt(address market, uint256 amount)` — Redeem PT + YT for SY
   - `swapExactPtForYt(address market, uint256 ptAmount)` — Trade PT ↔ YT
   - `addLiquidityDualSyAndPt(address market, uint256 syAmount, uint256 ptAmount)` — LP into Pendle AMM
   - `removeLiquidity(address market, uint256 lpAmount)` — Remove LP
   - `claimRewards(address[] markets)` — Claim PENDLE rewards
   - `withdrawToVault()` — Emergency exit all Pendle positions

2. Safety:
   - Market whitelist per vault
   - Expiry awareness: prevent new minting on markets expiring within 7 days
   - Track all PT, YT, LP positions per vault

3. Write a reference agent `crates/agents/pendle-yield-agent/` that:
   - Identifies highest-yielding Pendle markets
   - Mints PT for fixed yield when implied yield > threshold
   - Mints YT for yield speculation when rates are expected to rise
   - Rebalances near expiry

4. Foundry fork tests against Arbitrum:
   - Mint/redeem PT+YT cycle
   - LP add/remove
   - Reward claiming
   - Expiry guard
```

---

## 11. Morpho Adapter

```
You are a senior Solidity engineer building a Morpho Blue adapter for Tokamak AI Layer.

Context: Same adapter pattern as HyperliquidAdapter.sol.

Your task: Create `contracts/src/adapters/MorphoAdapter.sol`

1. Functions:
   - `supply(MarketParams calldata params, uint256 assets)` — Supply to a Morpho market
   - `withdraw(MarketParams calldata params, uint256 assets)` — Withdraw from a Morpho market
   - `borrow(MarketParams calldata params, uint256 assets)` — Borrow from a Morpho market
   - `repay(MarketParams calldata params, uint256 assets)` — Repay debt
   - `supplyCollateral(MarketParams calldata params, uint256 assets)` — Add collateral
   - `withdrawCollateral(MarketParams calldata params, uint256 assets)` — Remove collateral
   - `reallocate(MarketParams[] calldata from, MarketParams[] calldata to, uint256[] calldata amounts)` — Move capital between markets
   - `withdrawToVault()` — Emergency exit

2. Safety:
   - LLTV check after borrow (revert if exceeding 80% of market LLTV)
   - Market whitelist per vault (by MarketParams hash)
   - Track supply/borrow positions per vault per market

3. Write a reference agent `crates/agents/morpho-optimizer-agent/` that:
   - Allocates across Morpho markets for best risk-adjusted yield
   - Monitors utilization rates and reallocates capital
   - Never borrows (supply-only conservative strategy)

4. Foundry fork tests against Ethereum mainnet:
   - Supply/withdraw cycle
   - Borrow with LLTV guard
   - Multi-market reallocation
   - Unauthorized caller rejection

Morpho Blue address: 0xBBBBBBBBbb9cC5e90e3b3Af64bdAF62C37EEFFCb (same on all chains).
```

---

## 12. TypeScript Agent SDK

```
You are a senior TypeScript engineer creating a TypeScript SDK for building Tokamak AI Layer agents.

Context:
- The current agent SDK is Rust-only (`crates/sdk/kernel-sdk/`)
- Agent interface: `agent_main(ctx: AgentContext, opaque_inputs: &[u8]) -> AgentOutput`
- AgentContext contains: protocol_version, kernel_version, agent_id, agent_code_hash, constraint_set_hash, input_root, execution_nonce
- AgentOutput contains: Vec<ActionV1> where ActionV1 = { action_type: u32, target: [u8;32], payload: Vec<u8> }
- Action types: CALL (0x02), TRANSFER_ERC20 (0x03), NO_OP (0x04)
- Goal: let TypeScript/JavaScript developers write agents that compile to WASM and run inside RISC Zero zkVM

Your task: Create `sdk/ts-agent-sdk/`

1. `sdk/ts-agent-sdk/src/types.ts` — TypeScript types mirroring Rust types:
   - AgentContext, AgentOutput, ActionV1, ActionType enum
   - OraclePriceFeed, PricePoint (for oracle data parsing)
   - KernelInput, KernelJournal

2. `sdk/ts-agent-sdk/src/actions.ts` — Builder pattern for constructing actions:
   - `Actions.call(target: Address, value: bigint, calldata: Hex): ActionV1`
   - `Actions.transferERC20(token: Address, to: Address, amount: bigint): ActionV1`
   - `Actions.noOp(): ActionV1`
   - `Actions.aaveSupply(adapter: Address, asset: Address, amount: bigint): ActionV1` — convenience
   - `Actions.hyperliquidOpen(adapter: Address, isLong: boolean, qty: bigint, leverage: number): ActionV1` — convenience

3. `sdk/ts-agent-sdk/src/oracle.ts` — Oracle data parser:
   - `parseOracleFeed(bytes: Uint8Array): OraclePriceFeed`
   - `getPrice(feed: OraclePriceFeed, assetId: number): PricePoint`

4. `sdk/ts-agent-sdk/src/agent.ts` — Agent definition helpers:
   - `defineAgent(fn: (ctx: AgentContext, inputs: Uint8Array) => AgentOutput): Agent`
   - Validation: check action count <= 64, payload size <= 16KB

5. `sdk/ts-agent-sdk/src/codec.ts` — Serialization matching Rust wire format:
   - `encodeAgentOutput(output: AgentOutput): Uint8Array`
   - `decodeKernelInput(bytes: Uint8Array): KernelInput`
   - Must be byte-for-byte compatible with Rust codec (big-endian, length-prefixed)

6. `sdk/ts-agent-sdk/src/compile.ts` — Compilation pipeline:
   - Compile TypeScript agent → WASM via wasm-pack or AssemblyScript
   - Package WASM binary for RISC Zero guest consumption
   - Generate image ID from compiled binary

7. Example agent `sdk/ts-agent-sdk/examples/simple-yield.ts`:
   - Reads oracle price feed from inputs
   - If idle balance > threshold, supply to Aave
   - Otherwise no-op
   - Demonstrates the full flow

8. `sdk/ts-agent-sdk/package.json` — NPM package config:
   - Name: `@tokagent/agent-sdk`
   - Exports: ESM + CJS
   - Peer deps: viem (for ABI encoding utilities)

9. Tests matching the Rust codec test vectors in `crates/protocol/kernel-core/src/codec.rs`

Ensure byte-level compatibility with the Rust SDK. Reference `crates/sdk/kernel-sdk/src/types.rs` and `crates/protocol/kernel-core/src/codec.rs` for exact encoding formats.
```

---

## 13. Python Agent SDK

```
You are a senior Python engineer creating a Python SDK for building Tokamak AI Layer agents.

Context: Same as TypeScript SDK task. The goal is to let quantitative traders port their Python strategies to Tokamak agents.

Your task: Create `sdk/py-agent-sdk/`

1. `sdk/py-agent-sdk/tokagent/types.py` — Dataclasses:
   - AgentContext, AgentOutput, ActionV1, ActionType
   - OraclePriceFeed, PricePoint

2. `sdk/py-agent-sdk/tokagent/actions.py` — Action builders:
   - `call(target: bytes, value: int, calldata: bytes) -> ActionV1`
   - `transfer_erc20(token: bytes, to: bytes, amount: int) -> ActionV1`
   - `no_op() -> ActionV1`

3. `sdk/py-agent-sdk/tokagent/oracle.py` — Oracle parser:
   - `parse_feed(data: bytes) -> OraclePriceFeed`
   - `get_price(feed: OraclePriceFeed, asset_id: int) -> PricePoint`

4. `sdk/py-agent-sdk/tokagent/codec.py` — Wire-format codec:
   - `encode_output(output: AgentOutput) -> bytes`
   - `decode_input(data: bytes) -> KernelInput`
   - Must match Rust encoding exactly

5. `sdk/py-agent-sdk/tokagent/agent.py` — Agent decorator:
   ```python
   @tokagent_agent
   def my_strategy(ctx: AgentContext, inputs: bytes) -> AgentOutput:
       ...
   ```

6. `sdk/py-agent-sdk/tokagent/indicators.py` — Common trading indicators:
   - SMA, EMA, RSI, MACD, Bollinger Bands
   - These are the utilities quant traders expect

7. `sdk/py-agent-sdk/tokagent/backtest.py` — Local backtesting harness:
   - Feed historical price data through the agent
   - Track PPS impact over time
   - Generate performance report (returns, Sharpe, max drawdown)

8. Example: `sdk/py-agent-sdk/examples/momentum_strategy.py`
   - SMA crossover strategy on ETH/USD
   - Uses indicators module
   - Outputs Hyperliquid adapter calls

9. `sdk/py-agent-sdk/pyproject.toml` — Package config:
   - Name: `tokagent-sdk`
   - Python >= 3.10
   - Dependencies: eth-abi (for encoding), numpy (for indicators)

10. Compilation: document how to compile Python agent to WASM (via Pyodide or RustPython) for zkVM execution

Write pytest tests verifying codec compatibility with Rust test vectors.
```

---

## 14. Vault-of-Vaults Meta Strategy

```
You are a senior protocol engineer building a meta-vault that allocates across multiple Tokamak AI Layer vaults.

Context:
- KernelVault is ERC4626-like with deposit(assets)/withdraw(shares)
- VaultFactory tracks all deployed vaults
- Each vault has performance metrics (PPS history, returns, drawdown)

Your task:

**Smart Contract — `contracts/src/MetaVault.sol`:**
1. A vault that holds shares of other KernelVaults (vault-of-vaults)
2. Accepts user deposits in a base asset (e.g., USDC)
3. An agent allocates the base asset across underlying vaults based on strategy
4. Track: underlying vault shares, allocation weights, total NAV

Functions:
- `deposit(uint256 assets)` — Accept base asset, mint meta shares
- `withdraw(uint256 shares)` — Redeem meta shares, return base asset (may need to withdraw from underlying vaults)
- `rebalance(address[] vaults, uint256[] weights)` — Agent-triggered reallocation (via CALL action)
- `getUnderlyingAllocations() → (address[], uint256[])` — Current allocations
- `getNav() → uint256` — Net asset value based on underlying vault PPS

Safety:
- Max allocation per vault: 40% (diversification)
- Only whitelisted underlying vaults (configurable by owner)
- Rebalance cooldown: minimum 1 hour between rebalances
- Slippage guard: revert if NAV drops > 2% during rebalance

**Rust Agent — `crates/agents/meta-allocator/`:**
1. Read performance data of all underlying vaults (via oracle inputs)
2. Rank vaults by risk-adjusted return (Sharpe ratio proxy)
3. Allocate more to top performers, less to underperformers
4. Rebalance when allocation drift > 10% from target weights
5. Output CALL actions: withdraw from underweight vaults, deposit to overweight vaults

**Frontend:**
- Add MetaVault card type to `/vaults` page showing allocation pie chart
- Vault detail page shows underlying vault breakdown with individual performance

**Tests:**
- Deposit → verify meta shares minted correctly based on NAV
- Rebalance → verify allocation weights update
- Withdraw → verify proportional withdrawal from underlying vaults
- Diversification cap enforcement
```

---

## 15. Intent-Based Agent Marketplace

```
You are a senior full-stack engineer building an intent-matching system for Tokamak AI Layer.

Context:
- Users want yield but don't know which vault to choose
- Vaults have different risk/return profiles, strategies, and track records
- Current UX requires users to browse and evaluate vaults manually

Your task: Build an intent-matching marketplace.

**Backend API — `frontend/src/app/api/intents/`:**

1. `POST /api/intents/match` — Accept user preferences, return ranked vault recommendations:
   ```json
   {
     "asset": "USDC",
     "chain": 42161,
     "targetApy": 10,
     "maxDrawdown": 5,
     "riskTolerance": "medium",
     "minTvl": 50000,
     "strategyPreference": ["yield", "perp"]
   }
   ```

2. Matching algorithm:
   - Filter: asset compatibility, chain, minimum TVL
   - Score: weighted combination of:
     - APY proximity to target (40%)
     - Drawdown relative to max (30%)
     - TVL confidence (15%)
     - Execution track record / age (15%)
   - Return top 5 matches with scores and explanations

3. Vault performance data: read from on-chain PPS checkpoints (existing performance tracking in KernelVault)

**Frontend — `frontend/src/app/marketplace/page.tsx` (enhance existing):**

1. Replace empty marketplace with an intent wizard:
   - Step 1: "What asset do you want to deposit?" (USDC, ETH, WETH)
   - Step 2: "What's your target return?" (slider: 5-50% APY)
   - Step 3: "What's your risk tolerance?" (Low / Medium / High)
   - Step 4: "Any strategy preference?" (Yield farming, Perp trading, Prediction markets, Any)

2. Results page:
   - Show matched vaults with match score percentage
   - Highlight why each vault matches (badges: "Low drawdown", "High APY", "Battle-tested")
   - One-click deposit from results
   - "No good matches" state with suggestion to check back later

3. Add a CTA on the home page: "Find Your Perfect Vault →" linking to the marketplace

**Data:**
- Use on-chain data only (no off-chain database for vault metrics)
- Calculate APY from PPS change over 30 days
- Calculate drawdown from PPS checkpoints
- Cache results for 5 minutes (TanStack Query staleTime)
```

---

## 16. Institutional Features

```
You are a senior protocol engineer adding institutional-grade features to Tokamak AI Layer.

Your task: Implement the following across contracts and frontend.

**A. Gnosis Safe Integration — Frontend:**
1. Add `safeWallet` to RainbowKit connectors (if not already done in task 1)
2. In `VaultDepositForm` and `VaultWithdrawForm`, detect if connected wallet is a Safe
3. If Safe: show "Transaction will be queued for multisig approval" instead of immediate execution
4. Add a Safe Apps manifest (`frontend/public/manifest.json`) so Tokagent appears in Safe's app directory:
   ```json
   {
     "name": "Tokagent",
     "description": "Verifiable AI Agent Vaults",
     "iconPath": "logo.png",
     "iconUrl": "https://tokagent.network/logo.png"
   }
   ```

**B. Vault Access Control — `contracts/src/extensions/VaultAccessControl.sol`:**
1. Optional extension that vault deployers can enable
2. Whitelist mode: only approved addresses can deposit
3. Cap mode: per-address maximum deposit
4. KYC integration hook: vault owner can set an external KYC verifier contract
5. Functions:
   - `setWhitelistEnabled(bool)` / `addToWhitelist(address[])` / `removeFromWhitelist(address[])`
   - `setDepositCap(address depositor, uint256 maxAssets)`
   - `setKycVerifier(address verifier)` — verifier must implement `isVerified(address) → bool`

**C. Reporting API — `frontend/src/app/api/reports/`:**
1. `GET /api/reports/portfolio?address=0x...&format=csv` — Export user's vault positions as CSV
2. `GET /api/reports/vault/[address]/history?format=csv` — Export vault execution history
3. Fields: date, action, assets, shares, PPS, tx hash
4. Support JSON and CSV formats

**D. Audit Preparation:**
1. Create `contracts/SECURITY.md` documenting:
   - Known risks and assumptions
   - Emergency procedures (pause, emergency withdraw timeline)
   - Admin key management
   - Bug bounty scope and contact
2. Create `contracts/audit-scope.md` listing:
   - In-scope contracts with line counts
   - External dependencies
   - Deployment addresses per chain
   - Test coverage report generation command

**E. Frontend — Institutional Landing:**
1. Add `/institutional` page with:
   - Multisig support callout
   - Access control features
   - Reporting capabilities
   - Security documentation links
   - "Contact us" for custom integrations
```

---

## 17. Revenue Share Program for Agent Builders

```
You are a senior protocol engineer designing an agent builder incentive program for Tokamak AI Layer.

Context:
- KernelVault already has: managementFeeBps (0-5%), performanceFeeBps (0-50%), feeRecipient
- VaultFactory has: protocolFeeSplitBps (protocol treasury's cut of all fees)
- Currently no structured incentive for builders to create and maintain agents

Your task:

**Smart Contract — `contracts/src/BuilderProgram.sol`:**
1. Builder registration: agent authors register with on-chain profile
2. Revenue tracking:
   - Track total fees earned per builder across all their vaults
   - Track total TVL managed per builder
   - Track total executions per builder
3. Tier system based on performance:
   - Bronze: < $100K TVL → standard fee split (builder gets 70%, protocol 30%)
   - Silver: $100K-$1M TVL → builder gets 80%, protocol 20%
   - Gold: > $1M TVL → builder gets 90%, protocol 10%
4. Builder grants:
   - Protocol can allocate grants to builders (native token or USDC)
   - Grant vesting: linear over 6 months
   - Claimable via `claimGrant()`
5. Functions:
   - `registerBuilder(string name, string url)` — register as builder
   - `getBuilderStats(address builder) → (uint256 tvl, uint256 fees, uint256 executions, Tier tier)`
   - `claimFees()` — claim accumulated fee share
   - `allocateGrant(address builder, uint256 amount, uint256 vestingDuration)` — admin only

**Frontend — Builder Dashboard:**
1. New page: `frontend/src/app/builders/page.tsx`
   - Public builder leaderboard (by TVL, fees earned, agent count)
   - Builder profile cards with their agents and vaults
2. New page: `frontend/src/app/builders/dashboard/page.tsx` (authenticated)
   - Your agents and their performance
   - Revenue breakdown (management fees, performance fees, grants)
   - Claimable fees with claim button
   - TVL growth chart
   - Tier progress bar

**Documentation:**
- Add a "Build an Agent" guide to docs/ explaining:
  - How to write an agent (Rust, TypeScript, or Python SDK)
  - How to register and deploy
  - Fee economics and tier system
  - How to attract depositors
```

---

## 18. Staking UX Flow Optimization

```
You are a senior frontend engineer optimizing the staking flow in Tokamak AI Layer.

Context:
- Current staking flow requires 4 separate transactions: approve TON → swap to WTON → approve WTON → deposit for WSTON
- This is at `frontend/src/app/staking/page.tsx`
- Users need WSTON for bond collateral (optimistic execution)
- The multi-step flow causes drop-off

Your task:

1. Build a `StakingWizard` component (`frontend/src/components/staking/StakingWizard.tsx`):
   - Single-page wizard showing all steps with progress indicator
   - Auto-advance: after each tx confirms, automatically prompt the next
   - Batch where possible: if the user has existing WTON, skip the TON→WTON step
   - Show estimated gas for the full flow upfront
   - Handle partial completion: if user closes mid-flow, detect existing state on re-open

2. Add a `useStakingFlow` hook (`frontend/src/hooks/useStakingFlow.ts`):
   - Manages the multi-step state machine
   - States: IDLE → APPROVING_TON → SWAPPING_WTON → APPROVING_WTON → DEPOSITING_WSTON → COMPLETE
   - Reads current allowances and balances to skip unnecessary steps
   - Handles tx failures with retry at the failed step (not from the beginning)
   - Emits progress events for the wizard UI

3. Add a "Quick Stake" mode:
   - If the protocol deploys a router contract, create `contracts/src/StakingRouter.sol`:
     - Single transaction: receive TON, swap to WTON, deposit to WSTON, return WSTON to user
     - Uses multicall/batch pattern
     - Requires single approval (TON → StakingRouter)
   - Frontend detects if StakingRouter is deployed and offers "Quick Stake" toggle

4. UX improvements:
   - Show APR for WSTON staking
   - Show current bond requirements for optimistic vaults
   - Add tooltip explaining why WSTON is needed
   - Show unbonding period and pending withdrawals

Do NOT break the existing manual flow — keep it as "Advanced" mode. Make the wizard the default.
```

---

## 19. Mobile Responsive Audit

```
You are a senior frontend engineer auditing and fixing mobile responsiveness for Tokamak AI Layer.

Context:
- Frontend is Next.js 14 with Tailwind CSS
- Dark mode by default
- Key pages: /, /vaults, /vaults/[address], /deploy, /portfolio, /leaderboard, /staking, /referrals, /marketplace, /points

Your task:

1. Audit each page for mobile breakpoints (320px, 375px, 428px):
   - Navigation: hamburger menu for mobile, slide-out drawer
   - VaultCard grid: single column on mobile, 2 columns on tablet
   - Tables (execution history, leaderboard): horizontal scroll or card layout on mobile
   - Forms (deposit, withdraw, deploy): full-width inputs, sticky submit button
   - Charts: responsive container, touch-friendly tooltips
   - Wallet connect button: compact on mobile (show truncated address)
   - Modals: full-screen on mobile instead of centered popup

2. Fix specific components:
   - `VaultCard.tsx`: ensure all text truncates properly, badge wrapping
   - `DeployVaultForm.tsx`: step indicator should be vertical on mobile
   - `VaultChart.tsx`: set minimum height, enable touch pan/zoom
   - `ExecutionHistoryTable.tsx`: convert to card list on mobile
   - `LeaderboardTable.tsx`: show top 3 metrics only on mobile, expandable rows
   - `PerformanceCard.tsx`: stack metrics vertically on mobile
   - Navbar: collapsible with hamburger, show points badge inline

3. Add a bottom navigation bar for mobile (`frontend/src/components/layout/MobileNav.tsx`):
   - Tabs: Home, Vaults, Portfolio, More (dropdown)
   - Fixed position at bottom
   - Show only on screens < 768px
   - Hide desktop sidebar on mobile

4. Touch optimizations:
   - All clickable elements: minimum 44x44px touch target
   - Swipe gestures on vault cards (swipe to see more info)
   - Pull-to-refresh on vault list

5. Testing:
   - Use Playwright or Cypress viewport tests for 375px, 768px, 1024px, 1440px
   - Test wallet connect flow on mobile viewport
   - Test deposit flow on mobile viewport

Use Tailwind responsive prefixes (sm:, md:, lg:) exclusively. Do NOT add CSS media queries in separate files.
```

---

## Usage

Each prompt above is designed to be given to Claude Code (or a similar AI coding agent) as a standalone task. To execute:

1. Copy the prompt for the task you want to implement
2. Paste it into a new Claude Code session within this repository
3. The agent will have full context from the codebase to implement the task
4. Review the generated code, run tests, and iterate

Tasks are independent — they can be executed in any order, though the priority ordering (P0 → P3) reflects maximum impact on user acquisition.

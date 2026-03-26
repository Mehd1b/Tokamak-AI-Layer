# Tokagent — Implementation Strategy

> Date: 2026-03-26
> Based on: [Strategic Assessment](./STRATEGIC_ASSESSMENT.md)
> Timeline: 6 weeks (3 sprints of 2 weeks)

---

## Sprint 1: Make Vaults Understandable (Days 1–14)

**Goal:** A depositor can browse vaults, understand what each one does, and make an informed deposit decision based on real performance data.

### 1.1 Agent Profile Pages (P0) — Days 1–3

**Problem:** Vault cards show hex addresses. Users can't tell what a vault does.

**Implementation:**

1. **Create agent metadata fetcher** (`frontend/src/hooks/useAgentMetadata.ts`)
   - Read `metadataURI` from `AgentRegistry.getMetadataURI(agentId)`
   - Fetch JSON from URI (IPFS or HTTPS)
   - Cache with React Query (staleTime: 5 min)
   - Schema: `{ name, description, author, strategy, tags[], website?, twitter? }`

2. **Define metadata JSON schema** (`sdk/src/types.ts`)
   ```
   AgentMetadata {
     name: string            // "BTC Momentum Trader"
     description: string     // "SMA crossover + funding rate arbitrage on Hyperliquid"
     author: string          // "trader_xyz.eth"
     strategy: string        // "perp-trading" | "yield-farming" | "market-making"
     tags: string[]          // ["hyperliquid", "btc", "automated"]
     website?: string
     twitter?: string
   }
   ```

3. **Update VaultCard component** (`frontend/src/components/VaultCard.tsx`)
   - Display agent name instead of hex agent ID
   - Show strategy tag as colored badge
   - Show author name
   - One-line description below the name

4. **Update Vault Detail page** (`frontend/src/app/vaults/[address]/page.tsx`)
   - Agent info card: name, full description, author with link, strategy badge
   - Replace raw agentId display with human-readable name

5. **Publish metadata for existing agents**
   - Create JSON files for the 3 reference agents
   - Upload to IPFS or host on GitHub Pages
   - Call `setMetadataURI()` on-chain for each

**Files to create/modify:**
- `frontend/src/hooks/useAgentMetadata.ts` (new)
- `frontend/src/components/VaultCard.tsx` (modify)
- `frontend/src/app/vaults/[address]/page.tsx` (modify)
- `sdk/src/types.ts` (add AgentMetadata type)

---

### 1.1b CLI Metadata Command (P0) — Days 2–3

**Problem:** Vault owners have no CLI path to publish agent metadata. The frontend (1.1) depends on metadata being set on-chain, but `tal` has no command for it — only the TypeScript SDK exposes `setMetadataURI`.

**Implementation:**

1. **Add `tal metadata` subcommand** (`crates/tal-cli/src/metadata.rs`)
   - `tal metadata set` — Publish metadata for an agent
     - Flags: `--name`, `--description`, `--strategy`, `--tags`, `--website`, `--twitter`
     - Reads `AGENT_ID` from `.env` (or `--agent-id` flag)
     - Generates JSON matching the `AgentMetadata` schema from 1.1
     - Uploads to IPFS via Pinata/web3.storage (or `--uri` to skip upload and set a custom URI)
     - Calls `AgentRegistry.setMetadataURI(agentId, uri)` on-chain
     - Requires signer to be the agent author
   - `tal metadata show [agent-id]` — Display current metadata for an agent
     - Reads `metadataURI` from on-chain, fetches and pretty-prints the JSON
     - Falls back to "No metadata set" if URI is empty

2. **Interactive mode** (when flags are omitted)
   - Prompt for name, description, strategy (select from list), tags (comma-separated)
   - Preview JSON before confirming upload + on-chain tx

3. **Integration with `tal deploy`**
   - After successful vault deployment, prompt: "Set agent metadata now? (y/n)"
   - If yes, run the metadata flow inline

**Files to create/modify:**
- `crates/tal-cli/src/metadata.rs` (new)
- `crates/tal-cli/src/main.rs` (add Metadata subcommand)
- `crates/tal-cli/src/deploy.rs` (add post-deploy metadata prompt)

---

### 1.2 Performance Returns Card (P0) — Days 3–6

**Problem:** Users can't see vault performance at a glance.

**Implementation:**

1. **Create performance data hook** (`frontend/src/hooks/useVaultPerformance.ts`)
   - Read from on-chain: `initialPps`, `peakPps`, `maxDrawdownBps`, `executionWins`
   - Read PPS checkpoint arrays: `ppsCheckpointValues`, `ppsCheckpointTimestamps`
   - Compute: 7d return, 30d return, all-time return, current drawdown
   - Formula: `return = (currentPps - startPps) / startPps * 100`

2. **Add SDK performance methods** (`sdk/src/clients/KernelVaultClient.ts`)
   - `getPerformanceMetrics(vaultAddress)` → `{ allTimeReturn, maxDrawdown, executionCount, executionWins, ppsHistory[] }`
   - Uses multicall for efficient batched reads

3. **Build PerformanceCard component** (`frontend/src/components/PerformanceCard.tsx`)
   - Refactor existing chart component
   - Add summary row: APY | Max Drawdown | Win Rate | # Executions
   - Color-code: green for positive returns, red for negative
   - Sparkline mini-chart on vault cards (list view)

4. **Add returns to VaultCard** (`frontend/src/components/VaultCard.tsx`)
   - Show "↑ 12.3% (30d)" badge on each vault card
   - Show max drawdown as risk indicator

**Files to create/modify:**
- `frontend/src/hooks/useVaultPerformance.ts` (new)
- `sdk/src/clients/KernelVaultClient.ts` (add performance methods)
- `frontend/src/components/PerformanceCard.tsx` (refactor)
- `frontend/src/components/VaultCard.tsx` (add returns badge)

---

### 1.3 Vault Categories & Filtering (P1) — Days 6–7

**Problem:** Users can't filter vaults by strategy type.

**Implementation:**

1. **Add filter bar to /vaults page**
   - Protocol type chips: All | Yield | Perp Trading | Prediction Markets
   - Map from `protocolType`: 0→Generic, 1→Hyperliquid (Perp), 2→Polymarket (Prediction)
   - Strategy tags from agent metadata (secondary filter)

2. **Update sort options**
   - Add "Best Returns (30d)" and "Lowest Drawdown" sort keys
   - Requires performance data from hook above

**Files to modify:**
- `frontend/src/app/vaults/page.tsx` (add filter bar, new sort keys)

---

### 1.4 Landing Page Rewrite (P1) — Days 7–12

**Problem:** Hero communicates technology, not value. Doesn't convert visitors to depositors.

**Implementation:**

1. **New hero section**
   - Headline: "AI-Managed DeFi Strategies, Verified by Zero-Knowledge Proofs"
   - Subheadline: "Deposit into autonomous vaults. Every trade is mathematically proven correct."
   - CTA: "View Top Strategies" → /vaults?sort=returns
   - Secondary CTA: "Build an Agent" → docs

2. **Live stats bar** (below hero)
   - Total TVL across all vaults (aggregated on-chain read)
   - Number of active vaults
   - Number of verified executions
   - Total depositors (unique addresses)

3. **Top Performing Vaults section**
   - Show top 3 vaults by 30d return
   - Rich cards: agent name, strategy, return, drawdown, TVL
   - "View All Vaults" link

4. **Simplified "How It Works"**
   - 3 steps (not 4): Deposit → Agent Trades → Withdraw Anytime
   - Visual: simple flow diagram, not technical

5. **Trust signals section**
   - "Every execution verified on-chain with RISC Zero proofs"
   - Link to proof explorer / execution history
   - Open-source badge + GitHub link
   - Chain logos (Ethereum, Hyperliquid, Arbitrum, Optimism)

**Files to modify:**
- `frontend/src/app/page.tsx` (major rewrite)
- `frontend/src/hooks/useProtocolStats.ts` (new — aggregate TVL, vault count, execution count)

---

### 1.5 Portfolio View (P1) — Days 12–14

**Problem:** After depositing, users have no way to track their positions.

**Implementation:**

1. **Create Portfolio page** (`frontend/src/app/portfolio/page.tsx`)
   - Route: `/portfolio`
   - Requires wallet connection
   - Shows all vaults where user has shares > 0
   - For each: vault name (from agent metadata), current value, unrealized P&L, share count

2. **Portfolio summary card**
   - Total portfolio value (sum of all vault positions)
   - Total P&L (sum of unrealized gains/losses)
   - Number of active positions

3. **Transaction history per vault**
   - Query Deposit/Withdraw events filtered by user address
   - Show: date, type, amount, shares, tx link

4. **Add "Portfolio" link to navbar**
   - Only show when wallet connected
   - Badge with position count

**Files to create/modify:**
- `frontend/src/app/portfolio/page.tsx` (new)
- `frontend/src/app/portfolio/layout.tsx` (new — metadata)
- `frontend/src/hooks/useUserPortfolio.ts` (new)
- `frontend/src/components/layout/Navbar.tsx` (add Portfolio link)

---

## Sprint 2: Growth & Retention (Days 15–28)

**Goal:** Increase retention via notifications and drive supply-side growth via leaderboard and discovery.

### 2.1 Agent Leaderboard (P2) — Days 15–19

**Implementation:**

1. **Leaderboard page** (`frontend/src/app/leaderboard/page.tsx`)
   - Route: `/leaderboard`
   - Table: Rank | Agent Name | Strategy | 30d Return | Max Drawdown | TVL | Vaults | Executions
   - Sortable by any column
   - Time period selector: 7d / 30d / All-time

2. **Aggregation logic**
   - Group vaults by agentId
   - Compute weighted average returns (by TVL)
   - Sum TVL across all vaults per agent

3. **Agent detail page** (`frontend/src/app/agents/[agentId]/page.tsx`)
   - Agent profile: name, description, author, strategy, metadata
   - All vaults using this agent
   - Aggregate performance chart
   - "Deploy a vault with this agent" CTA (for developers)

**Files to create:**
- `frontend/src/app/leaderboard/page.tsx`
- `frontend/src/app/agents/[agentId]/page.tsx`
- `frontend/src/hooks/useAgentLeaderboard.ts`

---

### 2.2 Notification Service (P2) — Days 19–24

**Implementation:**

1. **Telegram notification bot**
   - User links wallet → Telegram chat via signed message
   - Bot monitors on-chain events per registered user:
     - `ExecutionSettled` → "Your vault 0x... executed. PPS: 1.023 (+0.3%)"
     - PPS change > 1% → "Alert: Vault 0x... PPS dropped 2.1%"
     - `StrategyActivated` / `StrategySettled` → status updates
   - Stack: Node.js service, Telegram Bot API, PostgreSQL for subscriptions

2. **Notification preferences page** (`frontend/src/app/settings/page.tsx`)
   - Link Telegram account
   - Toggle alert types (executions, PPS changes, strategy status)
   - Threshold settings (alert on >X% change)

**Files to create:**
- `notification-service/` (new service)
- `frontend/src/app/settings/page.tsx`

---

### 2.3 SDK Performance Hooks (P2) — Days 24–27

**Implementation:**

1. **Add to SDK React hooks** (`sdk/src/react/`)
   - `useVaultReturns(vaultAddress)` → `{ return7d, return30d, allTime, maxDrawdown }`
   - `useVaultPPSHistory(vaultAddress)` → `{ timestamps[], values[] }`
   - `useExecutionHistory(vaultAddress)` → `{ nonce, status, timestamp, txHash }[]`
   - `useUserPortfolio()` → `{ vaults[], totalValue, totalPnL }`

2. **Add to SDK client** (`sdk/src/clients/KernelVaultClient.ts`)
   - `getPerformanceMetrics()` — batched multicall for all perf fields
   - `getExecutionHistory()` — event log query with pagination

**Files to modify:**
- `sdk/src/react/` (add new hooks)
- `sdk/src/clients/KernelVaultClient.ts` (add methods)

---

### 2.4 One-Click Vault Deployment (P2) — Days 27–28

**Implementation:**

1. **Deploy page** (`frontend/src/app/deploy/page.tsx`)
   - Step 1: Select agent (from registry, with metadata)
   - Step 2: Choose asset (ETH, USDC, WETH, etc.)
   - Step 3: Configure (optimistic?, bond chain?)
   - Step 4: Deploy (calls VaultFactory.deployVault)
   - Success: link to new vault page

**Files to create:**
- `frontend/src/app/deploy/page.tsx`
- `frontend/src/components/DeployVaultForm.tsx`

---

## Sprint 3: Ecosystem & Monetization (Days 29–42)

**Goal:** Build supply-side flywheel and establish revenue model.

### 3.1 Agent Template Marketplace (P3) — Days 29–35

- Web UI for browsing agent templates
- Fork button wrapping `tal fork` semantics
- Template categories: yield, perp, market-making, governance
- Author profiles with published agents

### 3.2 Vault Fee Mechanism (P3) — Days 35–38

- Contract upgrade: add management fee (annual %) and performance fee (% of profits)
- Fee split: agent author gets majority, protocol treasury gets cut
- Frontend: display fee structure on vault detail page

### 3.3 Referral System (P3) — Days 38–42

- Referral codes mapped to addresses
- Track deposits with referral attribution
- Points/rewards dashboard
- Integrate with future token launch if applicable

---

## Architecture Decisions

### State Management
All new hooks should use React Query with sensible cache times:
- Agent metadata: `staleTime: 5min` (rarely changes)
- Performance data: `staleTime: 30s` (changes on execution)
- Portfolio data: `staleTime: 15s` (changes on deposit/withdraw)

### Data Sources
- Agent metadata: IPFS/HTTPS via metadataURI (off-chain)
- Performance metrics: On-chain reads via multicall (PPS checkpoints, drawdown)
- Execution history: On-chain event logs (indexed by vault)
- Leaderboard: Computed client-side from on-chain data (consider indexer if slow)

### Indexer Consideration
Sprint 1 can work without an indexer (direct RPC reads + event logs). If performance becomes an issue in Sprint 2 (leaderboard aggregation, portfolio across many vaults), consider adding a lightweight indexer:
- Option A: Ponder (TypeScript, EVM-native)
- Option B: Extend oracle-service with indexing responsibilities
- Option C: The Graph subgraph

---

## Success Metrics

| Metric | Current | Sprint 1 Target | Sprint 2 Target |
|--------|---------|-----------------|-----------------|
| Unique depositors | — | 50+ | 200+ |
| TVL | — | $100K+ | $500K+ |
| Vault page bounce rate | High (est.) | -50% | -70% |
| Time on vault detail page | Low (est.) | +3x | +5x |
| Return visits (7d) | — | 30%+ | 50%+ |
| Agent developers | 1 (team) | 3+ | 10+ |
| Third-party agents | 0 | 2+ | 5+ |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Agent metadata URIs go offline | Cache metadata in frontend build; fallback to on-chain agentId display |
| Performance data misleading (low sample) | Show "insufficient data" badge if < 5 executions; don't show APY extrapolations |
| Leaderboard gaming | Weight by TVL and time-weighted returns; flag new vaults |
| Notification spam | User-configurable thresholds; rate limit per user |
| RISC Zero dependency | Monitor SP1/Succinct as backup proving backend |

# Tokagent — Strategic Product Assessment

> Date: 2026-03-26
> Scope: Full codebase audit (frontend, SDK, contracts, oracle, CLI, agents, docs)

---

## 1. Product-Market Fit Gaps

### What's Built

A technically impressive zkVM-verified agent execution protocol with vault settlement, cross-chain bonds, CLI tooling, and a polished frontend. Live on 6 chains. The tech stack is genuinely differentiated — no one else combines full zkVM execution + constraint system + code hash binding + vault settlement.

### Where It Loses People

**a) Two audiences, one product.**
The product serves agent developers (supply side) and depositors (demand side) with radically different needs. The CLI handles developers well; the frontend handles depositors. But there's a chicken-and-egg problem: no depositors without good agents, no agents without depositors.

**b) Vault discovery is weak.**
Users land on `/vaults` and see a list of hex addresses with TVL numbers. There's no way to understand what an agent does, its strategy, risk profile, or track record without digging into on-chain data.

**c) Agent metadata is unsurfaced.**
The `AgentRegistry` supports metadata URIs but the frontend doesn't display agent names, descriptions, strategy types, or performance data.

**d) Empty marketplace.**
Only 3 reference agents exist (example-yield, defi-yield-farmer, perp-trader). No third-party agents visible. The marketplace feels empty.

**e) Abstract value proposition.**
"Verifiable execution" is technically accurate but depositors don't care about zkVM proofs — they care about returns and safety. The messaging needs to translate technical guarantees into user-facing trust signals.

---

## 2. Activation Bottlenecks

### Depositor Funnel: Landing → Browse Vaults → Connect Wallet → Deposit → Retain

| Drop-off Point | Problem | Fix |
|---------------|---------|-----|
| **Landing → Vaults** | Hero says "Verifiable Agent Execution" — doesn't answer "what can I earn?" | Lead with outcomes (yield, automated strategies), not implementation (zkVM, RISC Zero) |
| **Vaults → Pick a Vault** | Vault list shows hex addresses and TVL. No agent name, strategy, returns, risk | Rich vault cards with agent name, strategy type, APY, drawdown |
| **Vault Detail → Deposit** | Detail page is mostly technical (agent ID, image ID, nonce). PerformanceCard exists but lacks context | Show returns vs benchmark, clear risk indicators |
| **Post-Deposit → Retention** | No notifications when agent executes. No performance alerts. No portfolio tracking | Notification service (Telegram/email), portfolio dashboard |

### Developer Funnel: Discover → Install CLI → Build Agent → Deploy → Get Deposits

| Drop-off Point | Problem | Fix |
|---------------|---------|-----|
| **Build → Deploy** | Requires Rust + RISC Zero toolchain — high bar. No playground or browser IDE | Templates help; consider Python SDK long-term. Web-based deploy flow short-term |

---

## 3. Growth Levers (90-Day Horizon)

### High Impact / Low Effort

1. **Agent Profile Pages** — Surface agent metadata (name, description, strategy type, author) on vault cards and detail pages. The `AgentRegistry` already supports metadata URIs. Frontend-only change.

2. **Performance Dashboard** — Contracts already track PPS checkpoints, peak PPS, max drawdown, execution wins. Surface as a returns card: 7d/30d/all-time returns, max drawdown. Users make deposit decisions based on numbers.

3. **Landing Page Rewrite** — Lead with "Earn yield from AI-managed DeFi strategies, verified by zero-knowledge proofs." Show top-performing vaults with real numbers. Add social proof (TVL, vault count, execution count).

4. **Vault Categories/Tags** — Use existing `protocolType` field (Generic=0, Hyperliquid=1, Polymarket=2). Add strategy tags. Let users browse by strategy type.

### High Impact / Medium Effort

5. **Agent Leaderboard** — Rank agents by performance (returns, consistency, drawdown). Creates developer competition. Gives depositors a simple discovery mechanism.

6. **One-Click Vault Creation** — Web-based "Deploy Vault" flow wrapping the CLI's deploy command. Connect wallet → select agent → choose asset → deploy.

7. **Notification Service** — Telegram bot or email alerts for: agent executions, PPS changes, strategy status changes, new deposits/withdrawals.

8. **Referral/Points System** — Track deposits with referral codes. Reward early depositors and agent developers.

### High Impact / High Effort

9. **Agent Template Marketplace** — Web UI for discovering, forking, and customizing agents. The `tal fork` command already exists; needs web layer.

10. **Python SDK for Agents** — Most quant/ML developers work in Python. A Python-to-RISC0 path would 10x the potential developer base.

---

## 4. Competitive Positioning

### Defensible Edge

- **Mathematical guarantees** — not hardware-dependent like TEE (Phala, Marlin), not economic-only like Autonolas
- **Chain-agnostic** — not locked to StarkNet like Giza
- **Already live** — oracle, bonds, multi-chain infrastructure operational
- **Full stack** — CLI → agents → proofs → vaults → frontend (no competitor has this)

### How to Sharpen It

| Strategy | Rationale |
|----------|-----------|
| **Compete on "performance with proof"** | Stop leading with "verifiable." Users buy returns, not verification. ZK proof is the trust layer, not the product. Position as: "The only DeFi yield protocol where every trade is mathematically proven correct." |
| **Own the "verified agent" narrative** | Publish transparent performance data. Public dashboard with all executions + proof links. Build trust at scale before Ritual/Giza catch up. |
| **Target Hyperliquid ecosystem first** | Adapter exists, perp-trader agent works, HyperEVM supported. Massive volume, active builders. Become THE verified trading layer for Hyperliquid in 90 days. |
| **Build composability hooks** | ERC-4626 wrapper (partially there) that any DeFi protocol can use as a yield source. Let other protocols integrate Tokagent vaults. |

### Threat Matrix

| Competitor | Threat Level | Why |
|-----------|-------------|-----|
| Giza Protocol | Medium | zkSTARKs + DeFi agents, $32M volume. But Cairo-locked and no constraint system. |
| Ritual Network | Medium-High (long term) | Multi-modal verification on purpose-built L1. Broader scope but not live yet. |
| Autonolas (OLAS) | Low | Economic verification only. No cryptographic guarantees. |
| zkML projects (EZKL, Modulus) | Low | Verify inference only, not full agent orchestration. |
| TEE solutions (Phala, Marlin) | Low | Faster but hardware-dependent. Intel/NVIDIA trust assumptions. |

---

## 5. Missing Primitives

### SDK Gaps

| Gap | Impact |
|-----|--------|
| No `useExecute()` hook | Agent operators can't submit proofs via React |
| No bond management helpers | Optimistic vault flow incomplete in SDK |
| No batch operations | Can't deposit/withdraw across multiple vaults |
| No portfolio aggregation | User's total across all vaults not queryable |
| No performance metrics hooks | PPS checkpoints, drawdown on-chain but not in SDK |

### Contract Gaps

| Gap | Impact |
|-----|--------|
| No vault-level fee mechanism | Protocol can't monetize; agent authors can't charge management/performance fees |
| No delegated execution | Only vault can call execute; no keeper network integration |
| Target validation gap (P0.3) | `action.target` not validated in constraint system |

### Frontend Gaps

| Gap | Impact |
|-----|--------|
| No portfolio view | User can't see all deposits in one place |
| No agent profiles | Name, description, author, strategy not displayed |
| No historical returns | PPS over time with benchmarks not visualized |
| No deposit/withdrawal history | User can't review their transaction history |
| No notification system | No alerts on executions, PPS changes, or status changes |

---

## 6. Ranked Backlog

| Priority | Item | Impact | Effort | Rationale |
|----------|------|--------|--------|-----------|
| **P0** | Agent profile pages (name, strategy, description on vault cards) | Critical | 1-2 days | #1 conversion blocker. Users can't tell what a vault does. |
| **P0** | Performance returns card (7d/30d/all-time, drawdown) | Critical | 2-3 days | Data on-chain already. Depositors decide on numbers. |
| **P1** | Landing page rewrite (lead with outcomes, show top vaults) | High | 2-3 days | Current hero doesn't convert. Show real yields. |
| **P1** | Vault categories + strategy tags | High | 1 day | `protocolType` field exists. Makes /vaults browsable. |
| **P1** | Portfolio view (user positions across all vaults) | High | 2-3 days | Post-deposit retention. Users need a dashboard. |
| **P2** | Agent leaderboard | Medium | 3-5 days | Drives competition + discovery. |
| **P2** | Notification service (Telegram bot) | Medium | 3-5 days | Retention multiplier. |
| **P2** | SDK performance hooks | Medium | 2-3 days | Unblocks frontend + third-party integrations. |
| **P2** | One-click vault deployment (web UI) | Medium | 5-7 days | Lowers barrier for agent developers. |
| **P3** | Agent template marketplace | Lower | 1-2 weeks | Supply-side growth. `tal fork` exists; needs web layer. |
| **P3** | Referral/points system | Lower | 1 week | Standard DeFi growth playbook. |
| **P3** | Python SDK for agents | Lower | 2-4 weeks | 10x developer base. Significant engineering. |
| **P3** | Vault fee mechanism | Lower | 1 week | Monetization. Needed for agent author incentives. |

---

## Bottom Line

The protocol engineering is world-class. The contracts, ZK verification, oracle service, CLI — all production-grade. The gap is the **last mile**: translating technical excellence into user-facing value.

The biggest unlock is making vaults understandable. Right now, a depositor lands on `/vaults` and sees hex addresses. They need to see: *"BTC Momentum Strategy by @trader_xyz — 23% APY, 4.2% max drawdown, 47 verified executions."* That's a 2-3 day frontend change that fundamentally transforms the product.

**Do P0 items first** (agent profiles + returns card). **Then P1** (landing page + categories + portfolio). That's ~2 weeks of work that takes the product from "impressive tech demo" to "product people actually deposit into."

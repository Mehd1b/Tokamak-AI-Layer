# Tokagent Developer Onboarding Funnel

Internal strategy document. Each deliverable includes a self-contained Claude Code prompt that can be pasted into a session to produce the deliverable.

---

## Funnel Overview

```
Stage 1: Landing Page Hook       → "I should try this"
  frontend/src/app/developers/
  1 deliverable

Stage 2: 5-Minute Demo           → "I see how it works"
  docs/docs/
  2 deliverables

Stage 3: 30-Minute Tutorial      → "I built something real"
  docs/docs/getting-started/
  2 deliverables

Stage 4: First Real Deployment   → "My agent is running"
  docs/docs/getting-started/ + crates/agents/
  3 deliverables

Total: 8 deliverables
```

### Dependency Graph

```
1.1 (Landing Page)          ──┐
                              ├── can run in parallel
2.1 (Video Script)          ──┤
2.2 (Annotated Walkthrough) ──┘
        │
        ▼
3.1 (Guided Tutorial)       ──┐── depend on 2.x for cross-links
3.2 (Modify & Redeploy)     ──┘
        │
        ▼
4.1 (Yield Cookbook)          ──┐
4.2 (Trading Cookbook)        ──┤── depend on 3.x for cross-links
4.3 (Troubleshooting Guide)  ──┘
```

Stages 1 and 2 can execute in parallel. Within each stage, deliverables are independent.

---

## Stage 1: Landing Page Hook

**Goal:** A Rust/Solidity developer lands on `/developers` and understands in 10 seconds what Tokagent lets them build, why proofs matter, and where to start.

**Success metric:** Click-through to quickstart or tutorial from the page.

**What exists today:** No `/developers` route. The frontend has `/builders` (a leaderboard page for the builder program), `/deploy` (a vault deployment wizard), and `/vaults` (the user-facing vault browser). None of these explain what Tokagent is or how to build on it.

**What's needed:** A new Next.js page at `frontend/src/app/developers/page.tsx` with:
- Hero section: one-sentence value prop + `tal init` code snippet
- "What you get" cards: verifiable execution, enforced constraints, ERC4626 vaults, multi-chain deployment
- On-chain stats: vault count and chain count (can be static initially)
- "Get started" section: links to quickstart (`/quickstart`) and the new tutorial
- Architecture diagram: the 5-step flowchart from `docs/intro.md`

---

### Deliverable 1.1: Developer Landing Page

**File(s):** `frontend/src/app/developers/page.tsx`
**Depends on:** None

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to create a developer-facing landing page at `frontend/src/app/developers/page.tsx`.
>
> **Context:** This is a Next.js 14 app router project. Read these files first to understand the conventions:
> - `frontend/src/app/layout.tsx` (layout, fonts, metadata pattern)
> - `frontend/src/app/builders/page.tsx` (existing page pattern — 'use client', hooks, Tailwind styling)
> - `frontend/src/app/vaults/page.tsx` (another page pattern for reference)
> - `docs/docs/intro.md` (the messaging and value prop to draw from)
> - `docs/docs/quickstart.md` (the quickstart flow to link to)
> - `docs/docs/architecture/trust-model.md` (trust model details for the "what proofs guarantee" section)
>
> **What to build:** A page component at `frontend/src/app/developers/page.tsx` with these sections:
>
> 1. **Hero** — Headline: "Build Verifiable DeFi Agents". Subheadline: "Write strategy logic in Rust. The Execution Kernel proves every decision was computed correctly. Vaults execute only verified actions." Below that, a styled code block showing:
>    ```bash
>    tal init my-agent --template yield
>    tal test --local
>    tal deploy --testnet
>    ```
>
> 2. **"What you get" grid** — 4 cards in a 2x2 grid:
>    - "Verifiable Execution" — Every agent run produces a Groth16 proof. On-chain verifier checks it before any funds move.
>    - "Enforced Constraints" — Drawdown limits, position caps, and cooldowns are checked inside the proof. No code path skips them.
>    - "ERC4626 Vaults" — Standard vault interface. Users deposit, receive shares, withdraw proportionally. Compatible with existing DeFi tooling.
>    - "Multi-Chain" — Deployed on Ethereum, Arbitrum, Optimism, and HyperEVM. Deploy once, verify anywhere.
>
> 3. **"How it works" section** — A horizontal 5-step flow:
>    Your Agent → Execution Kernel → ZK Proof → On-Chain Verifier → Vault Executes Actions
>    Use styled divs with arrows between them, not an image.
>
> 4. **"Get started" section** — Two cards side by side:
>    - "5-Minute Quickstart" — "Install the CLI, scaffold an agent, test locally, deploy to testnet." Links to the docs site quickstart (use `https://docs.tokamak.network/quickstart` as the href, or a relative link if the docs are served from the same domain — check `frontend/next.config.js` for rewrites).
>    - "30-Minute Tutorial" — "Build a DeFi rebalancer agent from scratch. Covers agent_input!, CallBuilder, testing, and deployment." Links to `/getting-started/build-a-rebalancer` (this page will be created later — use this path as a placeholder).
>
> 5. **On-chain stats bar** — A horizontal bar at the bottom showing 4 stats. Use static values for now:
>    - "4 Chains" — Ethereum, Arbitrum, Optimism, HyperEVM
>    - "7 Adapters" — Aave V3, Lido, Pendle, Morpho, Hyperliquid, Polymarket, Uniswap V4
>    - "3 Agent Templates" — yield, perp-trader, polymarket-bot
>    - "< 100 Lines" — Minimum viable agent code
>
> **Styling:** Follow the existing Tailwind patterns from `builders/page.tsx`. Dark background (`bg-black` or the project's dark theme), white/gray text, accent colors from the existing palette. Use `font-mono` for code blocks. The page should be a server component if no client-side state is needed, or `'use client'` if you add interactive elements.
>
> **Do not** modify any existing files. Only create the new page file. If you need a metadata export, add it in the page file itself using the Next.js `generateMetadata` pattern.
>
> **Acceptance criteria:**
> - `frontend/src/app/developers/page.tsx` exists and exports a default component
> - Page renders all 5 sections described above
> - Code block in hero section uses monospace font and has syntax-appropriate styling
> - All external links use `target="_blank" rel="noopener noreferrer"`
> - Page follows the existing Tailwind/component patterns from other pages in the app

---

## Stage 2: 5-Minute Demo

**Goal:** A developer who clicked through from the landing page (or found the docs directly) can see the entire `tal init → deploy` flow without installing anything, and understand what each step does.

**Success metric:** Developer proceeds to install `tal` and run the quickstart themselves.

**What exists today:** The quickstart at `docs/docs/quickstart.md` is a text-only guide with 5 steps. No video, no annotated walkthrough explaining what happens under the hood at each step.

**What's needed:**
1. A video script (markdown) that someone on the team can use to record a narrated screen recording in one take
2. An annotated walkthrough page in the docs that mirrors the video content as readable text with explanations

---

### Deliverable 2.1: Video Script

**File(s):** `docs/docs/getting-started/video-script.md`
**Depends on:** None

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a video recording script for a 5-minute developer demo of the Tokagent quickstart flow.
>
> **Context:** Read these files first:
> - `docs/docs/quickstart.md` (the quickstart this video will demonstrate)
> - `docs/docs/intro.md` (the opening framing)
> - `crates/agents/example-yield-agent/agent/src/lib.rs` (the agent code that gets generated — the video will show this)
>
> **What to write:** A markdown file at `docs/docs/getting-started/video-script.md` that serves as a recording script. This file is NOT published to the docs site — it's an internal reference for the person recording the video. Structure it as:
>
> ```markdown
> ---
> title: Demo Video Script (Internal)
> sidebar_class_name: hidden
> ---
> ```
>
> The script should have this structure:
>
> 1. **Opening (0:00–0:30)** — Narration text introducing Tokagent in two sentences. What to show on screen (the docs landing page, then terminal).
>
> 2. **Install (0:30–1:00)** — Commands to run: `curl ... | sh` and `tal doctor`. Narration explaining what the CLI is. What the expected terminal output looks like.
>
> 3. **Scaffold (1:00–1:30)** — Command: `tal init my-agent --template yield`. Narration: "This generates a complete project — agent logic, test fixtures, deployment config." Show the generated directory tree. Open `agent/src/lib.rs` in an editor and point out: the `agent_input!` macro, `agent_main` function, `CallBuilder` calls.
>
> 4. **Test (1:30–2:00)** — Command: `tal test --local`. Narration: "This runs your agent's logic natively — no proof generation, instant feedback." Show the pass output. Explain: "Tests verify input parsing and action construction."
>
> 5. **Build (2:00–3:00)** — Command: `tal build --elf`. Narration: "This compiles your agent into a zkVM binary. The IMAGE_ID is the unique fingerprint — it gets registered on-chain so the verifier knows which program produced the proof." Note: "First build takes 8-10 minutes. We'll fast-forward." Show the output with IMAGE_ID.
>
> 6. **Deploy (3:00–4:00)** — Commands: `cp .env.example .env`, edit with private key, `tal deploy --testnet`. Narration: "Deploy registers your agent on the AgentRegistry, then deploys a vault via VaultFactory. The vault pins your IMAGE_ID — it will only accept proofs from this exact agent binary." Show the output with vault address.
>
> 7. **Verify (4:00–4:45)** — Command: `tal monitor --vault <ADDR> --chain 998`. Narration: "The monitor shows your vault's status — balance, executions, proof history." Show the dashboard output.
>
> 8. **Closing (4:45–5:00)** — Narration: "That's it — from zero to a deployed, verifiable agent in under 5 minutes. The quickstart used the yield template. There are also templates for Hyperliquid perpetual trading and Polymarket prediction markets." Show the `tal init --help` output with template list.
>
> For each section, include:
> - **[SHOW]** — what should be visible on screen
> - **[SAY]** — the exact narration text
> - **[DO]** — the commands to type/run
> - **[NOTE]** — any recording tips (e.g., "fast-forward the build step", "use a pre-funded wallet")
>
> Keep the narration technical and precise — the audience is Rust/Solidity developers.
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/video-script.md`
> - Has `sidebar_class_name: hidden` in frontmatter (not shown in docs navigation)
> - Covers all 8 sections with [SHOW], [SAY], [DO], [NOTE] markers
> - Total narration reads aloud in under 5 minutes (roughly 700-800 words)
> - All commands are accurate per the current quickstart.md

---

### Deliverable 2.2: Annotated Walkthrough Page

**File(s):** `docs/docs/getting-started/annotated-walkthrough.md`
**Depends on:** None

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to create an annotated walkthrough page that explains the quickstart flow in depth — what each step does, what happens under the hood, and why.
>
> **Context:** Read these files first:
> - `docs/docs/quickstart.md` (the quickstart this walkthrough expands on)
> - `docs/docs/architecture/overview.md` (architecture context)
> - `docs/docs/architecture/cryptographic-chain.md` (the proof chain)
> - `docs/docs/sdk/writing-an-agent.md` (agent development details)
> - `crates/agents/example-yield-agent/agent/src/lib.rs` (the actual agent code)
> - `docs/docs/kernel/input-format.md` and `docs/docs/kernel/journal-format.md` (wire formats)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/annotated-walkthrough.md` with frontmatter:
>
> ```yaml
> ---
> title: Annotated Walkthrough
> sidebar_position: 6
> description: What happens under the hood at each step of the quickstart
> ---
> ```
>
> For each quickstart step (install, scaffold, test, build, deploy, monitor), write:
>
> 1. **The command** — same as quickstart
> 2. **What it does** — 2-3 sentences explaining the user-visible behavior
> 3. **Under the hood** — a `:::info Under the hood` admonition block explaining what's happening technically:
>    - `tal init`: generates from template, sets up Cargo workspace, creates `build.rs` that computes `AGENT_CODE_HASH = SHA256(src/lib.rs || 0x00 || Cargo.toml)`
>    - `tal test --local`: compiles agent natively (not for zkVM), runs against fixture input, verifies action output format
>    - `tal build --elf`: invokes `risc0-build` to compile to RISC-V target, generates ELF binary, computes IMAGE_ID (RISC Zero's hash of the guest program), packages into agent-pack manifest
>    - `tal deploy --testnet`: calls `AgentRegistry.register(salt, imageId, agentCodeHash)` to get `agentId = keccak256(author, salt)`, then calls `VaultFactory.deployVault(agentId, asset, userSalt, expectedImageId)` via CREATE2
>    - `tal monitor`: polls vault contract for `totalAssets()`, `totalShares()`, `executionNonce()`, displays in terminal
> 4. **Key concept** — a `:::tip Key concept` block introducing ONE concept per step:
>    - Install → "The `tal` CLI"
>    - Scaffold → "The `agent_input!` macro"
>    - Test → "Deterministic execution"
>    - Build → "IMAGE_ID: your agent's fingerprint"
>    - Deploy → "Immutable vault binding"
>    - Monitor → "Execution nonce"
>
> End the page with a "Next steps" section linking to the new tutorial ("Build a DeFi Rebalancer Agent" at `/getting-started/build-a-rebalancer`).
>
> **Styling:** Use Docusaurus admonitions (`:::info`, `:::tip`, `:::warning`). Use mermaid diagrams if they clarify a concept (the docs site has mermaid enabled). Include code snippets from the actual agent source — copy them from `example-yield-agent/agent/src/lib.rs`, don't paraphrase.
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/annotated-walkthrough.md`
> - Covers all 6 quickstart steps (install, scaffold, test, build, deploy, monitor)
> - Each step has: command, what it does, "under the hood" admonition, "key concept" admonition
> - Code snippets are from actual source files, not fabricated
> - Links to existing docs pages use relative paths (e.g., `/architecture/overview`)
> - Ends with "Next steps" linking to `/getting-started/build-a-rebalancer`

---

## Stage 3: 30-Minute Tutorial

**Goal:** A developer who completed the quickstart builds something non-trivial — a DeFi rebalancer agent that makes a real decision based on input data. They understand how to modify agent code, write tests, and iterate.

**Success metric:** Developer has a custom agent deployed that they wrote themselves, not just a template copy.

**What exists today:** The quickstart deploys an unmodified template. The "DeFi Yield Farmer" tutorial at `docs/getting-started/defi-yield-farmer.md` exists but covers a different use case. There is no tutorial that walks through modifying and extending an agent from scratch.

**What's needed:**
1. A guided tutorial: "Build a DeFi Rebalancer Agent"
2. A follow-up exercise: "Modify and Redeploy"

---

### Deliverable 3.1: Guided Tutorial — Build a DeFi Rebalancer Agent

**File(s):** `docs/docs/getting-started/build-a-rebalancer.md`
**Depends on:** 2.1 or 2.2 (for cross-links, but not blocking)

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a developer tutorial: "Build a DeFi Rebalancer Agent" — a 30-minute guided walkthrough where the developer builds an agent that checks two yield sources and deposits into the one with the higher rate.
>
> **Context:** Read these files first:
> - `crates/agents/example-yield-agent/agent/src/lib.rs` (simplest agent — 95 lines, the starting point)
> - `crates/agents/defi-yield-farmer/agent/src/lib.rs` (more complex agent — 600 lines, shows real Aave integration patterns)
> - `docs/docs/sdk/writing-an-agent.md` (SDK guide for agent development)
> - `docs/docs/sdk/agent-input-macro.md` (agent_input! macro reference)
> - `docs/docs/sdk/call-builder.md` (CallBuilder reference)
> - `docs/docs/sdk/testing.md` (testing patterns)
> - `docs/docs/sdk/deploy-guide.md` (deployment reference)
> - `docs/docs/quickstart.md` (the quickstart this tutorial follows)
> - `contracts/src/adapters/AaveV3Adapter.sol` (Aave adapter — for understanding on-chain targets)
> - `contracts/src/adapters/LidoAdapter.sol` (Lido adapter — for understanding on-chain targets)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/build-a-rebalancer.md` with frontmatter:
>
> ```yaml
> ---
> title: "Tutorial: Build a DeFi Rebalancer"
> sidebar_position: 7
> description: Build an agent that compares yield rates and rebalances between two protocols
> ---
> ```
>
> Structure the tutorial in these sections:
>
> **1. Introduction (what we're building)**
> A rebalancer agent that receives two yield rates as input, compares them, and produces actions to deposit into the higher-yielding protocol. The agent handles three scenarios: deposit into source A, deposit into source B, or do nothing (if difference is below threshold).
>
> **2. Scaffold the project**
> Start from `tal init rebalancer --template minimal` (not the yield template — we build from scratch). Show the generated file structure.
>
> **3. Define the input format**
> Write the `agent_input!` struct step by step:
> ```rust
> kernel_sdk::agent_input! {
>     struct RebalancerInput {
>         vault_address: [u8; 20],
>         source_a: [u8; 20],       // e.g., Aave pool
>         source_b: [u8; 20],       // e.g., Lido pool
>         current_balance: u64,      // vault's available balance
>         rate_a: u32,               // yield rate in bps
>         rate_b: u32,               // yield rate in bps
>         threshold_bps: u32,        // minimum difference to trigger rebalance
>     }
> }
> ```
> Explain each field. Explain that the host (off-chain) fetches these values and encodes them — the agent only sees the encoded bytes.
>
> **4. Write the decision logic**
> Write `agent_main` with the three branches:
> - If `rate_a > rate_b + threshold_bps` → build a CALL action to deposit into source_a
> - If `rate_b > rate_a + threshold_bps` → build a CALL action to deposit into source_b
> - Otherwise → return empty actions (no rebalance needed)
>
> Show each `CallBuilder` call with explanation. Use `selector()` with a realistic function selector (e.g., Aave's `supply()` selector `0x617ba037`). Explain what `param_address` and `param_u256_from_u64` do.
>
> **5. Write tests**
> Write 4 tests:
> - `test_rebalance_to_source_a` — rate_a wins by more than threshold
> - `test_rebalance_to_source_b` — rate_b wins by more than threshold
> - `test_no_rebalance_within_threshold` — rates are close, no action
> - `test_invalid_input_returns_empty` — wrong input size
>
> Show the full test code. Explain the pattern: construct input bytes manually → call `agent_main` → assert action count and targets.
>
> **6. Test locally**
> `tal test --local` — show expected output. Explain what "local" means (native compilation, no proof).
>
> **7. Build and deploy**
> `tal build --elf` then `tal deploy --testnet`. Brief — refer to quickstart for details. Emphasize: "Your vault now runs YOUR logic, not a template."
>
> **8. What's next**
> Link to:
> - "Modify and Redeploy" exercise (at `/getting-started/modify-and-redeploy`)
> - Strategy Cookbook (at `/getting-started/yield-cookbook` and `/getting-started/trading-cookbook`)
> - Full SDK reference (`/sdk/overview`)
>
> **Writing rules:**
> - Show complete, compilable code at each step — not fragments
> - After each code section, explain what it does in 2-3 sentences
> - Use `:::tip` for "why this works" explanations
> - Use `:::warning` for common mistakes (e.g., "Don't use `HashMap` — it's non-deterministic and will fail in the zkVM")
> - All Rust code must be `#![no_std]` compatible
> - Use realistic Solidity function selectors — read them from the adapter contracts listed in the context files
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/build-a-rebalancer.md`
> - Contains complete, compilable Rust agent code (not pseudocode)
> - Contains 4 complete test functions
> - All function selectors are real (from the adapter contracts)
> - Follows Docusaurus conventions (frontmatter, admonitions, code blocks with language tags)
> - A developer following this tutorial step-by-step could produce a working agent

---

### Deliverable 3.2: Modify and Redeploy Exercise

**File(s):** `docs/docs/getting-started/modify-and-redeploy.md`
**Depends on:** 3.1 (references the rebalancer tutorial)

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a short exercise page: "Modify and Redeploy" — proving to the developer that the iteration loop works.
>
> **Context:** Read these files first:
> - `docs/docs/getting-started/build-a-rebalancer.md` (the tutorial this exercise follows — if it doesn't exist yet, read `docs/docs/quickstart.md` instead and base the exercise on the yield template)
> - `docs/docs/sdk/deploy-guide.md` (deployment reference)
> - `docs/docs/sdk/constraints-and-commitments.md` (constraint system)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/modify-and-redeploy.md` with frontmatter:
>
> ```yaml
> ---
> title: "Exercise: Modify and Redeploy"
> sidebar_position: 8
> description: Change your agent, rebuild, and verify the update on-chain
> ---
> ```
>
> Structure:
>
> **1. Starting point** — "You've deployed a rebalancer agent from the tutorial. Now let's modify it and prove the iteration loop works."
>
> **2. The change** — Add a minimum balance check: if `current_balance < 1_000_000` (less than 1 USDC), return no actions regardless of rates. Show the 3 lines of code to add at the top of `agent_main`. Explain why: "Rebalancing dust amounts wastes gas."
>
> **3. Update the tests** — Add one new test: `test_no_rebalance_below_minimum`. Show the full test.
>
> **4. Test → Build → Deploy** — Three commands:
> ```bash
> tal test --local           # verify the new behavior
> tal build --elf            # new IMAGE_ID (code changed)
> tal deploy --testnet       # new vault with new IMAGE_ID
> ```
>
> **5. Verify the change** — Explain: "Notice that `tal deploy` created a NEW vault with a NEW IMAGE_ID. The old vault still exists with the old agent. This is by design — `trustedImageId` is immutable per vault. To upgrade, you deploy a new vault and migrate depositors."
>
> **6. Key takeaway** — "Every code change produces a new IMAGE_ID. Every IMAGE_ID gets its own vault. This is the trust guarantee: depositors know exactly which code is managing their funds, and it cannot change under them."
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/modify-and-redeploy.md`
> - Contains the exact code diff (3 lines to add)
> - Contains one complete test function
> - Explains the IMAGE_ID → vault immutability relationship
> - Under 400 lines total — this is a short exercise, not a full tutorial

---

## Stage 4: First Real Deployment

**Goal:** A developer who completed the tutorial picks a real strategy from a cookbook, deploys it, and has a working agent. When things go wrong, they can diagnose the issue.

**Success metric:** Developer has an agent running a real strategy (not a tutorial exercise) on testnet or mainnet.

**What exists today:** The perp-trader has a detailed README and guide (`PERP_TRADER_GUIDE.md`), but it's buried in `crates/agents/perp-trader/` and not linked from the docs. There's no cookbook format. Troubleshooting knowledge is scattered across CLAUDE.md, the perp-trader README, and `hyperliquid-bottlenecks.md`.

**What's needed:**
1. Yield strategy cookbook (3 recipes)
2. Trading strategy cookbook (2 recipes)
3. Troubleshooting guide (consolidated from scattered sources)

---

### Deliverable 4.1: Yield Strategy Cookbook

**File(s):** `docs/docs/getting-started/yield-cookbook.md`
**Depends on:** 3.1 (cross-links to tutorial)

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a yield strategy cookbook: 3 one-page recipes for production-ready yield farming agents.
>
> **Context:** Read these files first:
> - `crates/agents/defi-yield-farmer/agent/src/lib.rs` (the existing yield farmer agent — 600 lines, real Aave patterns)
> - `crates/agents/example-yield-agent/agent/src/lib.rs` (the minimal yield agent — 95 lines)
> - `contracts/src/adapters/AaveV3Adapter.sol` (Aave adapter interface)
> - `contracts/src/adapters/LidoAdapter.sol` (Lido adapter interface)
> - `contracts/src/adapters/PendleAdapter.sol` (Pendle adapter interface)
> - `docs/docs/sdk/call-builder.md` (CallBuilder reference)
> - `docs/docs/sdk/writing-an-agent.md` (agent development guide)
> - `crates/sdk/kernel-sdk/src/actions.rs` (CallBuilder implementation — for accurate API)
> - `crates/sdk/kernel-sdk/src/erc20.rs` (ERC20 helper functions)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/yield-cookbook.md` with frontmatter:
>
> ```yaml
> ---
> title: "Cookbook: Yield Strategies"
> sidebar_position: 9
> description: Three production-ready yield farming agent recipes
> ---
> ```
>
> Write 3 recipes. Each recipe should be a self-contained section with:
> - **Strategy name and one-line description**
> - **How it works** — 3-4 sentences explaining the strategy logic
> - **Input struct** — the `agent_input!` definition with field explanations
> - **Agent code** — complete `agent_main` implementation (compilable, `no_std`)
> - **Deploy command** — the `tal` commands to build and deploy
> - **Adapters needed** — which on-chain adapters this strategy targets
>
> The 3 recipes:
>
> 1. **Auto-Compound Aave** — Deposits vault balance into Aave V3 via the AaveV3Adapter. Input includes the pool address, asset address, and amount. Uses `erc20::approve` + `CallBuilder` with Aave's `supply(address,uint256,address,uint16)` selector. Read the actual selector from AaveV3Adapter.sol.
>
> 2. **Lido Staking** — Stakes ETH via the LidoAdapter. Input includes the Lido contract address and amount. Simple single-action agent: wrap ETH into stETH. Read the actual Lido interface from LidoAdapter.sol.
>
> 3. **Pendle Yield Tokenization** — Splits yield-bearing assets into principal (PT) and yield (YT) tokens via PendleAdapter. Input includes the market address, token address, and amount. Read the actual Pendle interface from PendleAdapter.sol.
>
> **Writing rules:**
> - Every code block must be complete and compilable — include `#![no_std]`, `extern crate alloc`, imports, the full function
> - Use real function selectors from the adapter contracts — read them, don't guess
> - Each recipe should be independent — a developer can copy any single recipe without reading the others
> - Keep each recipe under 150 lines total (prose + code)
> - Use `:::tip` for optimization hints and `:::warning` for gotchas
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/yield-cookbook.md`
> - Contains 3 complete, compilable agent recipes
> - All function selectors are real (sourced from adapter contracts)
> - Each recipe has: strategy description, input struct, agent code, deploy command, adapter reference
> - Total file is under 500 lines

---

### Deliverable 4.2: Trading Strategy Cookbook

**File(s):** `docs/docs/getting-started/trading-cookbook.md`
**Depends on:** 3.1 (cross-links to tutorial)

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a trading strategy cookbook: 2 recipes for Hyperliquid perpetual trading agents.
>
> **Context:** Read these files first:
> - `crates/agents/perp-trader/agent/src/lib.rs` (the production perp-trader agent — 1661 lines, full SMA/RSI/funding strategy)
> - `crates/agents/perp-trader/README.md` (perp-trader overview and deployment)
> - `crates/agents/perp-trader/PERP_TRADER_GUIDE.md` (detailed guide)
> - `crates/agents/perp-trader/hyperliquid-bottlenecks.md` (platform gotchas)
> - `contracts/src/adapters/HyperliquidAdapter.sol` (Hyperliquid adapter interface)
> - `docs/docs/onchain/hyperliquid-integration.md` (Hyperliquid integration docs)
> - `docs/docs/sdk/call-builder.md` (CallBuilder reference)
> - `crates/sdk/kernel-sdk/src/actions.rs` (CallBuilder implementation)
> - `crates/sdk/kernel-sdk/src/math.rs` (math helpers — checked arithmetic, BPS)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/trading-cookbook.md` with frontmatter:
>
> ```yaml
> ---
> title: "Cookbook: Trading Strategies"
> sidebar_position: 10
> description: Two Hyperliquid perpetual trading agent recipes
> ---
> ```
>
> Write 2 recipes. Each recipe should have the same structure as the yield cookbook: strategy name, how it works, input struct, agent code, deploy command, adapters needed.
>
> The 2 recipes:
>
> 1. **SMA Crossover** — Opens a long position when a short SMA crosses above a long SMA, closes when it crosses below. Input includes: mark price, short SMA value, long SMA value, current position size, vault equity. The agent outputs a `CallBuilder` action targeting the HyperliquidAdapter's `openPosition` or `closePosition` function. Read the actual function signatures from `HyperliquidAdapter.sol`. Include position sizing based on vault equity and a configurable leverage parameter (from input).
>
> 2. **Funding Rate Arbitrage** — Goes long when funding rate is negative (shorts are paying longs) above a threshold, goes short when funding rate is positive above a threshold. Input includes: current funding rate (as i32 in bps), position size, vault equity, threshold. Simple two-branch logic.
>
> **Writing rules:**
> - Every code block must be complete and compilable
> - Use real function selectors from HyperliquidAdapter.sol
> - Include a `:::warning Hyperliquid Gotchas` section at the end covering: CoreWriter async settlement, HYPE gas requirement, leverage bootstrap via seed trade, and oracle price bands. Consolidate from the perp-trader README and bottlenecks doc — this is the first time these gotchas appear in the official docs.
> - Use `kernel_sdk::math` helpers (e.g., `apply_bps`, `checked_mul_u64`) — read the actual API from `math.rs`
> - Each recipe should be independent
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/trading-cookbook.md`
> - Contains 2 complete, compilable agent recipes
> - All function selectors are real (sourced from HyperliquidAdapter.sol)
> - Contains a "Hyperliquid Gotchas" section covering the 4 key failure modes
> - Uses `kernel_sdk::math` helpers accurately
> - Total file is under 500 lines

---

### Deliverable 4.3: Troubleshooting Guide

**File(s):** `docs/docs/getting-started/troubleshooting.md`
**Depends on:** None

**Prompt:**

> You are working in the Tokamak-AI-Layer repository. Your task is to write a troubleshooting guide that consolidates all known failure modes and their fixes into one page.
>
> **Context:** Read these files first — they contain the scattered troubleshooting knowledge:
> - `CLAUDE.md` (sections: "HyperEVM Deployment Constraints", "ELF Build", "Forge Deployment on HyperEVM — Common Issues", "CoreWriter Async Settlement", "CoreWriter Amount Scaling", "CoreWriter HYPE Gas Requirement", "HyperCore Price Band", "CoreWriter Leverage Requirement", "Bot Silent Rejection Handling")
> - `crates/agents/perp-trader/README.md` (Hyperliquid-specific issues)
> - `crates/agents/perp-trader/PERP_TRADER_GUIDE.md` (deployment and operational issues)
> - `crates/agents/perp-trader/hyperliquid-bottlenecks.md` (8 documented bottlenecks)
> - `docs/docs/getting-started/faq.md` (existing FAQ)
> - `docs/docs/onchain/security-considerations.md` (on-chain failure modes)
>
> **What to write:** A Docusaurus docs page at `docs/docs/getting-started/troubleshooting.md` with frontmatter:
>
> ```yaml
> ---
> title: Troubleshooting
> sidebar_position: 11
> description: Common issues and how to fix them
> ---
> ```
>
> Structure as a flat list of problems, grouped by category. For each problem:
>
> ```markdown
> ### Problem: [short description]
> **Symptom:** What the developer sees (error message, silent failure, unexpected behavior)
> **Cause:** Why it happens (1-2 sentences)
> **Fix:** What to do (specific commands or code changes)
> ```
>
> Categories and problems to cover:
>
> **Build Issues:**
> 1. "Malformed ProgramBinary" during proof generation — using raw ELF instead of .bin file
> 2. `tal build --elf` fails with memory error — insufficient RAM for RISC Zero compilation
> 3. Forge deployment exceeds block gas limit — HyperEVM 3M limit, need `FOUNDRY_PROFILE=small`
> 4. `forge create` argument order errors — `--constructor-args` consumes all subsequent args
>
> **Deployment Issues:**
> 5. `tal deploy` succeeds but vault has no funds — need to deposit after deployment
> 6. Agent registration fails — salt collision (agentId already exists)
> 7. Vault deploy gas estimation fails on HyperEVM — must use `--legacy` flag (no EIP-1559)
>
> **Execution Issues (General):**
> 8. Proof verification fails on-chain — IMAGE_ID mismatch between agent and vault
> 9. Execution reverts with "nonce" error — nonce not monotonically increasing, or MAX_NONCE_GAP exceeded
> 10. Oracle signature invalid — ORACLE_MAX_AGE too short (must be >= proof generation time, ~900s)
>
> **Execution Issues (Hyperliquid-specific):**
> 11. Orders silently rejected — no HYPE on HyperCore (need to bridge HYPE to CoreWriter)
> 12. Orders silently rejected — price outside oracle band (5-10% of mark price)
> 13. Orders silently rejected — leverage=0 on first trade (need REST API seed trade)
> 14. Orders silently rejected — CoreWriter async settlement (deposit + order in same tx)
> 15. Fund recovery fails — spotSend amount scaling (1e8 units, not 1e6)
> 16. HYPE bridge not taking effect — async settlement, must wait 10s after funding
>
> **Testing Issues:**
> 17. `tal test --local` passes but proof generation fails — non-deterministic code (HashMap, floats, time)
> 18. Agent panics inside zkVM — unbounded allocation, use `Vec::with_capacity()` instead of `vec![]`
>
> For each problem, source the fix from the context files above. Use the exact error messages and commands from those files. Do not fabricate error messages — if you can't find the exact text, describe the symptom generically.
>
> **Acceptance criteria:**
> - File exists at `docs/docs/getting-started/troubleshooting.md`
> - Contains all 18 problems listed above
> - Each problem has Symptom, Cause, and Fix sections
> - Fixes include specific commands (not just "check your config")
> - Hyperliquid section consolidates information from 4 separate source files into one place
> - Total file is under 600 lines

---

## Execution Plan

### Phase 1 (parallel — no dependencies)

| Deliverable | Prompt | Estimated Time |
|-------------|--------|----------------|
| 1.1 Developer Landing Page | Paste prompt 1.1 | 15-20 min |
| 2.1 Video Script | Paste prompt 2.1 | 10-15 min |
| 2.2 Annotated Walkthrough | Paste prompt 2.2 | 15-20 min |
| 4.3 Troubleshooting Guide | Paste prompt 4.3 | 15-20 min |

All 4 can run in parallel Claude Code sessions.

### Phase 2 (depends on Phase 1)

| Deliverable | Prompt | Estimated Time |
|-------------|--------|----------------|
| 3.1 Guided Tutorial | Paste prompt 3.1 | 20-30 min |
| 3.2 Modify & Redeploy | Paste prompt 3.2 | 10-15 min |

Can run in parallel with each other. Depend on 2.x for cross-links (but work without them — links will just point to not-yet-created pages).

### Phase 3 (depends on Phase 2)

| Deliverable | Prompt | Estimated Time |
|-------------|--------|----------------|
| 4.1 Yield Cookbook | Paste prompt 4.1 | 15-20 min |
| 4.2 Trading Cookbook | Paste prompt 4.2 | 15-20 min |

Can run in parallel with each other.

### Post-execution

After all 8 deliverables are created:
1. Update `docs/sidebars.ts` to include the new pages in the navigation
2. Update `docs/docs/getting-started.md` to link to the new pages
3. Update `frontend/src/components/layout/Navbar.tsx` to add a "Developers" link
4. Run `cd docs && npm run build` to verify all pages compile
5. Run `cd frontend && npm run build` to verify the landing page compiles

---

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| 1 | Internal strategy doc | Developer-facing, or both | Team needs execution plan, not more docs for developers |
| 2 | Claude Code prompts | Developer-facing copy, or both | Team executes by pasting into sessions |
| 3 | All 4 funnel stages | 1-3 only, or 5 with retention | Full coverage without scope creep |
| 4 | Changes within this repo only | New repos, external services | Simple execution, no infra coordination |
| 5 | Technical-first tone | Outcome-first, hybrid | Targeting Rust/Solidity developers |
| 6 | New tutorial alongside quickstart | Modify in-place, replace | Quickstart works; tutorial adds depth |
| 7 | Yield + trading cookbook recipes | Yield only, all 3 verticals | Matches deployed adapters |
| 8 | Concise doc, one prompt = one deliverable | Granular sub-steps, comprehensive | Prompts stand alone |
| 9 | /developers in frontend (Next.js) | Docusaurus docs page | Richer interactivity |

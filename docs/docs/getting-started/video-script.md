---
title: Demo Video Script (Internal)
sidebar_class_name: hidden
sidebar_position: 99
---

# 5-Minute Demo Video — Recording Script

Internal reference for recording the Tokagent quickstart demo. Not published to the docs navigation.

**Target length:** 4:30–5:00
**Audience:** Rust/Solidity developers evaluating Tokagent
**Tone:** Technical, concise, no hype — show the tool, let the code speak

---

## Pre-recording Setup

**[NOTE]** Before hitting record:
- Clean terminal (clear history, set font size to 16pt+, dark background)
- Pre-install `tal` CLI and Rust so installs are instant
- Pre-fund a testnet wallet with HYPE on HyperEVM testnet (chain 998)
- Have `.env` file ready with `PRIVATE_KEY` filled in — copy it in during the deploy step
- Pre-build the ELF binary so `tal build --elf` output can be shown without waiting 10 minutes (or plan to cut/fast-forward)
- Set terminal width to ~100 columns for readable output
- Use a directory like `~/demo/` so the path is short

---

## Section 1: Opening (0:00–0:25)

**[SHOW]** Terminal, blank screen.

**[SAY]**
"Tokagent is a framework for building verifiable DeFi agents. You write strategy logic in Rust, the Execution Kernel runs it inside a zero-knowledge virtual machine, and the on-chain verifier checks the proof before your vault executes any actions. In the next five minutes, we'll go from zero to a deployed agent on testnet."

**[NOTE]** Keep this tight — 15 seconds max. No slides, no browser, just the terminal.

---

## Section 2: Install (0:25–0:50)

**[SHOW]** Terminal.

**[DO]**
```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
```

**[SAY]**
"First, install the `tal` CLI. This is a one-line install — it downloads the prebuilt binary. If you already have Rust, you can also use `cargo install tal-cli`."

**[DO]**
```bash
tal doctor
```

**[SAY]**
"Run `tal doctor` to check your environment. It verifies Rust, the RISC Zero toolchain, and Foundry. If anything is missing, `tal doctor --install` fixes it automatically."

**[SHOW]** The `tal doctor` output — green checkmarks for each component.

**[NOTE]** If you pre-installed everything, `tal doctor` will show all green instantly. That's fine — the point is to show the command exists.

---

## Section 3: Scaffold (0:50–1:40)

**[DO]**
```bash
tal init my-agent --template yield
```

**[SAY]**
"Create a new agent project from the yield template. This generates a complete project — agent logic, test fixtures, build configuration, and deployment config. No repository clone needed."

**[DO]**
```bash
cd my-agent && ls -la
```

**[SHOW]** The directory listing: `agent/`, `risc0-methods/`, `dist/`, `.env.example`.

**[SAY]**
"The project has three parts: `agent/` contains your Rust strategy logic, `risc0-methods/` compiles it to a zkVM binary, and `dist/` holds the agent manifest."

**[DO]** Open `agent/src/lib.rs` in an editor (or use `cat agent/src/lib.rs | head -60`).

**[SAY]**
"Here's the agent code. The core is a single function — `agent_main`. It takes an `AgentContext` and raw input bytes, and returns a list of on-chain actions."

**[SHOW]** Highlight three areas in the code:
1. The `agent_input!` macro (explain: "This macro declares the input format — vault address, yield source, amount. It auto-generates the parser.")
2. The `CallBuilder` calls (explain: "CallBuilder constructs ABI-encoded contract calls. Here we're building a deposit and a withdraw action targeting a yield source.")
3. The `agent_entrypoint!` macro at the bottom (explain: "This wires the agent into the Execution Kernel.")

**[NOTE]** Spend 20–30 seconds on the code. The audience is developers — they'll read it. Don't rush past, but don't over-explain. Let them see the structure.

---

## Section 4: Test (1:40–2:10)

**[DO]**
```bash
tal test --local
```

**[SAY]**
"Test locally. This compiles your agent natively — no zkVM, no proof generation. It runs the unit tests from `lib.rs` and gives you results in two to three seconds."

**[SHOW]** The test output — passing tests with names like `test_agent_main_produces_two_actions`, `test_invalid_input_returns_empty`.

**[SAY]**
"Tests verify that inputs parse correctly and that the agent produces the expected actions. This is your fast iteration loop during development."

**[NOTE]** The output should show 5–6 passing tests in under 3 seconds. This is the best part of the DX — emphasize the speed.

---

## Section 5: Build (2:10–2:50)

**[DO]**
```bash
tal build --elf
```

**[SAY]**
"Now build the zkVM binary. This compiles your agent to a RISC-V target that runs inside the RISC Zero virtual machine. The output is an ELF binary with two key identifiers."

**[NOTE]** The build takes 8–10 minutes on first run. Either:
- Option A: Fast-forward with a cut and show the final output
- Option B: Pre-build and show the cached "no changes, skipping compilation" output
- Option C: Show the command, say "this takes about 8 minutes on first build — let's skip ahead", then show the output

**[SHOW]** The build output, highlighting:
1. `IMAGE_ID: 0xbb1183...` — "This is the IMAGE_ID — a cryptographic fingerprint of the zkVM binary. It gets registered on-chain so the verifier knows exactly which program produced the proof."
2. `AGENT_CODE_HASH: 0xd6d848...` — "And this is the agent code hash — a SHA-256 of your source code. The kernel verifies it at runtime to bind the proof to your specific implementation."

**[SAY]**
"During development, you don't need to build the ELF on every change. Use `tal test --local` for fast iteration and only build when you're ready to deploy."

---

## Section 6: Deploy (2:50–3:50)

**[DO]**
```bash
cp .env.example .env
```

**[SAY]**
"Set up your environment. Copy the example config and add your private key."

**[DO]** Open `.env` briefly, show the `PRIVATE_KEY=` line, paste a key.

**[NOTE]** Use a dedicated testnet wallet. Never show a real private key. If you're nervous about this, pre-fill the `.env` before recording and just show the file briefly.

**[DO]**
```bash
tal deploy --testnet
```

**[SHOW]** The deployment output. Highlight:
1. "Registering agent on AgentRegistry..." — `agentId: 0x12c3...`
2. "Deploying vault via VaultFactory..." — `vault: 0xae55...`

**[SAY]**
"Deploy does two things. First, it registers your agent on the AgentRegistry — this stores your IMAGE_ID on-chain. Then it deploys a KernelVault via the VaultFactory. The vault pins your IMAGE_ID at creation — it's immutable. This vault will only accept proofs generated by this exact agent binary."

**[SAY]**
"Notice the vault address in the output. That's your ERC4626-compatible vault. Users can deposit into it, and your agent's verified actions will manage the funds."

**[NOTE]** Deployment takes about 30 seconds for two transactions. If it's slow, you can pre-deploy and show the output.

---

## Section 7: Monitor (3:50–4:30)

**[DO]**
```bash
tal monitor --vault 0xae55...your_vault_address --chain 998
```

**[SHOW]** The monitoring dashboard output.

**[SAY]**
"Finally, monitor your vault. The monitor shows the vault's total assets, total shares, execution nonce, and proof history. It polls every 30 seconds by default."

**[SHOW]** Point out the key fields:
- Total Assets / Total Shares
- Execution Nonce (starts at 0)
- Agent ID and IMAGE_ID

**[SAY]**
"Right now the vault is empty — nobody has deposited yet. But the infrastructure is live. When the agent executes, the nonce increments, and the monitor shows each execution's proof status."

---

## Section 8: Closing (4:30–5:00)

**[SHOW]** Terminal.

**[DO]**
```bash
tal init --help
```

**[SHOW]** The template list: `yield`, `perp-trader`, `polymarket-bot`.

**[SAY]**
"That's it — from zero to a deployed, verifiable agent in under five minutes. We used the yield template, but there are also templates for Hyperliquid perpetual trading and Polymarket prediction markets. Each comes with a full host orchestrator, strategy logic, and deployment config."

**[SAY]**
"Head to docs.tokagent.network for the full tutorial — including how to write custom agents, test with fixtures, and deploy to mainnet."

**[NOTE]** End on the docs URL. Don't add a call-to-action beyond that — the audience is technical, they'll explore on their own.

---

## Post-recording Checklist

- [ ] Total runtime is under 5:00
- [ ] All commands shown are accurate (match current quickstart.md)
- [ ] No real private keys or mainnet addresses visible
- [ ] Terminal text is readable at 1080p (font size 16pt+)
- [ ] Code in the editor is syntax-highlighted
- [ ] Fast-forward/cut during the `tal build --elf` wait is smooth
- [ ] Output hashes (IMAGE_ID, AGENT_CODE_HASH) are visible and legible
- [ ] Vault address in the deploy output matches the monitor command

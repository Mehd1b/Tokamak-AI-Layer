# Execution Kernel - Competitive Landscape Analysis

> Last updated: February 23, 2026

## Product Definition

The **Execution Kernel (EK)** is a RISC Zero zkVM-based protocol for verifiable, deterministic AI agent execution with on-chain vault settlement. It proves that agent computations were performed correctly via zero-knowledge proofs, then automatically executes resulting actions through smart contract vaults — no intermediaries, no custody transfer.

**Core moat**: No competitor combines (a) full-program deterministic execution in a zkVM, (b) agent-specific abstractions (Agent trait, constraint system), (c) vault-based on-chain settlement, and (d) agent registry/identity in a single protocol.

---

## Porter's Five Forces

| Force | Intensity | Impact | Key Factors |
|-------|-----------|--------|-------------|
| **New Entrants** | 3/5 | Medium | High technical barrier (zkVM expertise), but open-source tooling lowers it. New L1/L2 chains with AI focus emerging monthly. |
| **Supplier Power** | 4/5 | High | RISC Zero is the sole proving backend. SP1/Succinct is the only credible alternative. Hardware requirements (GPU for proving) concentrate power. |
| **Buyer Power** | 2/5 | Low | DeFi protocols desperate for verifiable automation. Few alternatives offer mathematical guarantees. High switching cost once vaults deployed. |
| **Substitutes** | 3/5 | Medium | TEE-based verification (Phala, Marlin) is faster/cheaper. Optimistic verification (ORA) is 1,000,000x cheaper. Economic staking (OLAS) is simplest. |
| **Competitive Rivalry** | 2/5 | Low | No direct competitor does exactly what EK does. Giza is closest but uses different tech stack (Cairo/StarkNet). Market is early and fragmented. |

**Overall**: Favorable industry dynamics. The main risk is supplier concentration (RISC Zero dependency) and substitute approaches (TEE, optimistic) that sacrifice security for speed/cost.

---

## Competitive Landscape by Category

### Category 1: zkVM Infrastructure (Not Competitors — Dependencies)

| Project | Relationship | Proof System | Funding | Notes |
|---------|-------------|-------------|---------|-------|
| **RISC Zero / Boundless** | EK's proving backend | zk-STARKs/Groth16 | $40M Series A | ZKC token. Boundless mainnet Sept 2025. Terminated hosted proving. |
| **SP1 / Succinct** | Alternative backend | zk-STARKs + GPU | $55M | PROVE token. Claims fastest zkVM. OP/Arbitrum/Polygon integrations. |
| **zkWASM / Delphinus** | Tangential | ZK over WASM | ~$7M mcap | Different VM target. Smaller ecosystem. Early stage. |

**Takeaway**: These are infrastructure, not competitors. EK builds on RISC Zero; could port to SP1 for redundancy.

---

### Category 2: Verifiable AI / zkML (Inference Verification)

| Project | What They Prove | Approach | Funding | Traction | Gap vs EK |
|---------|----------------|----------|---------|----------|-----------|
| **EZKL** | ML model outputs | Halo2 circuits (ONNX-to-ZK) | $3.8M | Industry benchmark | Inference only, no agent orchestration |
| **Modulus / Remainder** | ML model outputs | Custom GKR prover | $6.3M seed | Quiet since 2024 | Closed-source, no agent framework |
| **Lagrange / DeepProve** | Full LLM inference | Custom ZK + GPU | $16.5M | 11M+ proofs, 3M inferences | Inference only, no execution framework |
| **Inference Labs** | ML inference | Multi-framework zkML | $6.3M | Testnet | Built on Bittensor, no agent execution |
| **Polyhedra / Expander** | AI workloads | Custom ZK + GPU | $1B valuation | zkBridge production | Infrastructure, not application |

**Takeaway**: zkML projects verify individual model inferences but **none provide agent orchestration, multi-step execution verification, or on-chain settlement**. EK proves the entire agent execution pipeline, not just the ML part. These are potential integration partners (e.g., Lagrange/DeepProve for inference verification inside EK agents).

---

### Category 3: Verifiable Agent Execution (Direct Competitors)

| Project | Verification | DeFi Focus | Token | Traction | Threat |
|---------|-------------|-----------|-------|----------|--------|
| **Giza** | zkSTARKs (Cairo) | Yes (ARMA agent) | GIZA (May 2025) | $32M volume, $20M AUA | **HIGH** |
| **Ritual Network** | Multi (ZK/TEE/opML) | Partial | No token yet | 8K+ Infernet nodes | **HIGH** |
| **Talus Network** | Move VM + Lagrange | Partial | US token | 35K testnet users, mainnet Dec 2025 | **MEDIUM** |

#### Giza Protocol — Closest Competitor

**What they do**: Autonomous DeFi agents (ARMA) with verifiable execution via Cairo/zkSTARKs. $32M operational volume, $20M Assets Under Agents, 15% USDC yields. Institutional adoption (Re7 Capital $500K deployment).

**Strengths vs EK**:
- Already live with real volume ($32M)
- Token launched (GIZA)
- Institutional adoption signal
- DeFi-specific focus

**Weaknesses vs EK**:
- StarkNet-specific (Cairo), not general-purpose zkVM
- Agent execution is not fully deterministic in the RISC Zero sense
- No per-agent constraint system enforced inside proof
- No vault-based settlement with immutable imageId pinning
- No agent code hash binding (agent substitution protection)
- Limited to their agent framework, not composable

#### Ritual Network — Broadest Platform

**What they do**: Purpose-built L1 for AI with EVM++ Sidecars and Infernet oracle network. Multi-modal verification (ZK, TEE, optimistic per use case).

**Strengths vs EK**:
- Broader scope (full L1 chain)
- Multi-verification flexibility
- Strong funding ($25M Series A)
- 8,000+ Infernet nodes

**Weaknesses vs EK**:
- Not specifically focused on deterministic agent execution
- Chain not fully live yet
- Verification is per-inference, not per-agent-execution
- No vault/constraint system
- Ambitious scope creates execution risk

---

### Category 4: AI Agent Platforms (Economic Verification Only)

| Project | Verification | Token | Market Cap | Traction | Threat |
|---------|-------------|-------|-----------|----------|--------|
| **Autonolas / OLAS** | Economic (staking/slashing) | OLAS | ~$10M | GnosisDAO governance agents | LOW |
| **ASI Alliance** (Fetch/SingularityNET/Ocean) | Reputation | ASI | ~$2B+ | ASI:Cloud live | LOW |
| **Bittensor** | Yuma Consensus | TAO | Top-tier AI crypto | 128 subnets | LOW |
| **Virtuals Protocol** | None | VIRTUAL | ~$400M-$900M | Consumer agents (Luna, AIXBT) | NONE |
| **ElizaOS** | None (open-source) | AI16Z | $2B+ peak | $25M+ AUM DAO | NONE |

**Takeaway**: None of these provide cryptographic execution verification. They rely on economic incentives, reputation, or no verification at all. EK's mathematical guarantees are strictly stronger for high-value DeFi operations. These serve different market segments (social agents, AI marketplaces, governance).

---

### Category 5: DeFi Automation (Trigger-Based, Not Agent-Based)

| Project | What They Do | Verification | Token | Threat |
|---------|-------------|-------------|-------|--------|
| **Chainlink Automation** | Condition-based triggers | Oracle network consensus | LINK | LOW |
| **Gelato Network** | Smart contract automation | Executor network | GEL | LOW |

**Takeaway**: These automate "if X then Y" triggers, not complex agent decision-making. They complement rather than compete with EK. Could serve as trigger/relay layers for EK-verified actions.

---

### Category 6: TEE-Based Verifiable Compute (Alternative Trust Model)

| Project | TEE Platform | Token | Traction | Threat |
|---------|-------------|-------|----------|--------|
| **Phala Network** | Intel SGX/TDX, NVIDIA H100/H200 | PHA | 1K+ teams, SOC 2/HIPAA | **MEDIUM** |
| **Marlin / Oyster** | AWS Nitro Enclaves | POND | Sui integration | LOW |
| **Oasis / ROFL** | Intel TDX | ROSE | ROFL mainnet July 2025 | LOW |

**Takeaway**: TEE approaches are faster (~7% overhead vs 30-60s proof gen) and cheaper, but depend on hardware manufacturer trust (Intel/NVIDIA). Hardware vulnerabilities (Spectre, Meltdown) can compromise TEEs. EK's ZK approach is mathematically trustless — stronger for high-value DeFi where you need guarantees, not just hardware attestation.

---

## Positioning Map

```
                    Mathematical Verification (ZK)
                              |
                              |
                     Lagrange |  * Execution Kernel
                  EZKL .      |     (zkVM + Vault Settlement
                              |      + Agent Framework)
               Modulus .      |
                              |  . Giza
                              |     (Cairo zkSTARKs + DeFi)
                              |
  Inference -------------------+------------------- Full Agent
  Only                        |                     Execution
                              |
               ORA .          |  . Ritual
              (opML)          |     (Multi-modal)
                              |
          Phala .             |         . Talus
          Marlin .   Oasis .  |
                              |
                              |  . OLAS    . ElizaOS
                              |  . Bittensor
                              |
                    Economic / No Verification
```

**White space EK occupies**: Upper-right quadrant — mathematical (ZK) verification + full agent execution. No other project sits here.

---

## Blue Ocean Strategy Canvas

### Four Actions Framework

| Action | Details |
|--------|---------|
| **Eliminate** | Trusted intermediaries (oracles, validators, committee consensus). Hardware trust assumptions (TEE). Challenge periods (optimistic verification). |
| **Reduce** | Agent development complexity (macros eliminate 30-100 lines of boilerplate). Verification cost (amortized across vault lifecycle). |
| **Raise** | Execution determinism (guaranteed reproducibility). Safety guarantees (unskippable constraints inside proof). Audit trail quality (full cryptographic proof chain). |
| **Create** | Agent code hash binding (prevents substitution attacks). Per-vault immutable imageId pinning. Canonical action ordering inside guest. Constraint enforcement inside proof (not bypassable). Vault-based autonomous settlement. |

---

## EK's Sustainable Competitive Advantages

| Advantage | Durability | Can competitors copy in <2 years? |
|-----------|-----------|----------------------------------|
| **Full zkVM agent execution** (not just inference) | HIGH | Hard — requires deep RISC Zero expertise + agent abstraction design |
| **Unskippable constraint system** | HIGH | Medium — concept is replicable but integration with zkVM is complex |
| **Agent code hash binding** | HIGH | Novel — no competitor has this; prevents agent substitution attacks |
| **Vault-based settlement with imageId pinning** | MEDIUM | Replicable but requires vault protocol redesign |
| **Hyperliquid perp integration** | MEDIUM | First mover but others can integrate |
| **Developer SDK (macros, agent_input!, etc.)** | LOW | Can be replicated |

---

## Strategic Recommendations

### 1. Exploit the Giza Gap
Giza is the closest competitor but is locked into StarkNet/Cairo. EK's RISC Zero approach is **chain-agnostic** and supports any Rust code. Position as "Giza, but for any chain and any agent logic."

### 2. Reduce RISC Zero Dependency
SP1/Succinct is a credible alternative zkVM. Consider abstracting the proving backend to support both RISC Zero and SP1, reducing supplier power from 4/5 to 2/5.

### 3. Partner with zkML Projects
Lagrange (DeepProve), EZKL, and Inference Labs prove ML inference. EK proves full agent execution. Together, they create **end-to-end verifiable AI pipelines**. Position EK as the orchestration layer that calls verified inference.

### 4. Target the Verification-Speed Tradeoff
TEE is fast but less secure. Optimistic (ORA) is cheap but has challenge periods. ZK is most secure but slowest. Consider a **tiered verification model**: fast TEE for low-value actions, full ZK for high-value settlement (mirrors TAL's existing trust tiers).

### 5. Launch Before Ritual
Ritual Network is the biggest long-term threat (purpose-built L1 for AI). But they don't have a token or full chain yet. EK's focused, production-ready approach (working Hyperliquid integration, vault contracts deployed) can capture DeFi-specific market before Ritual's broader platform matures.

---

## Positioning Statement

> **For DeFi protocols and institutional allocators**
> who need trustless, automated strategy execution,
> the Execution Kernel is a **verifiable agent execution protocol**
> that mathematically proves every agent action was computed correctly before settling on-chain.
> Unlike Giza (StarkNet-locked), OLAS (economic-only), or Phala (hardware-dependent),
> our protocol provides **chain-agnostic, mathematically trustless execution with unskippable safety constraints** enforced inside zero-knowledge proofs.

---

## Competitive Summary Matrix

| Feature | **EK** | Giza | Ritual | OLAS | Phala | ORA | Lagrange |
|---------|--------|------|--------|------|-------|-----|----------|
| **Verification** | ZK (RISC Zero) | zkSTARK (Cairo) | Multi (ZK/TEE/opML) | Economic | TEE | opML | zkML |
| **Agent Execution** | Full program | DeFi strategies | AI inference | Multi-service | Confidential compute | Model inference | Model inference |
| **Determinism** | Guaranteed | Partial | Varies | None | Hardware-dependent | Probabilistic | N/A |
| **On-chain Settlement** | Vault-based | Token-gated | Infernet oracle | Multi-chain | L2 settlement | Oracle-based | Cross-chain |
| **DeFi Focus** | Yes (vault + perps) | Yes (ARMA) | Partial | Yes | Limited | No | No |
| **Agent Registry** | Yes | No | No | Yes (NFT) | No | No | No |
| **Constraint System** | Inside proof | No | No | No | No | No | No |
| **Code Hash Binding** | Yes | No | No | No | No | No | No |
| **Token** | No | GIZA | No | OLAS | PHA | No | No |
| **Mainnet** | Sepolia | Yes | Partial | Yes | Yes | Yes | Production |

---

*Sources: RISC Zero, Succinct, Giza, Ritual Network, Autonolas, Phala, ORA Protocol, Lagrange Labs, EZKL, Inference Labs, Polyhedra, Talus Network, Allora Network, Nillion, Chainlink, Gelato, Bittensor, Virtuals Protocol, ElizaOS, ASI Alliance, Axiom, Marlin, Oasis Network. Research current as of February 2026.*

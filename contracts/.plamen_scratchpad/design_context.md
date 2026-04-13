# Design Context

**Generated**: 2026-04-13
**Source**: CLAUDE.md (root + contracts), docs/docs/architecture/, docs/docs/onchain/, source code analysis

---

## Protocol Purpose

Tokamak AI Layer (Tokagent) is a **verifiable autonomous agent execution framework** built on RISC Zero zkVM. The protocol enables:

1. **Autonomous agents** written in Rust that make financial decisions (trades, deposits, withdrawals)
2. **Cryptographic proof generation** inside a zkVM guest — every agent decision is proven correct before funds move
3. **On-chain vault contracts** (Solidity) that verify proofs and atomically execute proven actions
4. **Optimistic execution** mode where actions execute immediately with WSTON bond collateral, and ZK proof is deferred within a challenge window
5. **Multi-protocol DeFi integration** via adapter contracts (Aave V3, Lido, Morpho Blue, Pendle, Uniswap V4, Polymarket, Hyperliquid)
6. **Vault-of-vaults** (MetaVault) for diversified exposure to multiple agent strategies

The core value proposition: **agents never hold funds** — they produce instructions inside a zkVM, and the vault verifies and executes only proven-correct instructions.

---

## Key Invariants

### INV-1: Binary Format Alignment
Rust `kernel-core` codec and Solidity `KernelOutputParser` MUST encode/decode identically. All integers are little-endian. `KernelJournalV1` is exactly 209 bytes. Action layout: `action_type` (u32 LE) + `target` (bytes32) + `payload` (u32 LE length + data).

### INV-2: Agent Code Hash Binding
`build.rs` computes `AGENT_CODE_HASH = SHA256(src/lib.rs || 0x00 || Cargo.toml)`. This is verified inside the zkVM guest to bind proofs to specific agent implementations. Any change to agent source invalidates the proof.

### INV-3: Vault Immutability
`trustedImageId` is pinned at vault creation via `VaultFactory.deployVault()`. Registry updates do NOT affect existing vaults. Once deployed, a vault's imageId is permanent — this is by design.

### INV-4: Nonce Monotonicity
`executionNonce` must be strictly greater than `lastExecutionNonce` AND within `MAX_NONCE_GAP = 10`. Each nonce can only be used once per vault (replay protection).

### INV-5: Constraints Are Unskippable
Even on agent failure, constraints are enforced inside the zkVM guest. There is no code path that bypasses constraint checking — the kernel hardcodes the constraint enforcement flow.

### INV-6: Action Commitment Integrity
`sha256(agentOutputBytes) == journal.actionCommitment` is verified on-chain. An attacker cannot substitute different actions than what the agent actually produced inside the zkVM.

### INV-7: Share/Asset Ratio Consistency
`totalShares` MUST equal the sum of all individual `shares[account]` balances at all times. The virtual offset (`DECIMALS_OFFSET = 1e3`) is applied consistently in both deposit and withdrawal calculations.

### INV-8: Role Separation (Oracle vs Bond Signer)
When optimistic execution is enabled: `bondSigner != address(0)` AND `bondSigner != oracleSigner`. This invariant is enforced at four independent sites: `setBondSigner`, `setOracleSigner`, `setOptimisticEnabled`, and `_verifyOptimisticOracleAndBond`.

### INV-9: Bond Status Lifecycle
Bond status transitions are unidirectional: `Empty -> Locked -> {Released | Slashed}`. A bond cannot go from Released/Slashed back to Locked. `totalLockedGlobal` must equal the sum of all Locked bond amounts.

### INV-10: Pending Execution Settlement Guard
`_settle()` in OptimisticKernelVault reverts while `_pendingCount > 0`. This prevents the settle-race attack where an owner could destroy the slash calculation basis for pending executions.

### INV-11: Fee High-Water Mark Monotonicity (C-05 Fix)
`highWaterMark` is anchored ONCE (when `highWaterMark == 0` and performance fee is first enabled) and can only advance UPWARD via `_collectPerformanceFee`. It CANNOT be reset downward by any owner action including `setFees`.

### INV-12: MetaVault Weight Sum
`sum(targetWeights[v] for all v in underlyingVaults)` must equal `BPS_DENOMINATOR (10000)` whenever vaults are configured.

### INV-13: Tracked Balance (Anti-Donation)
ETH vaults use `trackedETHBalance` (not `address(this).balance`) for PPS calculations. MetaVault uses `trackedIdle` (not `baseAsset.balanceOf(this)`) for NAV calculations. This prevents donation/selfdestruct inflation attacks.

---

## Operational Implications

### INV-1 Implication (Binary Format Alignment)
The system's accounting model treats the Rust and Solidity codebases as a SINGLE implementation split across two languages. Any encoding mismatch means the on-chain parser will extract garbage from the journal or agent output, leading to either reverts (safe failure) or misinterpreted actions (catastrophic). The 209-byte journal is the bridge between the trusted zkVM proof domain and the untrusted on-chain execution domain — its integrity IS the protocol's security.

### INV-2 Implication (Agent Code Hash Binding)
The system models agents as immutable code artifacts. The code hash binds a proof to a specific source file + Cargo.toml. This means agent upgrades require deploying a NEW vault (new imageId), not updating the existing one. Operators must manage a fleet of vaults across agent versions. An incorrectly registered imageId would let arbitrary code produce valid proofs for that vault.

### INV-3 Implication (Vault Immutability)
The protocol's trust model treats vaults as long-lived, configuration-frozen execution endpoints. Once depositors commit capital to a vault, they rely on the pinned imageId + trustedImageId to guarantee which agent logic can move their funds. This immutability is a FEATURE, not a limitation — it prevents the "rug via upgrade" attack vector. The trade-off: a vulnerable agent requires a vault migration (new vault + new imageId + user re-deposit), not an in-place fix.

### INV-4 Implication (Nonce Monotonicity)
The system models execution as a strictly ordered sequence with bounded skip tolerance. MAX_NONCE_GAP=10 means the system tolerates short-term operational failures (up to 10 lost/stuck proofs) without halting, but skipped nonces are PERMANENTLY lost — they can never be executed. This is a liveness-vs-ordering trade-off: wider gap = more resilient to transient failures, narrower gap = less exposure to nonce-squatting DoS.

### INV-5 Implication (Constraints Are Unskippable)
The constraint system is the protocol's INTERNAL risk management layer — it operates WITHIN the zkVM proof and cannot be bypassed even by the host/operator. This means the constraint parameters (max drawdown, cooldown, leverage) define the hard economic boundaries of what any agent can do, regardless of the agent's logic. The constraint set hash is committed to the journal, so depositors can verify which constraints were active for any given execution.

### INV-6 Implication (Action Commitment Integrity)
The action commitment creates a cryptographic binding between the zkVM proof and the on-chain execution. This means the vault can trustlessly execute ANY action the agent outputs — it does not need to understand or validate the action semantics because the proof guarantees the action was produced by the correct agent under the correct constraints. The vault's only job is parsing and dispatching. However, this also means the vault has NO target-level validation — it trusts the agent + constraints to output safe targets.

### INV-7 Implication (Share/Asset Ratio Consistency)
The share accounting model is ERC4626-like but NOT standard-compliant. The virtual offset prevents the classic inflation attack but also means the first depositor's shares are diluted by the offset. At very low asset amounts (close to the offset), PPS behaves non-linearly. Fee share minting (management + performance) increases `totalShares` without changing `totalAssets`, diluting all holders proportionally — this is the intended fee extraction mechanism.

### INV-8 Implication (Role Separation)
The system models oracle functions as two distinct trust domains. Role A (price oracle, `oracleSigner`) is SEMI_TRUSTED — a compromise allows stale/incorrect price attestation but damage is bounded by vault risk controls. Role B (bond attestation, `bondSigner`) is FULLY_TRUSTED — a compromise allows unbonded optimistic execution, equivalent to TVL drain with no economic penalty. The separation ensures a compromise of the less-secure price oracle does not escalate to the more-critical bond attestation authority.

### INV-9 Implication (Bond Status Lifecycle)
The bond system models a cross-chain escrow with three terminal states. The 90-day `BOND_EXPIRY` safety valve exists because the relayer (which finalizes bond status on L1) is a single point of failure — if the relayer goes offline permanently, operators need a way to recover locked capital. The `slashPending` flag (H-02 fix) blocks reclamation when a slash is in-flight, preventing the race where an operator drains a vault and then reclaims their bond before the slash lands on L1.

### INV-10 Implication (Pending Execution Settlement Guard)
The settlement system models strategy lifecycle as a state machine with a guard against premature transitions. The `_pendingCount > 0` check ensures that the PPS snapshot (which is the basis for all share pricing during a strategy) cannot be destroyed while optimistic executions are still being challenged. Without this guard, an owner could settle between optimistic actions, zeroing the snapshot and making subsequent slashing meaningless.

### INV-11 Implication (Fee HWM Monotonicity)
The fee system models performance fees as a one-way ratchet. The HWM can only go up, ensuring depositors are never charged performance fees for recovering from a loss to a previously-reached level. The C-05 fix prevents the cycle attack where an owner repeatedly re-anchors the HWM at drawdown PPS to extract fees on recovery. The trade-off: if perf fees are disabled and PPS rises during the zero-fee window, re-enabling collects on that rise since HWM is below current PPS.

### INV-12 Implication (MetaVault Weight Sum)
The MetaVault models portfolio allocation as a strict BPS partition. The weight sum constraint ensures that 100% of allocated capital is accounted for — there is no "orphan" allocation that disappears. The MAX_ALLOCATION_BPS (40%) per-vault cap limits concentration risk. Rebalancing moves assets to match target weights, with a 2% slippage cap to prevent sandwich attacks during rebalance.

### INV-13 Implication (Tracked Balance)
The tracking model creates an internal ledger that is immune to external balance manipulation. For ETH vaults, `selfdestruct` from another contract would increase `address(this).balance` but NOT `trackedETHBalance`, so the inflated balance is invisible to PPS calculations. For MetaVault, direct ERC20 transfers to the contract would increase `balanceOf` but NOT `trackedIdle`, so they do not inflate NAV. The `sweepDonations` function lets the owner reclaim the difference without affecting depositor accounting.

---

## Trust Assumption Table

| # | Actor | Trust Level | Assumption | Source |
|---|-------|-------------|------------|--------|
| 1 | RISC Zero Verifier | FULLY_TRUSTED | Groth16 verification is mathematically sound; if the verifier has bugs, invalid proofs could pass | docs/architecture/trust-model.md, KernelExecutionVerifier.sol |
| 2 | KernelExecutionVerifier (contract) | FULLY_TRUSTED | Correctly parses 209-byte journal, enforces version/status checks, and delegates proof verification | docs/onchain/security-considerations.md |
| 3 | Vault Owner (Agent Author) | FULLY_TRUSTED for vault operations | Can submit executions, configure fees (up to caps), set oracle/bond signers, pause/unpause vault, set access control, configure adapters. Cannot modify trustedImageId or verifier. | KernelVault.sol constructor, `onlyOwner` modifier pattern |
| 4 | Oracle Signer (Role A) | SEMI_TRUSTED | Signs price feed attestations. Compromise allows stale/incorrect price data but does NOT allow unbonded execution or fund drain without a valid ZK proof. Bounded by `maxOracleAge`. | KernelVault.sol C-02 comment block, OracleVerifier.sol |
| 5 | Bond Signer (Role B) | FULLY_TRUSTED | Signs L1 bond attestations for optimistic execution. Compromise allows forging bond existence, enabling zero-stake optimistic execution across all vaults sharing that signer. | OptimisticKernelVault.sol C-02 comment block |
| 6 | Trusted Relayer | FULLY_TRUSTED for cross-chain bond operations | Relays L1 bond releases/slashes. Can release or slash ANY bond. Single point of failure for cross-chain bond integrity. Protected by 1-hour rotation delay. | WSTONBondManager.sol, `onlyRelayer` modifier |
| 7 | Agent Author (Registry) | UNTRUSTED for existing vaults | Can register/update/deprecate agents in AgentRegistry. Cannot affect already-deployed vaults (imageId is immutable at deployment). | docs/architecture/trust-model.md, AgentRegistry.sol |
| 8 | Depositors | UNTRUSTED | Can deposit/withdraw within vault rules. Cannot execute agent actions or configure vault parameters. | KernelVault.sol deposit/withdraw functions |
| 9 | Factory Owner | FULLY_TRUSTED for factory operations | Can upgrade factory implementation (48h timelock), set code stores (48h timelock for swaps), set protocol treasury and fee split, register external vaults. | VaultFactory.sol |
| 10 | Verifier Owner | FULLY_TRUSTED for verifier operations | Can approve/revoke/propose/activate RISC Zero verifier rotation (48h timelock), pause/unpause verification (auto-expires after 7 days), upgrade implementation (48h timelock). | KernelExecutionVerifier.sol |
| 11 | Hyperliquid CoreWriter | EXTERNAL_SYSTEM | Non-atomic: orders settle asynchronously after EVM tx finalizes. Silent rejections for invalid orders (price band, insufficient margin, insufficient gas). No revert on failure. | TradingSubAccount.sol, CLAUDE.md CoreWriter documentation |
| 12 | Aave V3 Pool | EXTERNAL_SYSTEM | Adapter calls supply/borrow/repay/withdraw on external Aave V3 deployment. Protocol risk inherited. | AaveV3Adapter.sol |
| 13 | Lido stETH/wstETH | EXTERNAL_SYSTEM | Adapter interacts with Lido staking (submit, wrap, unwrap, withdrawal queue). Rebasing stETH introduces accounting complexity. | LidoAdapter.sol |
| 14 | Morpho Blue | EXTERNAL_SYSTEM | Adapter interacts with Morpho lending markets. Per-market oracle + IRM trust inherited. | MorphoAdapter.sol |
| 15 | Pendle Protocol | EXTERNAL_SYSTEM | Adapter for PT/YT yield tokenization. Market-specific risk inherited. | PendleAdapter.sol |
| 16 | Uniswap V4 | EXTERNAL_SYSTEM | Adapter for swaps and LP positions. AMM risk inherited. | UniswapV4Adapter.sol |
| 17 | External KYC Verifier | SEMI_TRUSTED (optional) | VaultAccessControl can optionally delegate KYC to an external `IKycVerifier` contract. If misconfigured/compromised, could block legitimate users or allow unauthorized deposits. | VaultAccessControl.sol |

---

## External Dependencies

| Dependency | Type | Chain | Address (if known) | Risk |
|-----------|------|-------|-------------------|------|
| RISC Zero Verifier (IRiscZeroVerifier) | ZK proof verification | HyperEVM (999) | Configured at init | CRITICAL — if compromised, all proofs are invalid/forgeable |
| WSTON (L1WrappedStakedTON) | ERC20 bond token | Ethereum (1) | `0x26C8F112769fb3A3A8de267CfFf60E9f317445e5` | HIGH — bond security depends on WSTON's ERC20 correctness |
| WSTONBondManager | Bond escrow | Ethereum (1) | `0x46a92cDC8530fd1C4D46891625a718458856Bc14` | HIGH — manages all cross-chain bond lifecycle |
| VaultFactory | Vault deployment | HyperEVM (999) | `0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB` | MEDIUM — deploys all vaults |
| OracleVerifier lib | Signature verification | HyperEVM (999) | `0x49D2F7419f15eD00700dE325FE9F945C26353c18` | HIGH — oracle sig verification for all vaults |
| KernelOutputParser lib | Action parsing | HyperEVM (999) | `0x23d9B155ed33a248085ae15Ed76b305D97F0D8fd` | HIGH — parses binary actions |
| Hyperliquid CoreWriter | Perpetual trading precompile | HyperEVM (999) | `0x3333333333333333333333333333333333333333` | MEDIUM — non-atomic, silent failures |
| Hyperliquid CoreDepositWallet | Margin deposits | HyperEVM (999) | `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24` | MEDIUM — async settlement |
| Aave V3 Pool | Lending | Target chain | Not hardcoded (adapter constructor) | MEDIUM — external protocol risk |
| Lido stETH/wstETH | Liquid staking | Ethereum (1) | Standard addresses | MEDIUM — rebasing token |
| Morpho Blue | Lending | Target chain | Not hardcoded (adapter constructor) | MEDIUM — external protocol risk |
| Pendle Router | Yield tokenization | Target chain | Not hardcoded (adapter constructor) | MEDIUM — external protocol risk |
| Uniswap V4 Router/PM | AMM | Target chain | Not hardcoded (adapter constructor) | MEDIUM — external protocol risk |
| OpenZeppelin Contracts | Base library | N/A | Via `lib/risc0-ethereum/lib/openzeppelin-contracts/` | LOW — well-audited, version pinned |

---

## Execution Modes

### Mode 1: Synchronous (Proof Required)
```
Host builds input -> zkVM generates proof -> submit(journal, seal, agentOutput) to vault
Vault: verifyAndParseWithImageId(trustedImageId, journal, seal) -> parse actions -> execute
```
Trust: Proof must be valid. No oracle required (unless `requireOracle == true`).

### Mode 2: Oracle-Attested (Proof + Oracle Signature)
```
Same as Mode 1 + oracle signs keccak256(inputRoot || actionCommitment || timestamp || chainId || vaultAddress)
```
Trust: Proof must be valid AND oracle signature must be valid and fresh.

### Mode 3: Optimistic (Immediate with Deferred Proof)
```
1. Operator locks WSTON bond on L1 via WSTONBondManager
2. Oracle (Role B / bondSigner) attests bond existence
3. executeOptimistic() on HyperEVM: verify bond attestation -> store pending -> execute actions immediately
4. Within challengeWindow: operator submits ZK proof via submitProof()
5a. If proof submitted in time: bond released on L1 (via relayer)
5b. If proof NOT submitted: anyone calls slashExpired() -> bond slashed on L1 (via relayer)
```
Trust: Bond signer (Role B) must be honest. Relayer must be online for bond resolution.

---

## Contract Inventory Summary

### Core (CRITICAL)
- `KernelVault.sol` — ERC4626-like vault with ZK-verified execution
- `OptimisticKernelVault.sol` — Extends KernelVault with optimistic execution mode
- `KernelExecutionVerifier.sol` — RISC Zero proof verification and journal parsing (UUPS)
- `KernelOutputParser.sol` — Binary action parsing library

### Infrastructure (HIGH)
- `AgentRegistry.sol` — Permissionless agent registration (UUPS)
- `VaultFactory.sol` — CREATE2 vault deployment (UUPS)
- `WSTONBondManager.sol` — Cross-chain bond escrow
- `OracleVerifier.sol` — ECDSA oracle signature verification library
- `MetaVault.sol` — Vault-of-vaults aggregator

### Adapters (MEDIUM)
- `HyperliquidAdapter.sol` + `TradingSubAccount.sol` — Perpetual futures via CoreWriter
- `AaveV3Adapter.sol` — Aave V3 lending integration
- `LidoAdapter.sol` — Lido liquid staking integration
- `MorphoAdapter.sol` — Morpho Blue lending integration
- `PendleAdapter.sol` — Pendle yield tokenization
- `UniswapV4Adapter.sol` — Uniswap V4 swap/LP
- `PolymarketAdapter.sol` — Polymarket prediction markets (scaffolding)

### Extensions (MEDIUM)
- `VaultAccessControl.sol` — Whitelist, deposit caps, KYC verification
- `VaultCreationCodeStore.sol` — Bytecode store for CREATE2

### Periphery (LOW)
- `StakingRouter.sol` — TON -> WTON -> WSTON staking pipeline
- `BuilderProgram.sol` — Builder incentive tiers and vesting grants
- `PointsProgram.sol` — Non-transferable points for depositors
- `ReferralManager.sol` — Referral tracking and points
- `MockWSTON.sol` — Test mock
- `MockYieldSource.sol` — Test mock

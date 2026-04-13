# External Contract Verification

**Generated**: 2026-04-13
**Method**: Code analysis + deployed address cross-reference from CLAUDE.md and MEMORY.md

---

## 1. WSTON (L1WrappedStakedTON)

| Field | Value |
|-------|-------|
| **Address** | `0x26C8F112769fb3A3A8de267CfFf60E9f317445e5` (Ethereum mainnet) |
| **Chain** | Ethereum (1) |
| **Role** | ERC20 bond token for optimistic execution in WSTONBondManager |
| **Verified** | ADDRESS_KNOWN — referenced in CLAUDE.md and MEMORY.md |
| **Usage in codebase** | `WSTONBondManager.sol` constructor: `wston = IERC20(_wston)`. Used via `SafeERC20` for `safeTransferFrom` / `safeTransfer` in lock/release/slash flows. |
| **Mock vs Production** | `MockWSTON.sol` exists in `src/` — standard ERC20 mock with mint/burn. Production WSTON is a proxy contract (`Layer2 = 0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF`). |
| **Token Transferability** | Standard ERC20 — no known transfer restrictions. SafeERC20 wrapping handles non-standard return values. |
| **Risk** | If WSTON has non-standard behavior (fee-on-transfer, rebase, blocklist), SafeERC20 would not protect against all edge cases. However, WSTON is a known Tokamak token — unlikely to have exotic mechanics. |
| **Status** | PARTIALLY_VERIFIED — address known, mock exists, but on-chain bytecode not verified against expected ABI |

---

## 2. WSTONBondManager (v2)

| Field | Value |
|-------|-------|
| **Address** | `0x46a92cDC8530fd1C4D46891625a718458856Bc14` (Ethereum mainnet) |
| **Chain** | Ethereum (1) |
| **Role** | Bond escrow for cross-chain optimistic execution |
| **Verified** | ADDRESS_KNOWN — referenced in CLAUDE.md |
| **Usage in codebase** | Referenced by OptimisticKernelVault via `IBondManager` interface. The vault itself does NOT call the BondManager directly — cross-chain bond operations go through the `trustedRelayer`. |
| **Cross-chain interaction** | Bond locked on L1 (this contract) → oracle attests bond on HyperEVM → relayer relays proof/slash events back to L1 |
| **Mock vs Production** | No mock for the BondManager in the test suite visible. Tests likely use the actual BondManager contract. |
| **Risk** | The BondManager is the SOLE arbiter of bond status on L1. If this contract is compromised/upgraded maliciously, all bonds are at risk. It is non-upgradeable (no UUPS/proxy patterns in source). |
| **Status** | PARTIALLY_VERIFIED — address known, source is in-scope, cross-chain behavior depends on relayer |

---

## 3. VaultFactory (HyperEVM)

| Field | Value |
|-------|-------|
| **Address** | `0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB` (HyperEVM chain 999) |
| **Chain** | HyperEVM (999) |
| **Role** | CREATE2 vault deployment, vault provenance verification |
| **Verified** | ADDRESS_KNOWN — referenced in CLAUDE.md and MEMORY.md |
| **Usage in codebase** | HyperliquidAdapter checks `IVaultFactory(vaultFactory).isDeployedVault(vault)` for vault registration. All adapters reference the factory for vault legitimacy. |
| **Current state** | Implementation v3 (`0xD59e472Bf9370a5614E6bD170c7C79cf6e33A7fd`) with `registerExternalVault`. OptimisticVaultCreationCodeStore at `0xC9E46FAD49bA9cB52A0A8C060BF827b2727887b7`. |
| **Risk** | Factory is UUPS-upgradeable with 48h timelock. A compromised factory owner could, after 48h, deploy a malicious vault via modified creation code. The code store swap also has a timelock (M-07 fix). |
| **Status** | VERIFIED — address, implementation, and code stores cross-referenced with MEMORY.md |

---

## 4. VaultFactory (Ethereum)

| Field | Value |
|-------|-------|
| **Address** | `0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822` (Ethereum mainnet) |
| **Chain** | Ethereum (1) |
| **Role** | Vault deployment on L1 (for L1 vaults, if applicable) |
| **Verified** | ADDRESS_KNOWN — referenced in CLAUDE.md |
| **Status** | PARTIALLY_VERIFIED — address known, same contract code as HyperEVM factory |

---

## 5. IRiscZeroVerifier

| Field | Value |
|-------|-------|
| **Address** | Configured at KernelExecutionVerifier initialization (not a fixed address) |
| **Chain** | HyperEVM (999) or any deployment chain |
| **Role** | Groth16 ZK proof verification — the trust root of the entire protocol |
| **Verified** | INTERFACE_ONLY — the codebase uses `IRiscZeroVerifier` interface, actual verifier is external |
| **Usage in codebase** | `KernelExecutionVerifier.sol` calls `verifier.verify(seal, imageId, journalDigest)` |
| **Known CVEs** | CVE-2025-52484 (underconstrained remu/divu in risc0-zkvm 2.0.0-2.0.2). Codebase has C-03 fix: verifier rotation with allowlist + 48h timelock. CVE-2025-61588 (sys_read RCE, affects guest, not Solidity). |
| **Risk** | CRITICAL — if the deployed verifier is an unpatched version, proof forgery is possible. The C-03 rotation mechanism is a remediation path but requires operator action. |
| **Mock vs Production** | Tests likely use RISC Zero's `MockVerifier` or a local verifier. Production must be a vetted Groth16 verifier. |
| **Status** | UNVERIFIED — no specific deployed verifier address found in MEMORY.md or CLAUDE.md. Must verify on-chain which verifier contract the KernelExecutionVerifier proxy points to. Rule 4 applies: adversarial assumption. |

---

## 6. OracleVerifier Library

| Field | Value |
|-------|-------|
| **Address** | `0x49D2F7419f15eD00700dE325FE9F945C26353c18` (HyperEVM chain 999) |
| **Chain** | HyperEVM (999) |
| **Role** | ECDSA oracle signature verification for price feeds and bond attestations |
| **Verified** | ADDRESS_KNOWN — referenced in CLAUDE.md and MEMORY.md |
| **Usage in codebase** | Library linked into KernelVault and OptimisticKernelVault via external library linking |
| **Risk** | LOW — it is a pure library (stateless). If the deployed bytecode matches the source, behavior is deterministic. The library uses `ecrecover` precompile and standard EIP-191 signing. |
| **Status** | PARTIALLY_VERIFIED — address known, source is in-scope |

---

## 7. KernelOutputParser Library

| Field | Value |
|-------|-------|
| **Address** | `0x23d9B155ed33a248085ae15Ed76b305D97F0D8fd` (HyperEVM chain 999) |
| **Chain** | HyperEVM (999) |
| **Role** | Binary action parsing — translates agent output bytes into executable actions |
| **Verified** | ADDRESS_KNOWN — referenced in MEMORY.md |
| **Usage in codebase** | Library linked into KernelVault. Called via `KernelOutputParser.parseActions(agentOutputBytes)`. |
| **Risk** | HIGH — if parsing is incorrect, actions could be misinterpreted. The library has extensive bounds checking and defense-in-depth (trailing byte rejection, action length validation). |
| **Status** | PARTIALLY_VERIFIED — address known, source is in-scope |

---

## 8. Hyperliquid CoreWriter

| Field | Value |
|-------|-------|
| **Address** | `0x3333333333333333333333333333333333333333` (HyperEVM system contract) |
| **Chain** | HyperEVM (999) |
| **Role** | System precompile for submitting orders/transfers to HyperCore |
| **Verified** | SYSTEM_CONTRACT — hardcoded in TradingSubAccount.sol |
| **Behavior** | NON-ATOMIC: actions are queued, not executed synchronously. No revert on HyperCore-level failures (silent rejection). Orders that violate oracle price band (~5-10%) are dropped silently. |
| **Risk** | MEDIUM — fundamental platform constraint. The adapter has extensive documentation of this behavior and deprecation notices for functions that relied on extreme prices. The C-05 fix specifically addresses the silent-drop issue for close operations. |
| **Mock vs Production** | No mock available — CoreWriter is a HyperEVM system precompile. Tests on local Foundry cannot simulate its behavior. |
| **Status** | VERIFIED_BEHAVIOR — system contract, behavior well-documented in codebase and MEMORY.md |

---

## 9. Hyperliquid CoreDepositWallet

| Field | Value |
|-------|-------|
| **Address** | `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24` (HyperEVM mainnet) |
| **Chain** | HyperEVM (999) |
| **Role** | Deposits USDC from HyperEVM to HyperCore perp margin |
| **Verified** | ADDRESS_KNOWN — referenced in MEMORY.md (queried via spotMeta API) |
| **Behavior** | Accepts ERC20 USDC via `deposit(amount, destinationDex)`. Async settlement (~few seconds). |
| **Risk** | MEDIUM — deposit is async. Margin is not immediately available for trading after deposit TX confirms. MEMORY.md documents this as a critical operational bottleneck. |
| **Status** | VERIFIED — address confirmed via Hyperliquid API documentation |

---

## 10. Aave V3 Pool

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at AaveV3Adapter constructor (`_pool` parameter) |
| **Chain** | Target chain (adapter is chain-agnostic) |
| **Role** | External lending protocol (supply, borrow, repay, withdraw) |
| **Verified** | UNVERIFIED — no production address in codebase or CLAUDE.md |
| **Interface** | `IPool` minimal interface defined inline in AaveV3Adapter.sol. Matches Aave V3 ABI. |
| **Risk** | MEDIUM — adapter trusts external Pool contract. If a malicious Pool address is configured, all vault funds routed through it are at risk. Adapter has health factor checks. |
| **Status** | UNVERIFIED — Rule 4 applies: adversarial assumption for address configuration |

---

## 11. Lido stETH / wstETH

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at LidoAdapter constructor (`_lido`, `_wsteth`, `_withdrawalQueue` parameters) |
| **Chain** | Ethereum (1) |
| **Role** | Liquid staking integration (ETH -> stETH -> wstETH, withdrawal queue) |
| **Verified** | UNVERIFIED — no production address in codebase |
| **Risk** | MEDIUM — stETH is a REBASING token. The adapter handles this via per-vault balance tracking. wstETH is non-rebasing. If incorrect addresses configured, funds at risk. |
| **Status** | UNVERIFIED — Rule 4 applies |

---

## 12. Morpho Blue

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at MorphoAdapter constructor (`_morpho` parameter) |
| **Chain** | Target chain |
| **Role** | Permissionless lending protocol |
| **Verified** | UNVERIFIED — no production address in codebase |
| **Interface** | `IMorpho` interface defined inline. Uses `MarketParams` struct for market identification. Per-market oracle interface `IMorphoOracle`. |
| **Risk** | MEDIUM — market-specific risk. Each Morpho market has its own oracle and IRM. Adapter has health check via `_getHealthFactor()`. |
| **Status** | UNVERIFIED — Rule 4 applies |

---

## 13. Pendle Router

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at PendleAdapter constructor |
| **Chain** | Target chain |
| **Role** | Yield tokenization (PT/YT minting, LP) |
| **Verified** | UNVERIFIED — no production address in codebase |
| **Status** | UNVERIFIED — Rule 4 applies |

---

## 14. Uniswap V4

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at UniswapV4Adapter constructor (`_swapRouter`, `_positionManager` parameters) |
| **Chain** | Target chain |
| **Role** | AMM swap and LP position management |
| **Verified** | UNVERIFIED — no production address in codebase |
| **Interface** | `ISwapRouter` and `INonfungiblePositionManager` minimal interfaces defined inline. |
| **Status** | UNVERIFIED — Rule 4 applies |

---

## 15. Polymarket CTF Exchange

| Field | Value |
|-------|-------|
| **Address** | Not hardcoded — set at PolymarketAdapter constructor (`_ctfExchange` parameter) |
| **Chain** | Polygon (expected) |
| **Role** | Prediction market conditional token trading |
| **Verified** | UNVERIFIED — no production address, marked as scaffolding |
| **Risk** | LOW (currently) — source comments indicate "scaffolding logic" and "Integrate with the actual CTF Exchange ABI before mainnet use." |
| **Status** | UNVERIFIED — scaffolding, not production-ready |

---

## 16. Tokamak Token Ecosystem (StakingRouter)

| Field | Value |
|-------|-------|
| **Addresses** | TON: `0x2be5e8c109e2197D077D13A82dAead6a9b3433C5`, WTON: `0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2`, DepositMgr: `0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e`, SeigMgr: `0x0b55a0f463b6defb81c6063973763951712d0e5f` |
| **Chain** | Ethereum (1) |
| **Role** | TON -> WTON -> WSTON staking pipeline |
| **Verified** | ADDRESS_KNOWN — referenced in MEMORY.md |
| **Status** | PARTIALLY_VERIFIED — addresses known, StakingRouter interfaces are minimal (IWTON, IWSTON) |

---

## Summary

| Dependency | Verification Status | Risk Level | Rule 4 Trigger? |
|-----------|---------------------|-----------|-----------------|
| WSTON (ERC20) | PARTIALLY_VERIFIED | MEDIUM | No |
| WSTONBondManager | PARTIALLY_VERIFIED | HIGH | No |
| VaultFactory (HyperEVM) | VERIFIED | MEDIUM | No |
| VaultFactory (Ethereum) | PARTIALLY_VERIFIED | MEDIUM | No |
| IRiscZeroVerifier | UNVERIFIED | CRITICAL | YES |
| OracleVerifier lib | PARTIALLY_VERIFIED | LOW | No |
| KernelOutputParser lib | PARTIALLY_VERIFIED | HIGH | No |
| CoreWriter | VERIFIED_BEHAVIOR | MEDIUM | No |
| CoreDepositWallet | VERIFIED | MEDIUM | No |
| Aave V3 Pool | UNVERIFIED | MEDIUM | YES |
| Lido stETH/wstETH | UNVERIFIED | MEDIUM | YES |
| Morpho Blue | UNVERIFIED | MEDIUM | YES |
| Pendle Router | UNVERIFIED | MEDIUM | YES |
| Uniswap V4 | UNVERIFIED | MEDIUM | YES |
| Polymarket CTF | UNVERIFIED | LOW | YES (scaffolding) |
| Tokamak tokens (TON/WTON) | PARTIALLY_VERIFIED | LOW | No |

**Rule 4 (adversarial assumption) triggered for**: IRiscZeroVerifier (no specific deployed address), Aave V3 Pool, Lido stETH/wstETH, Morpho Blue, Pendle Router, Uniswap V4, Polymarket CTF Exchange. These all have adapter-constructor-configured addresses with no on-chain verification of the target contract's legitimacy beyond the vault owner's diligence.

**Most critical unverified dependency**: IRiscZeroVerifier — the trust root of the entire protocol. The deployed verifier address must be verified against the known-good RISC Zero Groth16 verifier contract, and its version must be checked against CVE-2025-52484 (patched in risc0-zkvm 2.1.0+).

# Contract Inventory

## Scope

All non-mock, non-interface contracts under `src/`. Full project audit.

## Line Counts

| # | Contract | Path | Lines | In Scope |
|---|----------|------|-------|----------|
| 1 | KernelVault | src/KernelVault.sol | 1954 | YES |
| 2 | PendleAdapter | src/adapters/PendleAdapter.sol | 889 | YES |
| 3 | MorphoAdapter | src/adapters/MorphoAdapter.sol | 758 | YES |
| 4 | WSTONBondManager | src/WSTONBondManager.sol | 732 | YES |
| 5 | UniswapV4Adapter | src/adapters/UniswapV4Adapter.sol | 702 | YES |
| 6 | MetaVault | src/MetaVault.sol | 699 | YES |
| 7 | KernelExecutionVerifier | src/KernelExecutionVerifier.sol | 675 | YES |
| 8 | VaultFactory | src/VaultFactory.sol | 635 | YES |
| 9 | AaveV3Adapter | src/adapters/AaveV3Adapter.sol | 605 | YES |
| 10 | PointsProgram | src/PointsProgram.sol | 578 | YES |
| 11 | OptimisticKernelVault | src/OptimisticKernelVault.sol | 510 | YES |
| 12 | LidoAdapter | src/adapters/LidoAdapter.sol | 481 | YES |
| 13 | BuilderProgram | src/BuilderProgram.sol | 464 | YES |
| 14 | HyperliquidAdapter | src/adapters/HyperliquidAdapter.sol | 460 | YES |
| 15 | AgentRegistry | src/AgentRegistry.sol | 449 | YES |
| 16 | TradingSubAccount | src/adapters/TradingSubAccount.sol | 400 | YES |
| 17 | VaultAccessControl | src/extensions/VaultAccessControl.sol | 289 | YES |
| 18 | KernelOutputParser | src/KernelOutputParser.sol | 284 | YES |
| 19 | OracleVerifier | src/libraries/OracleVerifier.sol | 268 | YES |
| 20 | PolymarketAdapter | src/adapters/PolymarketAdapter.sol | 206 | YES |
| 21 | ReferralManager | src/ReferralManager.sol | 194 | YES |
| 22 | StakingRouter | src/StakingRouter.sol | 181 | YES |
| 23 | VaultCreationCodeStore | src/VaultCreationCodeStore.sol | 33 | YES |
| - | MockWSTON | src/MockWSTON.sol | 21 | NO (mock) |
| - | MockYieldSource | src/MockYieldSource.sol | 92 | NO (mock) |

**Total in-scope lines: 11,446** across 23 contracts.

## Inheritance Chains

```
ReentrancyGuard, Pausable
    └── KernelVault
            └── OptimisticKernelVault (extends KernelVault, implements IOptimisticKernelVault)

Initializable, UUPSUpgradeable
    ├── AgentRegistry (implements IAgentRegistry)
    ├── VaultFactory (implements IVaultFactory)
    └── KernelExecutionVerifier

ReentrancyGuard
    ├── MetaVault
    ├── WSTONBondManager (implements IBondManager)
    ├── StakingRouter
    ├── AaveV3Adapter (implements IAaveV3Adapter)
    ├── HyperliquidAdapter (implements IHyperliquidAdapter)
    ├── LidoAdapter
    ├── MorphoAdapter
    ├── UniswapV4Adapter
    ├── PendleAdapter
    └── PolymarketAdapter

No parent:
    ├── VaultAccessControl
    ├── PointsProgram
    ├── BuilderProgram
    ├── ReferralManager
    ├── TradingSubAccount
    ├── VaultCreationCodeStore
    ├── KernelOutputParser (library)
    └── OracleVerifier (library)
```

### Dependency Flow (inter-contract calls)

```
AgentRegistry ← VaultFactory → KernelVault / OptimisticKernelVault
                                    ↓
                          KernelExecutionVerifier → IRiscZeroVerifier (external)
                          KernelOutputParser (lib)
                          OracleVerifier (lib)
OptimisticKernelVault → IBondManager (WSTONBondManager)
KernelVault → HyperliquidAdapter → TradingSubAccount → CoreWriter (external)
KernelVault → LidoAdapter → ILido, IWstETH, IWithdrawalQueue (external)
KernelVault → AaveV3Adapter → IPool (Aave V3) (external)
KernelVault → MorphoAdapter → IMorpho (external)
KernelVault → UniswapV4Adapter → ISwapRouter, INonfungiblePositionManager (external)
KernelVault → PendleAdapter → IPendleRouter, IPendleMarket (external)
KernelVault → PolymarketAdapter → CTF Exchange (external)
MetaVault → KernelVault (via IKernelVaultLike)
MetaVault → VaultFactory (via IVaultFactory)
PointsProgram → VaultFactory
BuilderProgram → (references VaultFactory, AgentRegistry by address)
VaultAccessControl → KernelVault (via vault address)
StakingRouter → IWTON, IWSTON (external Tokamak L2)
```

### PARENT_CONDITIONAL_OVERRIDE Flags

| Parent | Child | Conditional Logic | Flag |
|--------|-------|-------------------|------|
| KernelVault | OptimisticKernelVault | `_settle()` is virtual with conditional override in OKV; `_validateParsedJournal()` contains conditional oracle + nonce logic that OKV inherits; `_executeActions()` contains strategy activation conditional; all fee collection functions have `strategyActive` guards | PARENT_CONDITIONAL_OVERRIDE |
| Pausable (OZ) | KernelVault | `_pause()` and `_unpause()` are overridden with custom `pausedAt` logic (H-02 fix) | PARENT_CONDITIONAL_OVERRIDE |

### Parent Standalone Analysis Required

| Parent | Reason |
|--------|--------|
| KernelVault | Parent is independently deployed (non-optimistic vaults) AND has virtual `_settle()` overridden by OptimisticKernelVault. KernelVault must be analyzed standalone to catch bugs in its own unconditional code paths (fee accrual, PPS computation, strategy activation, emergency withdrawal, deposit locking) that are invisible when analyzing through the OKV override lens. |

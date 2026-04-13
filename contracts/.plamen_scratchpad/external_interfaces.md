# External Interfaces

## In-scope interfaces (src/interfaces/)
| Interface | File | Description |
|-----------|------|-------------|
| IAaveV3Adapter | src/interfaces/IAaveV3Adapter.sol | AaveV3 adapter: supply/borrow/repay/withdraw/claimRewards |
| IAgentRegistry | src/interfaces/IAgentRegistry.sol | Agent registration: register/update/unregister/deprecate |
| IBondManager | src/interfaces/IBondManager.sol | Bond escrow: lockBond/releaseBond/slashBond/lockBondBatch |
| IERC20 | src/interfaces/IERC20.sol | Standard ERC20 |
| IHyperliquidAdapter | src/interfaces/IHyperliquidAdapter.sol | Hyperliquid perpetuals adapter |
| IKernelExecutionVerifier | src/interfaces/IKernelExecutionVerifier.sol | RISC Zero proof verification + journal parsing |
| IOptimisticKernelVault | src/interfaces/IOptimisticKernelVault.sol | Optimistic execution: executeOptimistic/submitProof/slashExpired |
| IRiscZeroVerifier | src/interfaces/IRiscZeroVerifier.sol | RISC Zero underlying verifier |
| IVaultFactory | src/interfaces/IVaultFactory.sol | Vault deployment: deployVault/deployOptimisticVault/registerExternalVault |

## External protocol interfaces (inline in adapters)
| Protocol | Usage Location | Key Functions |
|----------|---------------|---------------|
| Aave V3 IPool | src/adapters/AaveV3Adapter.sol | supply, withdraw, borrow, repay, getUserAccountData |
| Aave IRewardsController | src/adapters/AaveV3Adapter.sol | claimRewards |
| Morpho IMorpho | src/adapters/MorphoAdapter.sol | supply, withdraw, borrow, repay, supplyCollateral |
| Lido ILido / IWstETH | src/adapters/LidoAdapter.sol | submit (ETH→stETH), wrap (stETH→wstETH), unwrap |
| Lido ILidoWithdrawal | src/adapters/LidoAdapter.sol | requestWithdrawals, claimWithdrawals |
| Pendle IPendleRouter | src/adapters/PendleAdapter.sol | mintPyFromToken, swapExactTokenForPt, addLiquidity |
| Uniswap V4 IPoolManager | src/adapters/UniswapV4Adapter.sol | swap, modifyLiquidity |
| Polymarket ICTFExchange | src/adapters/PolymarketAdapter.sol | buy/sell outcome tokens |
| CoreWriter (0x3333...3333) | src/adapters/TradingSubAccount.sol | Hyperliquid perpetuals via EVM precompile |
| RISC Zero IRiscZeroVerifier | src/KernelExecutionVerifier.sol | verify(seal, imageId, journalDigest) |
| Tokamak Staking (ITON/IWTON/IDepositManager) | src/StakingRouter.sol | TON→WTON staking flow |

## Key Trust Assumptions
- IRiscZeroVerifier: trusted as cryptographic correctness primitive
- CoreWriter precompile: trusted as Hyperliquid system contract (no revert guarantee)
- Oracle signer: semi-trusted for price feeds and bond attestations
- Relayer: semi-trusted for L1 bond release/slash relay
- VaultFactory owner: trusted for vault code store upgrades (48h delay)

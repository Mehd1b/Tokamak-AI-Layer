# Call Graph

## Status: UNAVAILABLE
Slither not installed. Call graph generation via MCP skipped.
SLITHER_AVAILABLE = false

## Manual Cross-Contract Call Summary (from grep analysis)

### KernelVault → External
- KernelExecutionVerifier.verifyAndParseWithImageId() — proof verification
- ERC20.transfer/transferFrom — asset transfers
- CALL actions dispatched to arbitrary targets (agent-specified)

### OptimisticKernelVault → External
- KernelExecutionVerifier.verify() — proof verification for submitProof
- IBondManager.lockBond() — on executeOptimistic
- IBondManager.releaseBond() — on submitProof (emits event only, relayer handles L1)
- IBondManager.slashBond() — on slashExpired/selfSlash (emits event only, relayer handles L1)

### VaultFactory → External
- IAgentRegistry.get() — reads agent info on vault deployment
- VaultCreationCodeStore — extcodesize for CREATE2 bytecode

### AgentRegistry → External
- IVaultFactory.getAgentVaults() — during unregister validation
- IKernelVaultView(vault).totalAssets() — checks for deposits during unregister

### Adapters → External
- AaveV3Adapter → IPool (Aave V3), IRewardsController
- MorphoAdapter → IMorpho (Morpho Blue)
- LidoAdapter → ILido (stETH), IWstETH, ILidoWithdrawal
- PendleAdapter → IPendleRouter, IPendleMarket
- UniswapV4Adapter → IPoolManager (Uniswap V4)
- PolymarketAdapter → ICTFExchange (Polymarket)
- HyperliquidAdapter → TradingSubAccount (sub-account per vault)
- TradingSubAccount → CoreWriter precompile (0x3333...3333) for HyperEVM perpetuals

### PointsProgram → External
- IVaultFactory.isDeployedVault() — validation

### StakingRouter → External
- ITON, IWTON, IDepositManager (Tokamak staking contracts)

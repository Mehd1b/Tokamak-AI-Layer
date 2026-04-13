# Modifiers (SLITHER_AVAILABLE=false, grep fallback)

## Source: grep from src/ directory

| Contract | Line | Modifier |
|----------|------|----------|
| src/AgentRegistry.sol | 124 | onlyOwner() |
| src/ReferralManager.sol | 92 | onlyOwner() |
| src/BuilderProgram.sol | 133 | onlyOwner() |
| src/BuilderProgram.sol | 138 | onlyAuthorized() |
| src/VaultFactory.sol | 143 | onlyOwner() |
| src/PointsProgram.sol | 203 | onlyOwner() |
| src/PointsProgram.sol | 208 | onlyDeployedVault(address vault) |
| src/PointsProgram.sol | 213 | seasonActive() |
| src/extensions/VaultAccessControl.sol | 106 | onlyOwner() |
| src/adapters/TradingSubAccount.sol | 133 | onlyAdapter() |
| src/adapters/LidoAdapter.sol | 135 | onlyRegisteredVault() |
| src/adapters/MorphoAdapter.sol | 253 | onlyRegisteredVault() |
| src/adapters/MorphoAdapter.sol | 260 | onlyWhitelistedMarket(MarketParams calldata params) |
| src/adapters/AaveV3Adapter.sol | 172 | onlyRegisteredVault() |
| src/adapters/AaveV3Adapter.sol | 179 | onlyAdapterOwner() |
| src/adapters/HyperliquidAdapter.sol | 89 | onlyRegisteredVault() |
| src/adapters/UniswapV4Adapter.sol | 270 | onlyRegisteredVault() |
| src/adapters/PolymarketAdapter.sol | 86 | onlyRegisteredVault() |
| src/adapters/PendleAdapter.sol | 291 | onlyRegisteredVault() |
| src/adapters/PendleAdapter.sol | 298 | onlyWhitelistedMarket(address market) |
| src/adapters/PendleAdapter.sol | 305 | notExpiringSoon(address market) |
| src/MetaVault.sol | 146 | onlyOwner() |
| src/KernelExecutionVerifier.sol | 283 | onlyOwner() |
| src/WSTONBondManager.sol | 178 | onlyOwner() |
| src/WSTONBondManager.sol | 183 | onlyAuthorizedVault() |
| src/WSTONBondManager.sol | 188 | onlyRelayer() |

## Notes
- KernelVault (the main vault) uses VaultAccessControl extension for its onlyOwner
- Adapters uniformly use `onlyRegisteredVault()` — vault must call register first
- No `nonReentrant` modifier detected at modifier level (KernelVault uses ReentrancyGuard from OpenZeppelin, inherited)

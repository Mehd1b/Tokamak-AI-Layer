# Tokagent DefiLlama Adapter

## Protocol

Tokagent is the DeFi layer of Tokamak AI Layer. Users deposit assets into KernelVaults managed by on-chain AI agents. Each agent's execution is verified via RISC Zero proofs, and the vaults follow ERC-4626-style price-per-share accounting.

## TVL Calculation

TVL is computed by:

1. Querying the `VaultFactory.getAllVaults()` on each chain to enumerate every deployed KernelVault.
2. For each vault, calling `asset()` to identify the underlying token and `totalAssets()` to read the current balance.
3. Summing balances per token across all vaults.

Native ETH vaults (where `asset() == address(0)`) are handled by mapping to the null address so DefiLlama prices them correctly.

## Contract Addresses

| Chain    | Contract     | Address                                      |
| -------- | ------------ | -------------------------------------------- |
| Ethereum | VaultFactory | `0x...` (TBD)                                |
| Arbitrum | VaultFactory | `0x...` (TBD)                                |
| Optimism | VaultFactory | `0x...` (TBD)                                |
| HyperEVM | VaultFactory | `0x...` (TBD)                                |

## Links

- Documentation: https://docs.tokagent.network
- App: https://tokagent.network

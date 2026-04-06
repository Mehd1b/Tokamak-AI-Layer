/**
 * Tokagent DefiLlama Adapter - Configuration
 *
 * Protocol: Tokagent (Tokamak AI Layer)
 * Category: Yield Aggregator
 */

const config = {
  protocol: "Tokagent",
  category: "Yield Aggregator",
  methodology:
    "TVL is calculated as the sum of totalAssets() across all KernelVault instances deployed via the VaultFactory on each chain.",
  vaultFactory: {
    ethereum: "0x0000000000000000000000000000000000000000", // TODO: replace with deployed address
    arbitrum: "0x0000000000000000000000000000000000000000", // TODO: replace with deployed address
    optimism: "0x0000000000000000000000000000000000000000", // TODO: replace with deployed address
    hyperevm: "0x0000000000000000000000000000000000000000", // TODO: replace with deployed address (chainId 999)
  },
};

module.exports = config;

const sdk = require("@defillama/sdk");
const { sumTokens2 } = require("../helper/unwrapLPs"); // DefiLlama helper
const config = require("./config");

// ---------- ABIs ----------

const abis = {
  getAllVaults: {
    inputs: [],
    name: "getAllVaults",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  asset: {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "contract IERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  totalAssets: {
    inputs: [],
    name: "totalAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
};

// ---------- Addresses ----------

const ADDRESSES = {
  null: "0x0000000000000000000000000000000000000000",
};

// ---------- TVL logic ----------

/**
 * Build a tvl function for the given chain.
 *
 * Flow:
 *   1. Call VaultFactory.getAllVaults() to enumerate every KernelVault.
 *   2. Batch-call asset() on each vault to learn the underlying token.
 *   3. Batch-call totalAssets() on each vault to learn the balance.
 *   4. Aggregate balances by token and return the balances object.
 *
 * Edge cases handled:
 *   - Empty vault list (no vaults deployed yet): returns {}.
 *   - Native ETH vaults (asset == address(0)): mapped to ADDRESSES.null so
 *     DefiLlama prices them as native ETH.
 *   - Vaults with zero totalAssets: included but contribute 0 to the sum.
 */
function chainTvl(chain) {
  return async function tvl(timestamp, ethBlock, chainBlocks, { api }) {
    const factoryAddress = config.vaultFactory[chain];
    if (!factoryAddress || factoryAddress === ADDRESSES.null) {
      return {};
    }

    // 1. Get all vault addresses from the factory
    const vaults = await api.call({
      abi: abis.getAllVaults,
      target: factoryAddress,
    });

    if (!vaults || vaults.length === 0) {
      return {};
    }

    // 2. Get the underlying asset for each vault
    const assets = await api.multiCall({
      abi: abis.asset,
      calls: vaults.map((vault) => ({ target: vault })),
    });

    // 3. Get totalAssets for each vault
    const totals = await api.multiCall({
      abi: abis.totalAssets,
      calls: vaults.map((vault) => ({ target: vault })),
    });

    // 4. Aggregate balances by token address
    const balances = {};
    for (let i = 0; i < vaults.length; i++) {
      let token = assets[i];

      // Native ETH vaults report asset == address(0)
      if (!token || token === ADDRESSES.null) {
        token = ADDRESSES.null;
      }

      const amount = totals[i] || "0";
      sdk.util.sumSingleBalance(balances, token, amount);
    }

    return balances;
  };
}

// ---------- Exports ----------

module.exports = {
  methodology: config.methodology,
  ethereum: { tvl: chainTvl("ethereum") },
  arbitrum: { tvl: chainTvl("arbitrum") },
  optimism: { tvl: chainTvl("optimism") },
  hyperevm: { tvl: chainTvl("hyperevm") },
};

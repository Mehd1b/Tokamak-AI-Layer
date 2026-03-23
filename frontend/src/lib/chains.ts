import { defineChain, type Chain } from 'viem';

// HyperEVM does NOT support EIP-1559 — force legacy gas pricing so wallets
// send type-0 transactions instead of type-2 (which the RPC rejects).
const legacyGasFees: Chain['fees'] = {
  estimateFeesPerGas: async ({ client }) => {
    const gasPrice = await client.request({ method: 'eth_gasPrice' });
    return { gasPrice: BigInt(gasPrice) };
  },
};

export const thanosSepolia = defineChain({
  id: 111551119090,
  name: 'Thanos Sepolia',
  nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  rpcUrls: { default: { http: ['/api/rpc/111551119090'] } },
  blockExplorers: { default: { name: 'Thanos Explorer', url: 'https://explorer.thanos-sepolia.tokamak.network' } },
  testnet: true,
});

export const hyperEvmMainnet = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['/api/rpc/999'] } },
  blockExplorers: { default: { name: 'HyperEVM Explorer', url: 'https://hyperevmscan.io' } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: false,
  fees: legacyGasFees,
});

export const hyperEvmTestnet = defineChain({
  id: 998,
  name: 'HyperEVM Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['/api/rpc/998'] } },
  blockExplorers: { default: { name: 'HyperEVM Explorer', url: 'https://testnet.purrsec.com' } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: true,
  fees: legacyGasFees,
});

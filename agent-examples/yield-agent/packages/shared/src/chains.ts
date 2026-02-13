import { defineChain } from "viem";

export const thanosSepolia = defineChain({
  id: 111551119090,
  name: "Thanos Sepolia",
  nativeCurrency: { name: "Tokamak Network Token", symbol: "TON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.thanos-sepolia.tokamak.network"] },
  },
  blockExplorers: {
    default: { name: "Thanos Explorer", url: "https://explorer.thanos-sepolia.tokamak.network" },
  },
  testnet: true,
});

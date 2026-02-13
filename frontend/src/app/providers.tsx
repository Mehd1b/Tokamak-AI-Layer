'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import { sepolia, type Chain } from 'wagmi/chains';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { useState, type ReactNode } from 'react';

const thanosSepolia = {
  id: 111551119090,
  name: 'Thanos Sepolia',
  nativeCurrency: {
    name: 'Tokamak Network Token',
    symbol: 'TON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.thanos-sepolia.tokamak.network'] },
  },
  blockExplorers: {
    default: { name: 'Thanos Explorer', url: 'https://explorer.thanos-sepolia.tokamak.network' },
  },
  testnet: true,
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: 'Tokamak Agent Layer',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || 'placeholder',
  chains: [thanosSepolia, sepolia],
  transports: {
    [thanosSepolia.id]: http('https://rpc.thanos-sepolia.tokamak.network'),
    [sepolia.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

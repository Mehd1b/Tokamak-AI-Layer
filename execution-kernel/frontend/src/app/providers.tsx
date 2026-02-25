'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { hyperEvmMainnet, hyperEvmTestnet } from '@/lib/chains';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { useState, type ReactNode } from 'react';
import { NetworkProvider } from '@/lib/NetworkContext';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Supported',
      wallets: [metaMaskWallet],
    },
  ],
  {
    appName: 'Execution Kernel',
    projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || 'placeholder',
  },
);

const config = createConfig({
  connectors,
  chains: [mainnet, hyperEvmMainnet, sepolia, hyperEvmTestnet],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    [hyperEvmMainnet.id]: http(process.env.NEXT_PUBLIC_HYPER_MAINNET_RPC_URL || 'https://rpc.hyperliquid.xyz/evm'),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [hyperEvmTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
  },
  multiInjectedProviderDiscovery: false,
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
        <RainbowKitProvider>
          <NetworkProvider>{children}</NetworkProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

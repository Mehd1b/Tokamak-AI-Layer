'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia, arbitrum, optimism } from 'wagmi/chains';
import { hyperEvmMainnet, hyperEvmTestnet, thanosSepolia } from '@/lib/chains';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rabbyWallet,
  safeWallet,
  ledgerWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { useState, type ReactNode } from 'react';
import { NetworkProvider } from '@/lib/NetworkContext';
import { TokamakProvider } from '@ek-sdk/react';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || 'placeholder';
if (typeof window !== 'undefined' && walletConnectProjectId === 'placeholder') {
  console.warn('[Tokagent] NEXT_PUBLIC_WALLET_CONNECT_ID is not set — WalletConnect will not work in production.');
}

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, coinbaseWallet, rabbyWallet, walletConnectWallet],
    },
    {
      groupName: 'More',
      wallets: [safeWallet, ledgerWallet, injectedWallet],
    },
  ],
  {
    appName: 'Tokagent',
    projectId: walletConnectProjectId,
  },
);

const config = createConfig({
  connectors,
  chains: [mainnet, hyperEvmMainnet, arbitrum, optimism, sepolia, hyperEvmTestnet, thanosSepolia],
  transports: {
    [mainnet.id]: http('/api/rpc/1'),
    [hyperEvmMainnet.id]: http('/api/rpc/999'),
    [arbitrum.id]: http('/api/rpc/42161'),
    [optimism.id]: http('/api/rpc/10'),
    [sepolia.id]: http('/api/rpc/11155111'),
    [hyperEvmTestnet.id]: http('/api/rpc/998'),
    [thanosSepolia.id]: http('/api/rpc/111551119090'),
  },
  multiInjectedProviderDiscovery: true,
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
          <TokamakProvider>
            <NetworkProvider>{children}</NetworkProvider>
          </TokamakProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

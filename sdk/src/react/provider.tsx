'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { ExecutionKernelClient } from '../ExecutionKernelClient';
import { DEPLOYMENTS } from '../addresses';
import type { DeploymentAddresses } from '../addresses';

interface TokamakProviderProps {
  children: ReactNode;
  addresses?: DeploymentAddresses;
}

const TokamakContext = createContext<ExecutionKernelClient | null>(null);

/**
 * Inner component that uses wagmi hooks. Only rendered after mount
 * to avoid SSR/static-generation issues where WagmiProvider context
 * is not available.
 */
function TokamakProviderInner({ children, addresses }: TokamakProviderProps) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const client = useMemo(() => {
    if (!publicClient) return null;
    const addrs = addresses ?? DEPLOYMENTS[chainId];
    if (!addrs) return null;
    return new ExecutionKernelClient({
      publicClient,
      walletClient: walletClient ?? undefined,
      ...addrs,
    });
  }, [publicClient, walletClient, chainId, addresses]);

  return (
    <TokamakContext.Provider value={client}>
      {children}
    </TokamakContext.Provider>
  );
}

export function TokamakProvider({ children, addresses }: TokamakProviderProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // During SSR / static generation, render children without the client
  // so wagmi hooks are not called outside WagmiProvider.
  if (!mounted) {
    return (
      <TokamakContext.Provider value={null}>
        {children}
      </TokamakContext.Provider>
    );
  }

  return (
    <TokamakProviderInner addresses={addresses}>
      {children}
    </TokamakProviderInner>
  );
}

export function useTokamakClient(): ExecutionKernelClient | null {
  return useContext(TokamakContext);
}

export function useRequiredTokamakClient(): ExecutionKernelClient {
  const client = useContext(TokamakContext);
  if (!client) {
    throw new Error(
      'useTokamakClient: no client available. ' +
      'Wrap your app in <TokamakProvider> and ensure the wallet is connected to a supported chain.'
    );
  }
  return client;
}

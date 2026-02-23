'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { sepolia } from 'wagmi/chains';
import { hyperEvmTestnet } from '@/lib/chains';
import { DEPLOYMENTS, DEFAULT_CHAIN_ID, type DeploymentAddresses } from '@ek-sdk/addresses';

interface NetworkContextValue {
  selectedChainId: number;
  setSelectedChainId: (id: number) => void;
  contracts: DeploymentAddresses;
  explorerUrl: string;
  nativeCurrency: string;
}

const STORAGE_KEY = 'ek-selected-chain-id';

const SUPPORTED_CHAINS = [sepolia, hyperEvmTestnet];

function getExplorerUrl(chainId: number): string {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  return chain?.blockExplorers?.default?.url ?? 'https://sepolia.etherscan.io';
}

function getNativeCurrency(chainId: number): string {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  return chain?.nativeCurrency?.symbol ?? 'ETH';
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [selectedChainId, setSelectedChainIdState] = useState<number>(DEFAULT_CHAIN_ID);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (DEPLOYMENTS[parsed]) {
        setSelectedChainIdState(parsed);
      }
    }
  }, []);

  const setSelectedChainId = (id: number) => {
    setSelectedChainIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  const contracts = DEPLOYMENTS[selectedChainId] ?? DEPLOYMENTS[DEFAULT_CHAIN_ID];

  return (
    <NetworkContext.Provider
      value={{
        selectedChainId,
        setSelectedChainId,
        contracts,
        explorerUrl: getExplorerUrl(selectedChainId),
        nativeCurrency: getNativeCurrency(selectedChainId),
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
}

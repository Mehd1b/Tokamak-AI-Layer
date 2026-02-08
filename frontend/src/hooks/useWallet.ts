'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { CHAIN_ID, L1_CHAIN_ID } from '@/lib/contracts';

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isL2 = chainId === CHAIN_ID;
  const isL1 = chainId === L1_CHAIN_ID;
  const isCorrectChain = isL1 || isL2;

  return {
    address,
    isConnected,
    isConnecting,
    isCorrectChain,
    isL1,
    isL2,
    chainId,
    expectedChainId: CHAIN_ID,
    l1ChainId: L1_CHAIN_ID,
    switchToL1: () => switchChain({ chainId: L1_CHAIN_ID }),
    switchToL2: () => switchChain({ chainId: CHAIN_ID }),
  };
}

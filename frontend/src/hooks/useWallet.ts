'use client';

import { useAccount, useChainId } from 'wagmi';
import { CHAIN_ID } from '@/lib/contracts';

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();

  const isCorrectChain = chainId === CHAIN_ID;

  return {
    address,
    isConnected,
    isConnecting,
    isCorrectChain,
    chainId,
    expectedChainId: CHAIN_ID,
  };
}

'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { L1_CHAIN_ID } from '@/lib/stakingContracts';

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  return {
    address,
    isConnected,
    isConnecting,
    isL1: chainId === L1_CHAIN_ID,
    chainId,
    switchToL1: () => switchChain({ chainId: L1_CHAIN_ID }),
  };
}

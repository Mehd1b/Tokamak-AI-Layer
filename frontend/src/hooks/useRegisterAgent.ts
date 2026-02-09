'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, CHAIN_ID } from '@/lib/contracts';
import { TALIdentityRegistryABI } from '../../../sdk/src/abi/TALIdentityRegistry';

export function useRegisterAgent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = (agentURI: string) => {
    writeContract({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryABI,
      functionName: 'register',
      args: [agentURI],
      chainId: CHAIN_ID,
    });
  };

  return { register, hash, isPending, isConfirming, isSuccess, error };
}

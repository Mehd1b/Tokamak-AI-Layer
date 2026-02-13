'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, THANOS_CHAIN_ID } from '@/lib/contracts';
import { TALIdentityRegistryV2ABI } from '../../../sdk/src/abi/TALIdentityRegistryV2';

export function useDeregisterAgent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deregister = (agentId: bigint) => {
    writeContract({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'deregister',
      args: [agentId],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { deregister, hash, isPending, isConfirming, isSuccess, error };
}

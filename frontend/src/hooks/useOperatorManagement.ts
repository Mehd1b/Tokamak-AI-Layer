'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALIdentityRegistryV2ABI } from '../../../sdk/src/abi/TALIdentityRegistryV2';

export function useOperatorManagement() {
  const {
    writeContract: writeRemove,
    data: removeHash,
    isPending: isRemovePending,
  } = useWriteContract();
  const { isLoading: isRemoveConfirming } = useWaitForTransactionReceipt({ hash: removeHash });

  const {
    writeContract: writeExit,
    data: exitHash,
    isPending: isExitPending,
  } = useWriteContract();
  const { isLoading: isExitConfirming } = useWaitForTransactionReceipt({ hash: exitHash });

  const removeOperator = (agentId: bigint, operator: `0x${string}`) => {
    writeRemove({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'removeOperator',
      args: [agentId, operator],
    });
  };

  const operatorExit = (agentId: bigint) => {
    writeExit({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'operatorExit',
      args: [agentId],
    });
  };

  return {
    removeOperator,
    operatorExit,
    isRemoving: isRemovePending || isRemoveConfirming,
    isExiting: isExitPending || isExitConfirming,
    removeHash,
    exitHash,
  };
}

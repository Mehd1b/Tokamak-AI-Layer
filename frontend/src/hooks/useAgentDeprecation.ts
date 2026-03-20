'use client';

import { useReadContract } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

const DeprecationABI = [
  {
    type: 'function',
    name: 'isDeprecated',
    inputs: [{ type: 'bytes32', name: 'agentId' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSuccessor',
    inputs: [{ type: 'bytes32', name: 'agentId' }],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
] as const;

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function useAgentDeprecation(agentId: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();

  const {
    data: deprecated,
    isLoading: isDeprecatedLoading,
  } = useReadContract({
    address: contracts.agentRegistry,
    abi: DeprecationABI,
    functionName: 'isDeprecated',
    args: agentId ? [agentId] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!agentId },
  });

  const {
    data: successor,
    isLoading: isSuccessorLoading,
  } = useReadContract({
    address: contracts.agentRegistry,
    abi: DeprecationABI,
    functionName: 'getSuccessor',
    args: agentId ? [agentId] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!agentId && deprecated === true },
  });

  const successorHex = successor as `0x${string}` | undefined;

  return {
    isDeprecated: deprecated === true,
    successorAgentId: successorHex && successorHex !== ZERO_BYTES32 ? successorHex : null,
    isLoading: isDeprecatedLoading || (deprecated === true && isSuccessorLoading),
  };
}

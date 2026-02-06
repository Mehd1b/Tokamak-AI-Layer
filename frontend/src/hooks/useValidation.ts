'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALValidationRegistryABI } from '../../../sdk/src/abi/TALValidationRegistry';

export function useAgentValidations(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getAgentValidations',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  return {
    validationHashes: data as `0x${string}`[] | undefined,
    isLoading,
  };
}

export function useValidation(requestHash: `0x${string}` | undefined) {
  const enabled = !!requestHash;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getValidation',
    args: enabled ? [requestHash!] : undefined,
    query: { enabled },
  });

  return {
    validation: data as [any, any] | undefined,
    isLoading,
  };
}

export function usePendingValidationCount(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getPendingValidationCount',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  return {
    count: data as bigint | undefined,
    isLoading,
  };
}

export function useIsDisputed(requestHash: `0x${string}` | undefined) {
  const enabled = !!requestHash;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'isDisputed',
    args: enabled ? [requestHash!] : undefined,
    query: { enabled },
  });

  return {
    isDisputed: data as boolean | undefined,
    isLoading,
  };
}

'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALIdentityRegistryABI } from '../../../sdk/src/abi/TALIdentityRegistry';
import { TALIdentityRegistryV2ABI } from '../../../sdk/src/abi/TALIdentityRegistryV2';

export function useAgent(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data: owner, isLoading: ownerLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'ownerOf',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: agentURI, isLoading: uriLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'agentURI',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: isVerified, isLoading: verifiedLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'isVerifiedOperator',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: operator } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getOperator',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: zkIdentity } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getZKIdentity',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  // V2 reads
  const { data: agentStatus } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryV2ABI,
    functionName: 'getAgentStatus',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: validationModel } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryV2ABI,
    functionName: 'getAgentValidationModel',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: operators } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryV2ABI,
    functionName: 'getAgentOperators',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const isLoading = ownerLoading || uriLoading || verifiedLoading;

  return {
    agent: enabled
      ? {
          agentId,
          owner: owner as `0x${string}` | undefined,
          agentURI: agentURI as string | undefined,
          isVerifiedOperator: isVerified as boolean | undefined,
          operator: operator as `0x${string}` | undefined,
          zkIdentity: zkIdentity as `0x${string}` | undefined,
          status: agentStatus as number | undefined,
          validationModel: validationModel as number | undefined,
          operators: operators as `0x${string}`[] | undefined,
        }
      : undefined,
    isLoading,
  };
}

export function useAgentCount() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getAgentCount',
  });

  return {
    count: data as bigint | undefined,
    isLoading,
  };
}

export function useAgentsByOwner(owner: `0x${string}` | undefined) {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getAgentsByOwner',
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner },
  });

  return {
    agentIds: data as bigint[] | undefined,
    isLoading,
  };
}

interface ContractCall {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: bigint[];
}

interface ContractResult {
  status: 'success' | 'failure';
  result?: unknown;
}

export function useAgentList(count: number) {
  const limit = Math.min(count, 50);
  const enabled = count > 0;

  const contracts: ContractCall[] = [];
  for (let i = 1; i <= limit; i++) {
    contracts.push({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryABI,
      functionName: 'ownerOf',
      args: [BigInt(i)],
    });
    contracts.push({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryABI,
      functionName: 'agentURI',
      args: [BigInt(i)],
    });
    contracts.push({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentStatus',
      args: [BigInt(i)],
    });
    contracts.push({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentValidationModel',
      args: [BigInt(i)],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useReadContracts({
    contracts: contracts as any,
    query: { enabled },
  });

  const agents: Array<{
    agentId: number;
    owner: `0x${string}`;
    agentURI: string;
    status: number;
    validationModel: number;
  }> = [];
  if (data && Array.isArray(data)) {
    for (let i = 0; i < limit; i++) {
      const ownerResult = data[i * 4] as ContractResult;
      const uriResult = data[i * 4 + 1] as ContractResult;
      const statusResult = data[i * 4 + 2] as ContractResult;
      const modelResult = data[i * 4 + 3] as ContractResult;

      if (ownerResult?.status === 'success' && uriResult?.status === 'success') {
        agents.push({
          agentId: i + 1,
          owner: ownerResult.result as `0x${string}`,
          agentURI: uriResult.result as string,
          status: statusResult?.status === 'success' ? Number(statusResult.result) : 0,
          validationModel: modelResult?.status === 'success' ? Number(modelResult.result) : 0,
        });
      }
    }
  }

  return {
    agents,
    isLoading,
  };
}

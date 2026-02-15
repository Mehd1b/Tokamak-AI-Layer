'use client';

import { useState, useCallback } from 'react';
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, THANOS_CHAIN_ID } from '@/lib/contracts';
import { TALValidationRegistryABI } from '../../../sdk/src/abi/TALValidationRegistry';

// All validation reads go to Thanos Sepolia
const READ_CHAIN_ID = THANOS_CHAIN_ID;

export interface ValidationRequestData {
  agentId: bigint;
  requester: `0x${string}`;
  taskHash: `0x${string}`;
  outputHash: `0x${string}`;
  model: number;
  bounty: bigint;
  deadline: bigint;
  status: number;
}

export interface ValidationResponseData {
  validator: `0x${string}`;
  score: number;
  proof: `0x${string}`;
  detailsURI: string;
  timestamp: bigint;
}

export function useAgentValidations(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getAgentValidations',
    args: enabled ? [agentId] : undefined,
    chainId: READ_CHAIN_ID,
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
    chainId: READ_CHAIN_ID,
    query: { enabled },
  });

  return {
    validation: data as [ValidationRequestData, ValidationResponseData] | undefined,
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
    chainId: READ_CHAIN_ID,
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
    chainId: READ_CHAIN_ID,
    query: { enabled },
  });

  return {
    isDisputed: data as boolean | undefined,
    isLoading,
  };
}

export function useAllValidationHashes(agentCount: number) {
  const enabled = agentCount > 0;
  const maxAgents = Math.min(agentCount, 30);

  const contracts = Array.from({ length: maxAgents }, (_, i) => ({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getAgentValidations' as const,
    args: [BigInt(i + 1)],
    chainId: READ_CHAIN_ID,
  }));

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled },
  });

  const validations = enabled && data
    ? data.flatMap((result, idx) => {
        if (result.status === 'success' && Array.isArray(result.result)) {
          return (result.result as `0x${string}`[]).map((hash) => ({
            hash,
            agentId: BigInt(idx + 1),
          }));
        }
        return [];
      })
    : [];

  return { validations, isLoading };
}

export function useValidationBatch(hashes: `0x${string}`[]) {
  const enabled = hashes.length > 0;

  const contracts = hashes.map((hash) => ({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getValidation' as const,
    args: [hash],
    chainId: READ_CHAIN_ID,
  }));

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled },
  });

  const validations = enabled && data
    ? data
        .map((result, idx) => {
          if (result.status === 'success' && Array.isArray(result.result)) {
            const [request, response] = result.result as [ValidationRequestData, ValidationResponseData];
            return {
              hash: hashes[idx],
              request,
              response,
            };
          }
          return null;
        })
        .filter((v) => v !== null) as {
        hash: `0x${string}`;
        request: ValidationRequestData;
        response: ValidationResponseData;
      }[]
    : [];

  return { validations, isLoading };
}

export interface ValidationExecuteResult {
  taskId: string;
  score: number;
  matchType: 'exact' | 'semantic' | 'partial' | 'mismatch' | 'unknown';
  reExecutionHash: string;
  status: string;
  requestHash?: string;
  txHash?: string;
}

export function useRequestValidation() {
  const [result, setResult] = useState<ValidationExecuteResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    async (onChainAgentId: string, taskId: string, requestHash?: string) => {
      setIsValidating(true);
      setError(null);
      setResult(null);

      try {
        const payload: Record<string, string> = { taskId };
        if (requestHash) payload.requestHash = requestHash;

        const res = await fetch(
          `/api/runtime/${onChainAgentId}/validate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Validation failed (${res.status})`);
        }

        const data: ValidationExecuteResult = await res.json();
        setResult(data);
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Validation request failed';
        setError(msg);
        return null;
      } finally {
        setIsValidating(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { validate, result, isValidating, error, reset };
}

// ============ V3: Deadline Slashing ============

import { TALValidationRegistryV3ABI } from '../../../sdk/src/abi/TALValidationRegistryV3';

export function useSlashForMissedDeadline() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const slashForMissedDeadline = (requestHash: `0x${string}`) => {
    writeContract({
      address: CONTRACTS.validationRegistry,
      abi: TALValidationRegistryV3ABI,
      functionName: 'slashForMissedDeadline',
      args: [requestHash],
      chainId: READ_CHAIN_ID,
    });
  };

  return { slashForMissedDeadline, hash, isPending, isConfirming, isSuccess, error };
}

export function useSelectedValidator(requestHash: `0x${string}` | undefined) {
  const enabled = !!requestHash;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getSelectedValidator',
    args: enabled ? [requestHash!] : undefined,
    chainId: READ_CHAIN_ID,
    query: { enabled },
  });

  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const validator = data as `0x${string}` | undefined;
  const hasValidator = !!validator && validator !== zeroAddress;

  return {
    validator,
    hasValidator,
    isLoading,
  };
}

// ============ V2: Validation Stats ============

import { TALValidationRegistryV2ABI } from '../../../sdk/src/abi/TALValidationRegistryV2';

export function useValidationStats(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryV2ABI,
    functionName: 'getAgentValidationStats',
    args: enabled ? [agentId, 2592000n] : undefined, // 30 days in seconds
    chainId: READ_CHAIN_ID,
    query: { enabled },
  });

  const result = data as [bigint, bigint] | undefined;
  const total = result ? Number(result[0]) : 0;
  const failed = result ? Number(result[1]) : 0;
  const failureRate = total > 0 ? (failed / total) * 100 : 0;

  return {
    total,
    failed,
    failureRate,
    isLoading,
  };
}

// ============ On-Chain Write Hooks ============

export interface RequestValidationOnChainParams {
  agentId: bigint;
  taskHash: `0x${string}`;
  outputHash: `0x${string}`;
  model: number; // ValidationModel enum: 0=ReputationOnly, 1=StakeSecured, 2=TEEAttested, 3=Hybrid
  deadline: bigint;
  bountyWei: bigint;
}

export function useRequestValidationOnChain() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const requestValidation = (params: RequestValidationOnChainParams) => {
    writeContract({
      address: CONTRACTS.validationRegistry,
      abi: TALValidationRegistryABI,
      functionName: 'requestValidation',
      args: [params.agentId, params.taskHash, params.outputHash, params.model, params.deadline],
      value: params.bountyWei,
      chainId: READ_CHAIN_ID,
    });
  };

  // Parse requestHash from ValidationRequested event
  const VALIDATION_REQUESTED_TOPIC = '0xef181c5da8dadc79c50104e3f3b2e44f4e8a69afbf247a22f5b70c5d45b32cb7';
  let requestHash: `0x${string}` | undefined;
  if (receipt?.logs) {
    const eventLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === CONTRACTS.validationRegistry.toLowerCase() &&
        log.topics[0] === VALIDATION_REQUESTED_TOPIC,
    );
    if (eventLog?.topics[1]) {
      requestHash = eventLog.topics[1] as `0x${string}`;
    }
  }

  return { requestValidation, hash, isPending, isConfirming, isSuccess, error, receipt, requestHash };
}

export interface SubmitValidationParams {
  requestHash: `0x${string}`;
  score: number; // 0-100
  proof: `0x${string}`;
  detailsURI: string;
}

export function useSubmitValidation() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const submitValidation = (params: SubmitValidationParams) => {
    writeContract({
      address: CONTRACTS.validationRegistry,
      abi: TALValidationRegistryABI,
      functionName: 'submitValidation',
      args: [params.requestHash, params.score, params.proof, params.detailsURI],
      chainId: READ_CHAIN_ID,
    });
  };

  return { submitValidation, hash, isPending, isConfirming, isSuccess, error };
}

export interface DisputeValidationParams {
  requestHash: `0x${string}`;
  evidence: `0x${string}`;
}

export function useDisputeValidation() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const disputeValidation = (params: DisputeValidationParams) => {
    writeContract({
      address: CONTRACTS.validationRegistry,
      abi: TALValidationRegistryABI,
      functionName: 'disputeValidation',
      args: [params.requestHash, params.evidence],
      chainId: READ_CHAIN_ID,
    });
  };

  return { disputeValidation, hash, isPending, isConfirming, isSuccess, error };
}

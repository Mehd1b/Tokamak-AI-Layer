'use client';

import { useState, useCallback } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALValidationRegistryABI } from '../../../sdk/src/abi/TALValidationRegistry';

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

export function useAllValidationHashes(agentCount: number) {
  const enabled = agentCount > 0;
  const maxAgents = Math.min(agentCount, 30);

  const contracts = Array.from({ length: maxAgents }, (_, i) => ({
    address: CONTRACTS.validationRegistry,
    abi: TALValidationRegistryABI,
    functionName: 'getAgentValidations' as const,
    args: [BigInt(i + 1)],
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

const RUNTIME_URL = process.env.NEXT_PUBLIC_AGENT_RUNTIME_URL || 'http://localhost:3001';

export interface ValidationExecuteResult {
  taskId: string;
  score: number;
  matchType: 'exact' | 'semantic' | 'partial' | 'mismatch' | 'unknown';
  reExecutionHash: string;
  status: string;
}

export function useRequestValidation() {
  const [result, setResult] = useState<ValidationExecuteResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async (taskId: string) => {
    setIsValidating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${RUNTIME_URL}/api/validations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Validation failed (${res.status})`);
      }

      const data: ValidationExecuteResult = await res.json();
      setResult(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Validation request failed';
      setError(msg);
      return null;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { validate, result, isValidating, error, reset };
}

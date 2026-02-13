'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import { CONTRACTS, THANOS_CHAIN_ID } from '@/lib/contracts';
import { TALReputationRegistryABI } from '../../../sdk/src/abi/TALReputationRegistry';

export interface FeedbackParams {
  agentId: bigint;
  rating: number; // 1-5 stars
  category: string;
  comment?: string;
}

export function useSubmitFeedback() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const submitFeedback = (params: FeedbackParams) => {
    // Map 1-5 stars to int128 value with 1 decimal (10, 20, 30, 40, 50)
    const value = BigInt(params.rating * 10);
    const valueDecimals = 1;

    const tag1 = params.category || 'general';
    const tag2 = '';
    const endpoint = '';
    const feedbackURI = params.comment || '';
    const feedbackHash = feedbackURI
      ? keccak256(toBytes(feedbackURI))
      : ('0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`);

    writeContract({
      address: CONTRACTS.reputationRegistry,
      abi: TALReputationRegistryABI,
      functionName: 'submitFeedback',
      args: [params.agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { submitFeedback, hash, isPending, isConfirming, isSuccess, error };
}

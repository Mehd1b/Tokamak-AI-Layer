'use client';

import { useReadContract } from 'wagmi';
import { KERNEL_CONTRACTS, KernelExecutionVerifierABI } from '@/lib/contracts';

export function useVerifyProof(
  imageId: `0x${string}` | undefined,
  journal: `0x${string}` | undefined,
  seal: `0x${string}` | undefined,
) {
  return useReadContract({
    address: KERNEL_CONTRACTS.kernelExecutionVerifier as `0x${string}`,
    abi: KernelExecutionVerifierABI,
    functionName: 'verifyAndParseWithImageId',
    args: imageId && journal && seal ? [imageId, journal, seal] : undefined,
    query: { enabled: !!imageId && !!journal && !!seal },
  });
}

export function useParseJournal(journal: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.kernelExecutionVerifier as `0x${string}`,
    abi: KernelExecutionVerifierABI,
    functionName: 'parseJournal',
    args: journal ? [journal] : undefined,
    query: { enabled: !!journal },
  });
}

'use client';

import { useReadContract } from 'wagmi';
import { KernelExecutionVerifierABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

export function useVerifyProof(
  imageId: `0x${string}` | undefined,
  journal: `0x${string}` | undefined,
  seal: `0x${string}` | undefined,
) {
  const { contracts, selectedChainId } = useNetwork();
  return useReadContract({
    address: contracts.kernelExecutionVerifier,
    abi: KernelExecutionVerifierABI,
    functionName: 'verifyAndParseWithImageId',
    args: imageId && journal && seal ? [imageId, journal, seal] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!imageId && !!journal && !!seal },
  });
}

export function useParseJournal(journal: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();
  return useReadContract({
    address: contracts.kernelExecutionVerifier,
    abi: KernelExecutionVerifierABI,
    functionName: 'parseJournal',
    args: journal ? [journal] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!journal },
  });
}

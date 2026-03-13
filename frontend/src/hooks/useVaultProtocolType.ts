'use client';

import { useReadContract, usePublicClient } from 'wagmi';
import { VaultFactoryABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';
import { PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';

/**
 * Read the protocol type for a single vault from VaultFactory.
 * Falls back to GENERIC (0) if the factory hasn't been upgraded yet.
 */
export function useVaultProtocolType(vaultAddress: `0x${string}` | undefined): ProtocolType {
  const { contracts, selectedChainId } = useNetwork();

  const result = useReadContract({
    address: contracts.vaultFactory,
    abi: VaultFactoryABI,
    functionName: 'vaultProtocolType',
    args: vaultAddress ? [vaultAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  if (result.data !== undefined) {
    return result.data as ProtocolType;
  }

  return PROTOCOL_TYPE.GENERIC;
}

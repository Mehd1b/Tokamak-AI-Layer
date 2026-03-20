'use client';

import { useReadContract } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

const BondManagerViewABI = [
  { type: 'function', name: 'getBondInfo', inputs: [{ type: 'address', name: 'operator' }, { type: 'address', name: 'vault' }, { type: 'uint64', name: 'nonce' }], outputs: [{ type: 'uint256', name: 'amount' }, { type: 'uint256', name: 'lockedAt' }, { type: 'uint8', name: 'status' }], stateMutability: 'view' },
  { type: 'function', name: 'totalBonded', inputs: [{ type: 'address', name: 'operator' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLockedGlobal', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'FINDER_FEE_BPS', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'DEPOSITOR_SHARE_BPS', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'TREASURY_SHARE_BPS', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'BOND_EXPIRY', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'trustedRelayer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

export interface BondDetails {
  totalLockedGlobal: bigint | undefined;
  finderFeeBps: number;
  depositorShareBps: number;
  treasuryShareBps: number;
  bondExpiry: bigint | undefined;
  trustedRelayer: string | undefined;
  isLoading: boolean;
}

export function useBondDetails(bondManagerAddress: `0x${string}`): BondDetails {
  const { selectedChainId } = useNetwork();

  const { data: totalLockedGlobal, isLoading: isLoadingGlobal } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'totalLockedGlobal',
    chainId: selectedChainId,
  });

  const { data: finderFeeBps, isLoading: isLoadingFinder } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'FINDER_FEE_BPS',
    chainId: selectedChainId,
  });

  const { data: depositorShareBps, isLoading: isLoadingDepositor } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'DEPOSITOR_SHARE_BPS',
    chainId: selectedChainId,
  });

  const { data: treasuryShareBps, isLoading: isLoadingTreasury } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'TREASURY_SHARE_BPS',
    chainId: selectedChainId,
  });

  const { data: bondExpiry, isLoading: isLoadingExpiry } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'BOND_EXPIRY',
    chainId: selectedChainId,
  });

  const { data: trustedRelayer, isLoading: isLoadingRelayer } = useReadContract({
    address: bondManagerAddress,
    abi: BondManagerViewABI,
    functionName: 'trustedRelayer',
    chainId: selectedChainId,
  });

  const isLoading =
    isLoadingGlobal ||
    isLoadingFinder ||
    isLoadingDepositor ||
    isLoadingTreasury ||
    isLoadingExpiry ||
    isLoadingRelayer;

  return {
    totalLockedGlobal: totalLockedGlobal as bigint | undefined,
    finderFeeBps: finderFeeBps !== undefined ? Number(finderFeeBps) : 1000,
    depositorShareBps: depositorShareBps !== undefined ? Number(depositorShareBps) : 8000,
    treasuryShareBps: treasuryShareBps !== undefined ? Number(treasuryShareBps) : 1000,
    bondExpiry: bondExpiry as bigint | undefined,
    trustedRelayer: trustedRelayer as string | undefined,
    isLoading,
  };
}

'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { useLegacyGas } from '@/hooks/useLegacyGas';

// ---------- ABI fragments ----------
// BuilderProgram is new and not yet in @ek-sdk. Inline the ABI until the SDK
// is updated. Only the functions consumed by the frontend are listed.

const BuilderProgramABI = [
  {
    type: 'function',
    name: 'builders',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'builderAddress', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'totalTvl', type: 'uint256' },
      { name: 'totalFeesEarned', type: 'uint256' },
      { name: 'totalExecutions', type: 'uint256' },
      { name: 'tier', type: 'uint8' },
      { name: 'registeredAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTier',
    inputs: [{ name: 'builder', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getFeeSplit',
    inputs: [{ name: 'builder', type: 'address' }],
    outputs: [
      { name: 'builderBps', type: 'uint256' },
      { name: 'protocolBps', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClaimable',
    inputs: [{ name: 'builder', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBuilderStats',
    inputs: [{ name: 'builder', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'builderAddress', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'totalTvl', type: 'uint256' },
          { name: 'totalFeesEarned', type: 'uint256' },
          { name: 'totalExecutions', type: 'uint256' },
          { name: 'tier', type: 'uint8' },
          { name: 'registeredAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLeaderboard',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'result',
        type: 'tuple[]',
        components: [
          { name: 'builderAddress', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'totalTvl', type: 'uint256' },
          { name: 'totalFeesEarned', type: 'uint256' },
          { name: 'totalExecutions', type: 'uint256' },
          { name: 'tier', type: 'uint8' },
          { name: 'registeredAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'builderCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'registerBuilder',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimGrant',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'grants',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'totalAmount', type: 'uint256' },
      { name: 'claimed', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'vestingDuration', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const;

export { BuilderProgramABI };

// ---------- Address helper ----------

/**
 * Get the BuilderProgram address for the current network.
 * Falls back to env var if not in deployment config.
 */
export function useBuilderProgramAddress(): `0x${string}` | undefined {
  const { contracts } = useNetwork();
  return (
    ((contracts as any).builderProgram as `0x${string}` | undefined) ??
    (process.env.NEXT_PUBLIC_BUILDER_PROGRAM as `0x${string}` | undefined)
  );
}

/**
 * Check if the BuilderProgram contract is available on the current network.
 */
export function useBuilderProgramAvailable(): boolean {
  const addr = useBuilderProgramAddress();
  return !!addr;
}

// ---------- Types ----------

export interface BuilderData {
  builderAddress: string;
  name: string;
  url: string;
  totalTvl: bigint;
  totalFeesEarned: bigint;
  totalExecutions: bigint;
  tier: number; // 0=Bronze, 1=Silver, 2=Gold
  registeredAt: bigint;
}

export interface FeeSplit {
  builderBps: bigint;
  protocolBps: bigint;
}

// ---------- Read hooks ----------

/**
 * Read the full Builder struct for an address.
 */
export function useBuilderStats(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'getBuilderStats',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!programAddress && !!address },
  });
}

/**
 * Read the tier for a builder.
 */
export function useBuilderTier(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'getTier',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!programAddress && !!address },
  });
}

/**
 * Read the fee split for a builder.
 */
export function useBuilderFeeSplit(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'getFeeSplit',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!programAddress && !!address },
  });
}

/**
 * Read the claimable grant amount for a builder.
 */
export function useBuilderClaimable(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'getClaimable',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!programAddress && !!address },
  });
}

/**
 * Read the grant details for a builder.
 */
export function useBuilderGrant(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'grants',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!programAddress && !!address },
  });
}

/**
 * Read the leaderboard (paginated, sorted by TVL desc).
 */
export function useLeaderboard(offset: bigint, limit: bigint) {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'getLeaderboard',
    args: [offset, limit],
    chainId: selectedChainId,
    query: { enabled: !!programAddress },
  });
}

/**
 * Read the total builder count.
 */
export function useBuilderCount() {
  const { selectedChainId } = useNetwork();
  const programAddress = useBuilderProgramAddress();

  return useReadContract({
    address: programAddress,
    abi: BuilderProgramABI,
    functionName: 'builderCount',
    chainId: selectedChainId,
    query: { enabled: !!programAddress },
  });
}

// ---------- Write hooks ----------

/**
 * Register as a builder.
 */
export function useRegisterBuilder() {
  const programAddress = useBuilderProgramAddress();
  const gasOverrides = useLegacyGas();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const registerBuilder = (name: string, url: string) => {
    if (!programAddress) return;
    writeContract({
      address: programAddress,
      abi: BuilderProgramABI,
      functionName: 'registerBuilder',
      args: [name, url],
      ...gasOverrides,
    });
  };

  return { registerBuilder, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Claim vested grant tokens.
 */
export function useClaimGrant() {
  const programAddress = useBuilderProgramAddress();
  const gasOverrides = useLegacyGas();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimGrant = () => {
    if (!programAddress) return;
    writeContract({
      address: programAddress,
      abi: BuilderProgramABI,
      functionName: 'claimGrant',
      ...gasOverrides,
    });
  };

  return { claimGrant, hash, isPending, isConfirming, isSuccess, error };
}

// ---------- Composite hook ----------

/**
 * Composite hook that aggregates all builder data for the connected wallet.
 * Returns: { builder, tier, feeSplit, claimable, isRegistered, isLoading }
 */
export function useBuilder(address: `0x${string}` | undefined) {
  const { data: stats, isLoading: statsLoading } = useBuilderStats(address);
  const { data: tier, isLoading: tierLoading } = useBuilderTier(address);
  const { data: feeSplitRaw, isLoading: feeSplitLoading } = useBuilderFeeSplit(address);
  const { data: claimable, isLoading: claimableLoading } = useBuilderClaimable(address);
  const { data: grant, isLoading: grantLoading } = useBuilderGrant(address);

  const isLoading = statsLoading || tierLoading || feeSplitLoading || claimableLoading || grantLoading;

  // A builder is registered if registeredAt > 0
  const builderStats = stats as BuilderData | undefined;
  const isRegistered = builderStats ? builderStats.registeredAt > 0n : false;

  const feeSplit: FeeSplit | undefined = feeSplitRaw
    ? {
        builderBps: (feeSplitRaw as [bigint, bigint])[0],
        protocolBps: (feeSplitRaw as [bigint, bigint])[1],
      }
    : undefined;

  const grantData = grant
    ? {
        totalAmount: (grant as [bigint, bigint, bigint, bigint])[0],
        claimed: (grant as [bigint, bigint, bigint, bigint])[1],
        startTime: (grant as [bigint, bigint, bigint, bigint])[2],
        vestingDuration: (grant as [bigint, bigint, bigint, bigint])[3],
      }
    : undefined;

  return {
    builder: builderStats,
    tier: tier as number | undefined,
    feeSplit,
    claimable: claimable as bigint | undefined,
    grant: grantData,
    isRegistered,
    isLoading,
  };
}

// Server-side only — no NEXT_PUBLIC_ prefix
export const THANOS_RPC_URL =
  process.env.THANOS_RPC_URL || 'https://rpc.thanos-sepolia.tokamak.network';

export const IDENTITY_REGISTRY_ADDRESS =
  '0x3f89CD27fD877827E7665A9883b3c0180E22A525' as const;

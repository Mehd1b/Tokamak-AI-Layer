import type { Address } from "viem";

export const THANOS_SEPOLIA_ADDRESSES = {
  TALIdentityRegistry: "0x3f89CD27fD877827E7665A9883b3c0180E22A525" as Address,
  TALReputationRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b" as Address,
  TALValidationRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3" as Address,
  TaskFeeEscrow: "0x6D68Cd8fD89BF1746A1948783C92A00E591d1227" as Address,
  StakingIntegrationModule: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30" as Address,
} as const;

export type ContractName = keyof typeof THANOS_SEPOLIA_ADDRESSES;

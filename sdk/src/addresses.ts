export interface DeploymentAddresses {
  agentRegistry: `0x${string}`;
  vaultFactory: `0x${string}`;
  kernelExecutionVerifier: `0x${string}`;
  riscZeroVerifierRouter: `0x${string}`;
  referralManager?: `0x${string}`;
  pointsProgram?: `0x${string}`;
  builderProgram?: `0x${string}`;
}

export const ETHEREUM_MAINNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0x2BF56f889Ab5E535C3194bB2B356f10D6fa2FBEc',
  vaultFactory: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
  kernelExecutionVerifier: '0x5c0F88e27FADAb50EA82572950a616b4Cf4fd8B3',
  riscZeroVerifierRouter: '0x8EaB2D97Dfce405A1692a21b3ff3A172d593D319',
  pointsProgram: '0xcd1ade9a9dc45e2008d7246735bcfaa7ac430b5f',
  builderProgram: '0xd27a7470a34903b7e215ea8d07d9cd2d21238f83',
  referralManager: '0xEE8CBCE6c590fE4c6E1C2E59094f302139101bB0',
} as const;

export const HYPEREVM_MAINNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
  vaultFactory: '0xd27A7470a34903b7e215EA8d07d9cd2d21238F83',
  kernelExecutionVerifier: '0xD1478689f829c4B4F882eB8Ef7914C7874ddC707',
  riscZeroVerifierRouter: '0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8',
  pointsProgram: '0xb391DC76133D39280fA5348e1119ba67A4418170',
  builderProgram: '0x27ce5DEC1162D395B5Fce025458e8e8878212443',
  referralManager: '0x129576fBaCBCD2deA03b46D408cf0Aa96FC01ABe',
} as const;

export const SEPOLIA_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
  vaultFactory: '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
  kernelExecutionVerifier: '0x1eB41537037fB771CBA8Cd088C7c806936325eB5',
  riscZeroVerifierRouter: '0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187',
} as const;

export const HYPEREVM_TESTNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0x09447147C6E75a60A449f38532F06E19F5F632F3',
  vaultFactory: '0x4c36bCA87f21E16f5af8A6d7Df2D86a5aD13049F',
  kernelExecutionVerifier: '0x0052258E517835081c94c0B685409f2EfC4D502b',
  riscZeroVerifierRouter: '0x0000000000000000000000000000000000000000',
} as const;

export const ARBITRUM_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xa6b363872aC1AA91Bc6a270958A06230c10aa473',
  vaultFactory: '0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611',
  kernelExecutionVerifier: '0x936782d6bB65C75dFeC03228d1a5cb5d38C59318',
  riscZeroVerifierRouter: '0x0b144e07a0826182b6b59788c34b32bfa86fb711',
  pointsProgram: '0x5a14e3b99813277c4ecca298f9810870f087ee58',
  builderProgram: '0x5c0f88e27fadab50ea82572950a616b4cf4fd8b3',
  referralManager: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
} as const;

export const OPTIMISM_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xa6b363872aC1AA91Bc6a270958A06230c10aa473',
  vaultFactory: '0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611',
  kernelExecutionVerifier: '0x936782d6bB65C75dFeC03228d1a5cb5d38C59318',
  riscZeroVerifierRouter: '0x0b144e07a0826182b6b59788c34b32bfa86fb711',
  pointsProgram: '0x5a14e3b99813277c4ecca298f9810870f087ee58',
  builderProgram: '0x5c0f88e27fadab50ea82572950a616b4cf4fd8b3',
  referralManager: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
} as const;

export const POLYGON_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611',
  vaultFactory: '0x0eDa0bCFBFc51Ab245F078AEFa3ee42cB384c865',
  kernelExecutionVerifier: '0x5A14E3b99813277c4EcCA298f9810870f087eE58',
  riscZeroVerifierRouter: '0x496b30da136c364975229682dfefd8218a21a6ec',
  referralManager: '0xd1478689f829c4b4f882eb8ef7914c7874ddc707',
} as const;

export const DEPLOYMENTS: Record<number, DeploymentAddresses> = {
  1: ETHEREUM_MAINNET_ADDRESSES,
  999: HYPEREVM_MAINNET_ADDRESSES,
  42161: ARBITRUM_ADDRESSES,
  10: OPTIMISM_ADDRESSES,
  137: POLYGON_ADDRESSES,
  11155111: SEPOLIA_ADDRESSES,
  998: HYPEREVM_TESTNET_ADDRESSES,
} as const;

export const DEFAULT_CHAIN_ID = 1;

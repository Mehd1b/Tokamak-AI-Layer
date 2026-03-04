export interface DeploymentAddresses {
  agentRegistry: `0x${string}`;
  vaultFactory: `0x${string}`;
  kernelExecutionVerifier: `0x${string}`;
  riscZeroVerifierRouter: `0x${string}`;
}

export const ETHEREUM_MAINNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xFa0AAEe4482C7901653855F591B832E7E8a20727',
  vaultFactory: '0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822',
  kernelExecutionVerifier: '0xAf58D2191772bcFFB3260F5140E995ec79e4d88B',
  riscZeroVerifierRouter: '0x8EaB2D97Dfce405A1692a21b3ff3A172d593D319',
} as const;

export const HYPEREVM_MAINNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xAf58D2191772bcFFB3260F5140E995ec79e4d88B',
  vaultFactory: '0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB',
  kernelExecutionVerifier: '0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30',
  riscZeroVerifierRouter: '0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8',
} as const;

export const SEPOLIA_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
  vaultFactory: '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
  kernelExecutionVerifier: '0x1eB41537037fB771CBA8Cd088C7c806936325eB5',
  riscZeroVerifierRouter: '0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187',
} as const;

export const HYPEREVM_TESTNET_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0x09447147C6E75a60A449f38532F06E19F5F632F3',
  vaultFactory: '0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB',
  kernelExecutionVerifier: '0x0052258E517835081c94c0B685409f2EfC4D502b',
  riscZeroVerifierRouter: '0x0000000000000000000000000000000000000000',
} as const;

export const DEPLOYMENTS: Record<number, DeploymentAddresses> = {
  1: ETHEREUM_MAINNET_ADDRESSES,
  999: HYPEREVM_MAINNET_ADDRESSES,
  11155111: SEPOLIA_ADDRESSES,
  998: HYPEREVM_TESTNET_ADDRESSES,
} as const;

export const DEFAULT_CHAIN_ID = 1;

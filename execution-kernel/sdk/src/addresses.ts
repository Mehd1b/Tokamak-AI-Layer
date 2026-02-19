export interface DeploymentAddresses {
  agentRegistry: `0x${string}`;
  vaultFactory: `0x${string}`;
  kernelExecutionVerifier: `0x${string}`;
  riscZeroVerifierRouter: `0x${string}`;
}

export const SEPOLIA_ADDRESSES: DeploymentAddresses = {
  agentRegistry: '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
  vaultFactory: '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
  kernelExecutionVerifier: '0x1eB41537037fB771CBA8Cd088C7c806936325eB5',
  riscZeroVerifierRouter: '0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187',
} as const;

export const DEPLOYMENTS: Record<string, DeploymentAddresses> = {
  sepolia: SEPOLIA_ADDRESSES,
} as const;

export const DEFAULT_CHAIN_ID = 11155420; // Optimism Sepolia

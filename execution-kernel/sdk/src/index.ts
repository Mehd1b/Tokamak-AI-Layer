// Facade
export { ExecutionKernelClient } from './ExecutionKernelClient';

// Domain clients
export { AgentRegistryClient } from './clients/AgentRegistryClient';
export { VaultFactoryClient } from './clients/VaultFactoryClient';
export { KernelVaultClient } from './clients/KernelVaultClient';
export { VerifierClient } from './clients/VerifierClient';

// ABIs
export { AgentRegistryABI } from './abi/AgentRegistry';
export { VaultFactoryABI } from './abi/VaultFactory';
export { KernelVaultABI } from './abi/KernelVault';
export { KernelExecutionVerifierABI } from './abi/KernelExecutionVerifier';

// Types
export type {
  KernelInput,
  KernelJournal,
  ParsedJournal,
  KernelAction,
  KernelAgentInfo,
  KernelVaultInfo,
  DeployVaultParams,
  ExecuteParams,
  ExecutionKernelConfig,
} from './types';

export {
  KernelActionType,
  ExecutionStatus,
  OPTIMISM_SEPOLIA_ADDRESSES,
  DEFAULT_CHAIN_ID,
  DEPLOYMENTS,
} from './types';

export type { DeploymentAddresses } from './addresses';
export { SEPOLIA_ADDRESSES } from './addresses';

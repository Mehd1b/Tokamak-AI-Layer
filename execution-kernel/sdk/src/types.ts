// ============ Enums ============

export enum KernelActionType {
  CALL = 0x02,
  TRANSFER_ERC20 = 0x03,
  NO_OP = 0x04,
}

export enum ExecutionStatus {
  Success = 0x01,
  Failure = 0x02,
}

// ============ Kernel I/O Types ============

export interface KernelInput {
  protocolVersion: number;
  kernelVersion: number;
  agentId: `0x${string}`;
  agentCodeHash: `0x${string}`;
  constraintSetHash: `0x${string}`;
  inputRoot: `0x${string}`;
  executionNonce: bigint;
  opaqueAgentInputs: `0x${string}`;
}

export interface KernelJournal extends KernelInput {
  inputCommitment: `0x${string}`;
  actionCommitment: `0x${string}`;
  executionStatus: ExecutionStatus;
}

export interface ParsedJournal {
  agentId: `0x${string}`;
  agentCodeHash: `0x${string}`;
  constraintSetHash: `0x${string}`;
  inputRoot: `0x${string}`;
  executionNonce: bigint;
  inputCommitment: `0x${string}`;
  actionCommitment: `0x${string}`;
}

// ============ Action Types ============

export interface KernelAction {
  actionType: KernelActionType;
  target: `0x${string}`;
  payload: `0x${string}`;
}

// ============ Agent Types ============

export interface KernelAgentInfo {
  agentId: `0x${string}`;
  author: `0x${string}`;
  imageId: `0x${string}`;
  agentCodeHash: `0x${string}`;
  metadataURI: string;
  exists: boolean;
}

// ============ Vault Types ============

export interface KernelVaultInfo {
  address: `0x${string}`;
  owner: `0x${string}`;
  agentId: `0x${string}`;
  asset: `0x${string}`;
  totalAssets: bigint;
  totalShares: bigint;
  userShares: bigint;
  userAssets: bigint;
}

export interface DeployVaultParams {
  agentId: `0x${string}`;
  asset: `0x${string}`;
  userSalt: `0x${string}`;
}

export interface ExecuteParams {
  journal: `0x${string}`;
  seal: `0x${string}`;
  agentOutputBytes: `0x${string}`;
}

// ============ Config ============

export interface ExecutionKernelConfig {
  chainId?: number;
  rpcUrl?: string;
  agentRegistry: `0x${string}`;
  vaultFactory: `0x${string}`;
  kernelExecutionVerifier: `0x${string}`;
  walletClient?: any;
  publicClient?: any;
}

// ============ Deployed Addresses ============

export const OPTIMISM_SEPOLIA_ADDRESSES = {
  agentRegistry: '0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA' as `0x${string}`,
  vaultFactory: '0x3bB48a146bBC50F8990c86787a41185A6fC474d2' as `0x${string}`,
  kernelExecutionVerifier: '0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA' as `0x${string}`,
} as const;

export const DEFAULT_CHAIN_ID = 11155420; // Optimism Sepolia

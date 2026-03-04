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
  totalValueLocked: bigint;
  userShares: bigint;
  userAssets: bigint;
}

export interface DeployVaultParams {
  agentId: `0x${string}`;
  asset: `0x${string}`;
  userSalt: `0x${string}`;
  expectedImageId: `0x${string}`;
}

export interface ExecuteParams {
  journal: `0x${string}`;
  seal: `0x${string}`;
  agentOutputBytes: `0x${string}`;
}

// ============ Config ============

import type { PublicClient, WalletClient } from 'viem';

export interface ExecutionKernelConfig {
  chainId?: number;
  rpcUrl?: string;
  agentRegistry?: `0x${string}`;
  vaultFactory?: `0x${string}`;
  kernelExecutionVerifier?: `0x${string}`;
  walletClient?: WalletClient;
  publicClient?: PublicClient;
}

// ============ Deployed Addresses (re-exported from addresses.ts) ============

export { SEPOLIA_ADDRESSES as OPTIMISM_SEPOLIA_ADDRESSES, DEPLOYMENTS, DEFAULT_CHAIN_ID } from './addresses';
export type { DeploymentAddresses } from './addresses';

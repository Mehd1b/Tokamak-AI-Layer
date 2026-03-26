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

export interface PerformanceMetrics {
  currentPps: bigint;
  initialPps: bigint;
  peakPps: bigint;
  maxDrawdownBps: number;
  executionCount: number;
  executionWins: number;
  winRate: number;              // executionWins / executionCount * 100
  allTimeReturnPct: number;     // (currentPps - initialPps) / initialPps * 100
  ppsHistory: { timestamp: number; value: bigint }[];
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

// ============ Execution History ============

export interface ExecutionRecord {
  nonce: bigint;
  actionCommitment: `0x${string}`;
  actionCount: number;
  timestamp: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

// ============ Portfolio Types ============

export interface UserVaultPosition {
  vaultAddress: `0x${string}`;
  agentId: `0x${string}`;
  asset: `0x${string}`;
  shares: bigint;
  assetsValue: bigint;
  pnl: bigint;
  totalDeposited: bigint;
}

export interface UserPortfolio {
  vaults: UserVaultPosition[];
  totalValue: bigint;
  totalPnL: bigint;
}

// ============ Vault Returns ============

export interface VaultReturns {
  return7d: number | null;
  return30d: number | null;
  allTime: number;
  maxDrawdown: number;
}

// ============ PPS History ============

export interface PpsHistoryData {
  timestamps: number[];
  values: bigint[];
}

// ============ Agent Metadata ============

export interface AgentMetadata {
  name: string;
  description: string;
  author: string;
  strategy: string;
  tags: string[];
  website?: string;
  twitter?: string;
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

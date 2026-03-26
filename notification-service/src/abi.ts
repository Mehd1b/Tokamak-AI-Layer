/**
 * Subset of the KernelVault ABI used by the notification service.
 * Mirrors sdk/src/abi/KernelVault.ts — kept local to avoid cross-package dependency in MVP.
 */
export const KernelVaultABI = [
  {
    type: 'event',
    name: 'ExecutionApplied',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'executionNonce', type: 'uint64', indexed: true },
      { name: 'actionCommitment', type: 'bytes32', indexed: false },
      { name: 'actionCount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalShares',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'preExecutionPps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalExecutionCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

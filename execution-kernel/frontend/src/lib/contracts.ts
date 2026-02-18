export const KERNEL_CONTRACTS = {
  agentRegistry: '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
  vaultFactory: '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
  kernelExecutionVerifier: '0x1eB41537037fB771CBA8Cd088C7c806936325eB5',
  riscZeroVerifierRouter: '0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187',
} as const;

export const AgentRegistryABI = [
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address', internalType: 'address' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'computeAgentId',
    inputs: [
      { name: 'author', type: 'address', internalType: 'address' },
      { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
      { name: 'imageId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'agentCodeHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'agentId', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'update',
    inputs: [
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'newImageId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'newAgentCodeHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unregister',
    inputs: [
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'vaults', type: 'address[]', internalType: 'address[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AgentUnregistered',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'author', type: 'address', indexed: true, internalType: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'get',
    inputs: [{ name: 'agentId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        internalType: 'struct IAgentRegistry.AgentInfo',
        components: [
          { name: 'author', type: 'address', internalType: 'address' },
          { name: 'imageId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32', internalType: 'bytes32' },
          { name: '_deprecated', type: 'string', internalType: 'string' },
          { name: 'exists', type: 'bool', internalType: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentExists',
    inputs: [{ name: 'agentId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentAt',
    inputs: [{ name: 'index', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllAgentIds',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32[]', internalType: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'author', type: 'address', indexed: true, internalType: 'address' },
      { name: 'imageId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'agentCodeHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'AgentUpdated',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'newImageId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'newAgentCodeHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
] as const;

export const VaultFactoryABI = [
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address', internalType: 'address' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'computeVaultAddress',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'asset', type: 'address', internalType: 'address' },
      { name: 'userSalt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'vault', type: 'address', internalType: 'address' },
      { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deployVault',
    inputs: [
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'asset', type: 'address', internalType: 'address' },
      { name: 'userSalt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isDeployedVault',
    inputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'registry',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifier',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultAt',
    inputs: [{ name: 'index', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllVaults',
    inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vault', type: 'address', indexed: true, internalType: 'address' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'asset', type: 'address', indexed: false, internalType: 'address' },
      { name: 'trustedImageId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'salt', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
] as const;

export const KernelVaultABI = [
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IERC20' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentId',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'trustedImageId',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalShares',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'shares',
    inputs: [{ name: 'depositor', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lastExecutionNonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lastExecutionTimestamp',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'convertToShares',
    inputs: [{ name: 'assets', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'convertToAssets',
    inputs: [{ name: '_shares', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'depositERC20Tokens',
    inputs: [{ name: 'assets', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'sharesMinted', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'depositETH',
    inputs: [],
    outputs: [{ name: 'sharesMinted', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'shareAmount', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'assetsOut', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'journal', type: 'bytes', internalType: 'bytes' },
      { name: 'seal', type: 'bytes', internalType: 'bytes' },
      { name: 'agentOutputBytes', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'sender', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'shares', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'sender', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'shares', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ExecutionApplied',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'executionNonce', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'actionCommitment', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'actionCount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
] as const;

export const KernelExecutionVerifierABI = [
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address', internalType: 'address' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'verifyAndParseWithImageId',
    inputs: [
      { name: 'expectedImageId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'journal', type: 'bytes', internalType: 'bytes' },
      { name: 'seal', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [
      {
        name: 'parsed',
        type: 'tuple',
        internalType: 'struct IKernelExecutionVerifier.ParsedJournal',
        components: [
          { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'constraintSetHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'inputRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'executionNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'inputCommitment', type: 'bytes32', internalType: 'bytes32' },
          { name: 'actionCommitment', type: 'bytes32', internalType: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'parseJournal',
    inputs: [{ name: 'journal', type: 'bytes', internalType: 'bytes' }],
    outputs: [
      {
        name: 'parsed',
        type: 'tuple',
        internalType: 'struct IKernelExecutionVerifier.ParsedJournal',
        components: [
          { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'constraintSetHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'inputRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'executionNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'inputCommitment', type: 'bytes32', internalType: 'bytes32' },
          { name: 'actionCommitment', type: 'bytes32', internalType: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'pure',
  },
] as const;

export const KERNEL_CONTRACTS = {
  agentRegistry: '0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA',
  vaultFactory: '0x3bB48a146bBC50F8990c86787a41185A6fC474d2',
  kernelExecutionVerifier: '0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA',
  riscZeroVerifierRouter: '0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187',
} as const;

export const AgentRegistryABI = [
  {
    type: 'function',
    name: 'computeAgentId',
    inputs: [
      { name: 'author', type: 'address', internalType: 'address' },
      { name: 'codehash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'codehash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'imageId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'configHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'metadataURI', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'get',
    inputs: [{ name: 'agentId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct AgentRegistry.Agent',
        components: [
          { name: 'author', type: 'address', internalType: 'address' },
          { name: 'codehash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'imageId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'metadataURI', type: 'string', internalType: 'string' },
          { name: 'active', type: 'bool', internalType: 'bool' },
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
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'author', type: 'address', indexed: true, internalType: 'address' },
      { name: 'codehash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'imageId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
] as const;

export const VaultFactoryABI = [
  {
    type: 'function',
    name: 'computeVaultAddress',
    inputs: [
      { name: 'deployer', type: 'address', internalType: 'address' },
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'asset', type: 'address', internalType: 'address' },
      { name: 'trustedImageId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'predicted', type: 'address', internalType: 'address' },
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
      { name: 'trustedImageId', type: 'bytes32', internalType: 'bytes32' },
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
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vault', type: 'address', indexed: true, internalType: 'address' },
      { name: 'deployer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'asset', type: 'address', indexed: false, internalType: 'address' },
    ],
  },
] as const;

export const KernelVaultABI = [
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
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
    inputs: [{ name: 'shares', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'depositERC20Tokens',
    inputs: [{ name: 'amount', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'sharesOut', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'depositETH',
    inputs: [],
    outputs: [{ name: 'sharesOut', type: 'uint256', internalType: 'uint256' }],
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
    name: 'ExecutionApplied',
    inputs: [
      { name: 'nonce', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'oldStateRoot', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'newStateRoot', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true, internalType: 'address' },
      { name: 'assets', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'shares', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true, internalType: 'address' },
      { name: 'assets', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'shares', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
] as const;

export const KernelExecutionVerifierABI = [
  {
    type: 'function',
    name: 'verifyAndParseWithImageId',
    inputs: [
      { name: 'imageId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'journal', type: 'bytes', internalType: 'bytes' },
      { name: 'seal', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct KernelExecutionVerifier.JournalFields',
        components: [
          { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'vaultAddress', type: 'bytes32', internalType: 'bytes32' },
          { name: 'oldStateRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'newStateRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'nonce', type: 'uint64', internalType: 'uint64' },
          { name: 'actionHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'configHash', type: 'bytes32', internalType: 'bytes32' },
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
        name: '',
        type: 'tuple',
        internalType: 'struct KernelExecutionVerifier.JournalFields',
        components: [
          { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'vaultAddress', type: 'bytes32', internalType: 'bytes32' },
          { name: 'oldStateRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'newStateRoot', type: 'bytes32', internalType: 'bytes32' },
          { name: 'nonce', type: 'uint64', internalType: 'uint64' },
          { name: 'actionHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'configHash', type: 'bytes32', internalType: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'pure',
  },
] as const;

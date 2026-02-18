export const AgentRegistryABI = [
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'computeAgentId',
    inputs: [
      { name: 'author', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'salt', type: 'bytes32' },
      { name: 'imageId', type: 'bytes32' },
      { name: 'agentCodeHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'agentId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'update',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'newImageId', type: 'bytes32' },
      { name: 'newAgentCodeHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'get',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'author', type: 'address' },
          { name: 'imageId', type: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32' },
          { name: '_deprecated', type: 'string' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentExists',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'imageId', type: 'bytes32', indexed: true },
      { name: 'agentCodeHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentUpdated',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'newImageId', type: 'bytes32', indexed: true },
      { name: 'newAgentCodeHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'error',
    name: 'AgentAlreadyExists',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'AgentNotFound',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'NotAgentAuthor',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'caller', type: 'address' },
      { name: 'author', type: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'InvalidImageId',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAgentCodeHash',
    inputs: [],
  },
] as const;

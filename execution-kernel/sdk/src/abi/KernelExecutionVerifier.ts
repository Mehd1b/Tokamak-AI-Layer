export const KernelExecutionVerifierABI = [
  {
    type: 'function',
    name: 'verifyAndParseWithImageId',
    inputs: [
      { name: 'expectedImageId', type: 'bytes32' },
      { name: 'journal', type: 'bytes' },
      { name: 'seal', type: 'bytes' },
    ],
    outputs: [
      {
        name: 'parsed',
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32' },
          { name: 'constraintSetHash', type: 'bytes32' },
          { name: 'inputRoot', type: 'bytes32' },
          { name: 'executionNonce', type: 'uint64' },
          { name: 'inputCommitment', type: 'bytes32' },
          { name: 'actionCommitment', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'parseJournal',
    inputs: [{ name: 'journal', type: 'bytes' }],
    outputs: [
      {
        name: 'parsed',
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'bytes32' },
          { name: 'agentCodeHash', type: 'bytes32' },
          { name: 'constraintSetHash', type: 'bytes32' },
          { name: 'inputRoot', type: 'bytes32' },
          { name: 'executionNonce', type: 'uint64' },
          { name: 'inputCommitment', type: 'bytes32' },
          { name: 'actionCommitment', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'pure',
  },
] as const;

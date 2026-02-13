export const TALIdentityRegistryV3ABI = [
  // =====================================================================
  // V3-SPECIFIC FUNCTIONS (V1 in TALIdentityRegistryABI, V2 in V2ABI)
  // =====================================================================
  {
    "type": "function",
    "name": "registerWithContentHash",
    "inputs": [
      { "name": "_agentURI", "type": "string", "internalType": "string" },
      { "name": "contentHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "criticalFieldsHash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateAgentURIWithHash",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" },
      { "name": "newURI", "type": "string", "internalType": "string" },
      { "name": "newContentHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "newCriticalFieldsHash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getContentHash",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "contentHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "criticalFieldsHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "version", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasContentCommitment",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initializeV3",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  // V3 Events
  {
    "type": "event",
    "name": "ContentHashCommitted",
    "inputs": [
      { "name": "agentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "contentHash", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
      { "name": "criticalFieldsHash", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
      { "name": "version", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "V3Initialized",
    "inputs": [],
    "anonymous": false
  },
  // V3 Errors
  {
    "type": "error",
    "name": "ContentHashRequired",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "InvalidContentHash",
    "inputs": []
  }
] as const;

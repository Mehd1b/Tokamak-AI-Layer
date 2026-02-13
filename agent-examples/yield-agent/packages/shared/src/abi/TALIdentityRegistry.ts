export const TALIdentityRegistryABI = [
  // === Read Functions ===
  {
    type: "function",
    name: "agentExists",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentURI",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentsByOwner",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperator",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMetadata",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "key", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isVerifiedOperator",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },

  // === Write Functions ===
  {
    type: "function",
    name: "register",
    inputs: [{ name: "_agentURI", type: "string", internalType: "string" }],
    outputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setOperator",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateAgentURI",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "newURI", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMetadata",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "key", type: "string", internalType: "string" },
      { name: "value", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // === Events ===
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "agentURI", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OperatorSet",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AgentURIUpdated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "newURI", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
] as const;

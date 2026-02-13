export const TALReputationRegistryABI = [
  // === Read Functions ===
  {
    type: "function",
    name: "getFeedback",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "client", type: "address", internalType: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct IERC8004ReputationRegistry.Feedback[]",
        components: [
          { name: "value", type: "int128", internalType: "int128" },
          { name: "valueDecimals", type: "uint8", internalType: "uint8" },
          { name: "tag1", type: "string", internalType: "string" },
          { name: "tag2", type: "string", internalType: "string" },
          { name: "endpoint", type: "string", internalType: "string" },
          { name: "feedbackURI", type: "string", internalType: "string" },
          { name: "feedbackHash", type: "bytes32", internalType: "bytes32" },
          { name: "isRevoked", type: "bool", internalType: "bool" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeedbackCount",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getClientList",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSummary",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "clientAddresses", type: "address[]", internalType: "address[]" },
    ],
    outputs: [
      {
        name: "summary",
        type: "tuple",
        internalType: "struct IERC8004ReputationRegistry.FeedbackSummary",
        components: [
          { name: "totalValue", type: "int256", internalType: "int256" },
          { name: "count", type: "uint256", internalType: "uint256" },
          { name: "min", type: "int128", internalType: "int128" },
          { name: "max", type: "int128", internalType: "int128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStakeWeightedSummary",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "clients", type: "address[]", internalType: "address[]" },
    ],
    outputs: [
      {
        name: "summary",
        type: "tuple",
        internalType: "struct ITALReputationRegistry.StakeWeightedSummary",
        components: [
          { name: "weightedTotalValue", type: "int256", internalType: "int256" },
          { name: "totalWeight", type: "uint256", internalType: "uint256" },
          { name: "count", type: "uint256", internalType: "uint256" },
          { name: "min", type: "int128", internalType: "int128" },
          { name: "max", type: "int128", internalType: "int128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasPaymentProof",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "client", type: "address", internalType: "address" },
      { name: "feedbackIndex", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },

  // === Write Functions ===
  {
    type: "function",
    name: "submitFeedback",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "value", type: "int128", internalType: "int128" },
      { name: "valueDecimals", type: "uint8", internalType: "uint8" },
      { name: "tag1", type: "string", internalType: "string" },
      { name: "tag2", type: "string", internalType: "string" },
      { name: "endpoint", type: "string", internalType: "string" },
      { name: "feedbackURI", type: "string", internalType: "string" },
      { name: "feedbackHash", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitFeedbackWithPaymentProof",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "value", type: "int128", internalType: "int128" },
      { name: "valueDecimals", type: "uint8", internalType: "uint8" },
      { name: "tag1", type: "string", internalType: "string" },
      { name: "tag2", type: "string", internalType: "string" },
      { name: "endpoint", type: "string", internalType: "string" },
      { name: "feedbackURI", type: "string", internalType: "string" },
      { name: "feedbackHash", type: "bytes32", internalType: "bytes32" },
      { name: "paymentProof", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "respondToFeedback",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "client", type: "address", internalType: "address" },
      { name: "feedbackIndex", type: "uint256", internalType: "uint256" },
      { name: "responseURI", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // === Events ===
  {
    type: "event",
    name: "FeedbackSubmitted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "client", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "int128", indexed: false, internalType: "int128" },
      { name: "tag1", type: "string", indexed: false, internalType: "string" },
      { name: "tag2", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeedbackWithPaymentProofSubmitted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "client", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "int128", indexed: false, internalType: "int128" },
      { name: "paymentProofHash", type: "bytes32", indexed: false, internalType: "bytes32" },
    ],
    anonymous: false,
  },
] as const;

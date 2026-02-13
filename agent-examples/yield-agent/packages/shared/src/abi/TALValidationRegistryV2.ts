export const TALValidationRegistryV2ABI = [
  // =====================================================================
  // V2-SPECIFIC FUNCTIONS (V1 functions are in TALValidationRegistryABI)
  // =====================================================================
  {
    type: "function",
    name: "getAgentValidationStats",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "windowSeconds", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "total", type: "uint256", internalType: "uint256" },
      { name: "failed", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEpochStats",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "epoch", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "total", type: "uint256", internalType: "uint256" },
      { name: "failed", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentEpoch",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "EPOCH_DURATION",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "FAILURE_SCORE_THRESHOLD",
    inputs: [],
    outputs: [
      { name: "", type: "uint8", internalType: "uint8" },
    ],
    stateMutability: "view",
  },

  // === V2 Events ===
  {
    type: "event",
    name: "ValidationStatsUpdated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "epoch", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalInEpoch", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "failedInEpoch", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "V2Initialized",
    inputs: [],
    anonymous: false,
  },
] as const;

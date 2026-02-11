export const StakingIntegrationModuleABI = [
  // === Read Functions ===
  {
    type: "function",
    name: "getStake",
    inputs: [{ name: "operator", type: "address", internalType: "address" }],
    outputs: [{ name: "stakedAmount", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isVerifiedOperator",
    inputs: [{ name: "operator", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperatorStatus",
    inputs: [{ name: "operator", type: "address", internalType: "address" }],
    outputs: [
      { name: "stakedAmount", type: "uint256", internalType: "uint256" },
      { name: "isVerified", type: "bool", internalType: "bool" },
      { name: "slashingCount", type: "uint256", internalType: "uint256" },
      { name: "lastSlashTime", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateSeigniorageBonus",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "baseEmission", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "bonusAmount", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_OPERATOR_STAKE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },

  // === Events ===
  {
    type: "event",
    name: "SlashingConditionRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "conditionHash", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "percentage", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SlashingExecuted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "reason", type: "bytes32", indexed: false, internalType: "bytes32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SeigniorageRouted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

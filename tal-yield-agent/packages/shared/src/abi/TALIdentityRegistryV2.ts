export const TALIdentityRegistryV2ABI = [
  // =====================================================================
  // V2-SPECIFIC FUNCTIONS (V1 functions are in TALIdentityRegistryABI)
  // =====================================================================
  {
    type: "function",
    name: "registerV2",
    inputs: [
      { name: "_agentURI", type: "string", internalType: "string" },
      { name: "_validationModel", type: "uint8", internalType: "uint8" },
      {
        name: "operatorConsents",
        type: "tuple[]",
        internalType: "struct TALIdentityRegistryV2.OperatorConsentData[]",
        components: [
          { name: "operator", type: "address", internalType: "address" },
          { name: "agentOwner", type: "address", internalType: "address" },
          { name: "agentURI", type: "string", internalType: "string" },
          { name: "validationModel", type: "uint8", internalType: "uint8" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
        ],
      },
      { name: "operatorSignatures", type: "bytes[]", internalType: "bytes[]" },
    ],
    outputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "checkAndSlash",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "reactivate",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addOperator",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      {
        name: "consent",
        type: "tuple",
        internalType: "struct TALIdentityRegistryV2.OperatorConsentData",
        components: [
          { name: "operator", type: "address", internalType: "address" },
          { name: "agentOwner", type: "address", internalType: "address" },
          { name: "agentURI", type: "string", internalType: "string" },
          { name: "validationModel", type: "uint8", internalType: "uint8" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
        ],
      },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeOperator",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "operatorExit",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // === V2 View Functions ===
  {
    type: "function",
    name: "getAgentOperators",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "address[]", internalType: "address[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentValidationModel",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint8", internalType: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentStatus",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint8", internalType: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperatorAgents",
    inputs: [
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "uint256[]", internalType: "uint256[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperatorOf",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentPausedAt",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canReactivate",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "operatorNonces",
    inputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolTreasury",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minOperatorStake",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reactivationCooldown",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "validationRegistry",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "OPERATOR_CONSENT_TYPEHASH",
    inputs: [],
    outputs: [
      { name: "", type: "bytes32", internalType: "bytes32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_OPERATORS_PER_AGENT",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SLASH_FAILURE_THRESHOLD",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SLASH_PERCENTAGE",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SLASHER_ROLE",
    inputs: [],
    outputs: [
      { name: "", type: "bytes32", internalType: "bytes32" },
    ],
    stateMutability: "view",
  },

  // === V2 Events ===
  {
    type: "event",
    name: "AgentRegisteredV2",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "validationModel", type: "uint8", indexed: false, internalType: "uint8" },
      { name: "operators", type: "address[]", indexed: false, internalType: "address[]" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AgentSlashed",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operators", type: "address[]", indexed: false, internalType: "address[]" },
      { name: "slashAmountPerOperator", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "failedValidations", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalValidations", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AgentPaused",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "reason", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AgentReactivated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OperatorAdded",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OperatorRemoved",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OperatorExited",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "V2Initialized",
    inputs: [
      { name: "protocolTreasury", type: "address", indexed: false, internalType: "address" },
      { name: "validationRegistry", type: "address", indexed: false, internalType: "address" },
      { name: "minOperatorStake", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },

  // === V2 Errors ===
  {
    type: "error",
    name: "AgentNotActive",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AgentNotPaused",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "CooldownNotElapsed",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "readyAt", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NotSlashableModel",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "OperatorStakeInsufficient",
    inputs: [
      { name: "operator", type: "address", internalType: "address" },
      { name: "stake", type: "uint256", internalType: "uint256" },
      { name: "required", type: "uint256", internalType: "uint256" },
    ],
  },
] as const;

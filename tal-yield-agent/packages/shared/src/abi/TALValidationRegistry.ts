export const TALValidationRegistryABI = [
  // === Read Functions ===
  {
    type: "function",
    name: "getValidation",
    inputs: [{ name: "requestHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      {
        name: "request",
        type: "tuple",
        internalType:
          "struct IERC8004ValidationRegistry.ValidationRequest",
        components: [
          { name: "agentId", type: "uint256", internalType: "uint256" },
          { name: "requester", type: "address", internalType: "address" },
          { name: "taskHash", type: "bytes32", internalType: "bytes32" },
          { name: "outputHash", type: "bytes32", internalType: "bytes32" },
          {
            name: "model",
            type: "uint8",
            internalType:
              "enum IERC8004ValidationRegistry.ValidationModel",
          },
          { name: "bounty", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          {
            name: "status",
            type: "uint8",
            internalType:
              "enum IERC8004ValidationRegistry.ValidationStatus",
          },
        ],
      },
      {
        name: "response",
        type: "tuple",
        internalType:
          "struct IERC8004ValidationRegistry.ValidationResponse",
        components: [
          { name: "validator", type: "address", internalType: "address" },
          { name: "score", type: "uint8", internalType: "uint8" },
          { name: "proof", type: "bytes", internalType: "bytes" },
          { name: "detailsURI", type: "string", internalType: "string" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentValidations",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getValidationsByRequester",
    inputs: [{ name: "requester", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getValidationsByValidator",
    inputs: [{ name: "validator", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPendingValidationCount",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSelectedValidator",
    inputs: [{ name: "requestHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isDisputed",
    inputs: [{ name: "requestHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isTrustedTEEProvider",
    inputs: [{ name: "provider", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTreasury",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minStakeSecuredBounty",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minTEEBounty",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolFeeBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },

  // === Write Functions ===
  {
    type: "function",
    name: "requestValidation",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "taskHash", type: "bytes32", internalType: "bytes32" },
      { name: "outputHash", type: "bytes32", internalType: "bytes32" },
      {
        name: "model",
        type: "uint8",
        internalType:
          "enum IERC8004ValidationRegistry.ValidationModel",
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "requestHash", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "submitValidation",
    inputs: [
      { name: "requestHash", type: "bytes32", internalType: "bytes32" },
      { name: "score", type: "uint8", internalType: "uint8" },
      { name: "proof", type: "bytes", internalType: "bytes" },
      { name: "detailsURI", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "disputeValidation",
    inputs: [
      { name: "requestHash", type: "bytes32", internalType: "bytes32" },
      { name: "evidence", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolveDispute",
    inputs: [
      { name: "requestHash", type: "bytes32", internalType: "bytes32" },
      { name: "upholdOriginal", type: "bool", internalType: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // === Events ===
  {
    type: "event",
    name: "ValidationRequested",
    inputs: [
      { name: "requestHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "model",
        type: "uint8",
        indexed: false,
        internalType:
          "enum IERC8004ValidationRegistry.ValidationModel",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ValidationCompleted",
    inputs: [
      { name: "requestHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "validator", type: "address", indexed: true, internalType: "address" },
      { name: "score", type: "uint8", indexed: false, internalType: "uint8" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ValidationDisputed",
    inputs: [
      { name: "requestHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "disputer", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BountyDistributed",
    inputs: [
      { name: "requestHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "validator", type: "address", indexed: true, internalType: "address" },
      { name: "validatorAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "agentAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "treasuryAmount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ValidatorSelected",
    inputs: [
      { name: "requestHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "validator", type: "address", indexed: true, internalType: "address" },
      { name: "randomSeed", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

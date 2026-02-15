export const TALValidationRegistryV3ABI = [
  // =====================================================================
  // V3-SPECIFIC FUNCTIONS (V1 + V2 functions are in their respective ABIs)
  // =====================================================================
  {
    "type": "function",
    "name": "slashForMissedDeadline",
    "inputs": [
      { "name": "requestHash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MIN_AGENT_OWNER_STAKE",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "INCORRECT_COMPUTATION_THRESHOLD",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint8", "internalType": "uint8" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEADLINE_SLASH_PERCENTAGE",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "INCORRECT_COMPUTATION_SLASH_PERCENTAGE",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  // V3 Events
  {
    "type": "event",
    "name": "OperatorSlashedForDeadline",
    "inputs": [
      { "name": "requestHash", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "operator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "slashAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }
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
    "name": "ReputationOnlyNoValidationNeeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientAgentOwnerStake",
    "inputs": [
      { "name": "ownerStake", "type": "uint256", "internalType": "uint256" },
      { "name": "required", "type": "uint256", "internalType": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "DeadlineNotPassed",
    "inputs": [
      { "name": "requestHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "deadline", "type": "uint256", "internalType": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "NoValidatorSelected",
    "inputs": [
      { "name": "requestHash", "type": "bytes32", "internalType": "bytes32" }
    ]
  },
  {
    "type": "error",
    "name": "RequestNotPending",
    "inputs": [
      { "name": "requestHash", "type": "bytes32", "internalType": "bytes32" }
    ]
  }
] as const;

export const TALValidationRegistryV4ABI = [
  // =====================================================================
  // V4-SPECIFIC FUNCTIONS (V1-V3 functions are in their respective ABIs)
  // =====================================================================
  {
    "type": "function",
    "name": "setAgentTEEConfig",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" },
      { "name": "enclaveHash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAgentTEEConfig",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bytes32", "internalType": "bytes32" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_TEE_STAKE",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minTEEStake",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentEnclaveHash",
    "inputs": [
      { "name": "agentId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bytes32", "internalType": "bytes32" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updateValidationParameters",
    "inputs": [
      { "name": "_minTEEBounty", "type": "uint256", "internalType": "uint256" },
      { "name": "_minTEEStake", "type": "uint256", "internalType": "uint256" },
      { "name": "_protocolFeeBps", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  // V4 Events
  {
    "type": "event",
    "name": "AgentTEEConfigUpdated",
    "inputs": [
      { "name": "agentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "enclaveHash", "type": "bytes32", "indexed": false, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ValidationParametersUpdated",
    "inputs": [
      { "name": "minTEEBounty", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "minTEEStake", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "protocolFeeBps", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

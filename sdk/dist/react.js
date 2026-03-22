"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react/index.ts
var react_exports = {};
__export(react_exports, {
  TokamakProvider: () => TokamakProvider,
  useAgent: () => useAgent,
  useAgentList: () => useAgentList,
  useChainMismatch: () => useChainMismatch,
  useDeposit: () => useDeposit,
  useIsChainSupported: () => useIsChainSupported,
  useIsLegacyChain: () => useIsLegacyChain,
  useRequiredTokamakClient: () => useRequiredTokamakClient,
  useTokamakClient: () => useTokamakClient,
  useUserShares: () => useUserShares,
  useVault: () => useVault,
  useVaultList: () => useVaultList,
  useVaultsForAgent: () => useVaultsForAgent,
  useWithdraw: () => useWithdraw
});
module.exports = __toCommonJS(react_exports);

// src/react/provider.tsx
var import_react = require("react");
var import_wagmi = require("wagmi");

// src/ExecutionKernelClient.ts
var import_viem4 = require("viem");
var import_chains = require("viem/chains");

// src/clients/AgentRegistryClient.ts
var import_viem = require("viem");

// src/abi/AgentRegistry.ts
var AgentRegistryABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      { name: "newImplementation", type: "address" },
      { name: "data", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "computeAgentId",
    inputs: [
      { name: "author", type: "address" },
      { name: "salt", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "salt", type: "bytes32" },
      { name: "imageId", type: "bytes32" },
      { name: "agentCodeHash", type: "bytes32" }
    ],
    outputs: [{ name: "agentId", type: "bytes32" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "update",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "newImageId", type: "bytes32" },
      { name: "newAgentCodeHash", type: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "get",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "author", type: "address" },
          { name: "imageId", type: "bytes32" },
          { name: "agentCodeHash", type: "bytes32" },
          { name: "_deprecated", type: "string" },
          { name: "exists", type: "bool" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "unregister",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "factory",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setFactory",
    inputs: [{ name: "factory_", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "agentExists",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agentCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agentAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getAllAgentIds",
    inputs: [],
    outputs: [{ name: "", type: "bytes32[]" }],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "AgentUnregistered",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "author", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "imageId", type: "bytes32", indexed: true },
      { name: "agentCodeHash", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AgentUpdated",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "newImageId", type: "bytes32", indexed: true },
      { name: "newAgentCodeHash", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "error",
    name: "AgentAlreadyExists",
    inputs: [{ name: "agentId", type: "bytes32" }]
  },
  {
    type: "error",
    name: "AgentNotFound",
    inputs: [{ name: "agentId", type: "bytes32" }]
  },
  {
    type: "error",
    name: "NotAgentAuthor",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "caller", type: "address" },
      { name: "author", type: "address" }
    ]
  },
  {
    type: "error",
    name: "InvalidImageId",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidAgentCodeHash",
    inputs: []
  },
  {
    type: "error",
    name: "VaultHasDeposits",
    inputs: [
      { name: "vault", type: "address" },
      { name: "assets", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }]
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "FactoryUpdated",
    inputs: [
      { name: "previousFactory", type: "address", indexed: true },
      { name: "newFactory", type: "address", indexed: true }
    ]
  }
];

// src/clients/AgentRegistryClient.ts
var AgentRegistryClient = class {
  publicClient;
  walletClient;
  address;
  constructor(publicClient, address, walletClient) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }
  async computeAgentId(author, salt) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "computeAgentId",
      args: [author, salt]
    });
    return result;
  }
  async register(params) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "register",
      args: [params.salt, params.imageId, params.agentCodeHash]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    let agentId;
    for (const log of receipt.logs) {
      try {
        const event = (0, import_viem.decodeEventLog)({
          abi: AgentRegistryABI,
          data: log.data,
          topics: log.topics
        });
        if (event.eventName === "AgentRegistered") {
          agentId = event.args.agentId;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!agentId) {
      throw new Error("AgentRegistered event not found in transaction receipt");
    }
    return { agentId, txHash };
  }
  async update(params) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "update",
      args: [params.agentId, params.newImageId, params.newAgentCodeHash]
    });
    return txHash;
  }
  async get(agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "get",
      args: [agentId]
    });
    return {
      agentId,
      author: result.author,
      imageId: result.imageId,
      agentCodeHash: result.agentCodeHash,
      exists: result.exists
    };
  }
  async getAllAgentIds() {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "getAllAgentIds"
    });
    return result;
  }
  async agentExists(agentId) {
    return await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "agentExists",
      args: [agentId]
    });
  }
  requireWallet() {
    if (!this.walletClient) {
      throw new Error("WalletClient required for write operations");
    }
  }
};

// src/clients/VaultFactoryClient.ts
var import_viem2 = require("viem");

// src/abi/VaultFactory.ts
var VaultFactoryABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      { name: "newImplementation", type: "address" },
      { name: "data", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "registry",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "verifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "computeVaultAddress",
    inputs: [
      { name: "owner", type: "address" },
      { name: "agentId", type: "bytes32" },
      { name: "asset", type: "address" },
      { name: "userSalt", type: "bytes32" }
    ],
    outputs: [
      { name: "vault", type: "address" },
      { name: "salt", type: "bytes32" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "deployVault",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "asset", type: "address" },
      { name: "userSalt", type: "bytes32" },
      { name: "expectedImageId", type: "bytes32" }
    ],
    outputs: [{ name: "vault", type: "address" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "isDeployedVault",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "vaultCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "vaultAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getAllVaults",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getAgentVaults",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "VaultDeployed",
    inputs: [
      { name: "vault", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "asset", type: "address", indexed: false },
      { name: "trustedImageId", type: "bytes32", indexed: false },
      { name: "salt", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "error",
    name: "AgentNotRegistered",
    inputs: [{ name: "agentId", type: "bytes32" }]
  },
  {
    type: "error",
    name: "NotAgentAuthor",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "caller", type: "address" },
      { name: "author", type: "address" }
    ]
  },
  {
    type: "error",
    name: "VaultAlreadyExists",
    inputs: [{ name: "vault", type: "address" }]
  },
  {
    type: "error",
    name: "ImageIdChanged",
    inputs: [
      { name: "expected", type: "bytes32" },
      { name: "actual", type: "bytes32" }
    ]
  },
  {
    type: "function",
    name: "vaultProtocolType",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setVaultProtocolType",
    inputs: [
      { name: "vault", type: "address" },
      { name: "protocolType", type: "uint8" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "VaultProtocolTypeSet",
    inputs: [
      { name: "vault", type: "address", indexed: true },
      { name: "protocolType", type: "uint8", indexed: false }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }]
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true }
    ]
  }
];

// src/clients/VaultFactoryClient.ts
var VaultFactoryClient = class {
  publicClient;
  walletClient;
  address;
  constructor(publicClient, address, walletClient) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }
  async registry() {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "registry"
    });
  }
  async verifier() {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "verifier"
    });
  }
  async computeVaultAddress(owner, agentId, asset, userSalt) {
    const [vault, salt] = await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "computeVaultAddress",
      args: [owner, agentId, asset, userSalt]
    });
    return { vault, salt };
  }
  async deployVault(params) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "deployVault",
      args: [params.agentId, params.asset, params.userSalt, params.expectedImageId]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    let vaultAddress;
    for (const log of receipt.logs) {
      try {
        const event = (0, import_viem2.decodeEventLog)({
          abi: VaultFactoryABI,
          data: log.data,
          topics: log.topics
        });
        if (event.eventName === "VaultDeployed") {
          vaultAddress = event.args.vault;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!vaultAddress) {
      throw new Error("VaultDeployed event not found in transaction receipt");
    }
    return { vaultAddress, txHash };
  }
  async getAllVaults() {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "getAllVaults"
    });
    return result;
  }
  async getAgentVaults(agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "getAgentVaults",
      args: [agentId]
    });
    return result;
  }
  async isDeployedVault(vault) {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "isDeployedVault",
      args: [vault]
    });
  }
  requireWallet() {
    if (!this.walletClient) {
      throw new Error("WalletClient required for write operations");
    }
  }
};

// src/clients/KernelVaultClient.ts
var import_viem3 = require("viem");

// src/abi/KernelVault.ts
var KernelVaultABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "asset",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agentId",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "trustedImageId",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalShares",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalDeposited",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalWithdrawn",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalValueLocked",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shares",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastExecutionNonce",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastExecutionTimestamp",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "convertToShares",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "convertToAssets",
    inputs: [{ name: "_shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "depositERC20Tokens",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "sharesMinted", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "depositETH",
    inputs: [],
    outputs: [{ name: "sharesMinted", type: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "shareAmount", type: "uint256" }],
    outputs: [{ name: "assetsOut", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "journal", type: "bytes" },
      { name: "seal", type: "bytes" },
      { name: "agentOutputBytes", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "ExecutionApplied",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "executionNonce", type: "uint64", indexed: true },
      { name: "actionCommitment", type: "bytes32", indexed: false },
      { name: "actionCount", type: "uint256", indexed: false }
    ]
  }
];

// src/clients/KernelVaultClient.ts
var KernelVaultClient = class {
  publicClient;
  walletClient;
  vaultAddress;
  constructor(publicClient, vaultAddress, walletClient) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultAddress = vaultAddress;
  }
  async asset() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "asset"
    });
  }
  async agentId() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "agentId"
    });
  }
  async trustedImageId() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "trustedImageId"
    });
  }
  async totalShares() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "totalShares"
    });
  }
  async totalAssets() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "totalAssets"
    });
  }
  async totalDeposited() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "totalDeposited"
    });
  }
  async totalWithdrawn() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "totalWithdrawn"
    });
  }
  async totalValueLocked() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "totalValueLocked"
    });
  }
  async shares(account) {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "shares",
      args: [account]
    });
  }
  async lastExecutionNonce() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "lastExecutionNonce"
    });
  }
  async lastExecutionTimestamp() {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "lastExecutionTimestamp"
    });
  }
  async convertToShares(assets) {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "convertToShares",
      args: [assets]
    });
  }
  async convertToAssets(sharesAmount) {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "convertToAssets",
      args: [sharesAmount]
    });
  }
  async depositERC20(assets) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "depositERC20Tokens",
      args: [assets]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = this.parseDepositEvent(receipt.logs);
    return { sharesMinted, txHash };
  }
  async depositETH(value) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "depositETH",
      value
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = this.parseDepositEvent(receipt.logs);
    return { sharesMinted, txHash };
  }
  async withdraw(shareAmount) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "withdraw",
      args: [shareAmount]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const assetsOut = this.parseWithdrawEvent(receipt.logs);
    return { assetsOut, txHash };
  }
  async execute(params) {
    this.requireWallet();
    return await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "execute",
      args: [params.journal, params.seal, params.agentOutputBytes]
    });
  }
  async getInfo(userAddress) {
    const [assetAddr, agentIdVal, totalAssetsVal, totalSharesVal] = await Promise.all([
      this.asset(),
      this.agentId(),
      this.totalAssets(),
      this.totalShares()
    ]);
    let totalValueLockedVal;
    try {
      totalValueLockedVal = await this.totalValueLocked();
    } catch {
      totalValueLockedVal = totalAssetsVal;
    }
    let userShares = 0n;
    let userAssets = 0n;
    if (userAddress) {
      userShares = await this.shares(userAddress);
      if (userShares > 0n) {
        userAssets = await this.convertToAssets(userShares);
      }
    }
    return {
      address: this.vaultAddress,
      owner: "0x0000000000000000000000000000000000000000",
      // owner not stored on-chain in KernelVault
      agentId: agentIdVal,
      asset: assetAddr,
      totalAssets: totalAssetsVal,
      totalShares: totalSharesVal,
      totalValueLocked: totalValueLockedVal,
      userShares,
      userAssets
    };
  }
  parseDepositEvent(logs) {
    for (const log of logs) {
      try {
        const event = (0, import_viem3.decodeEventLog)({
          abi: KernelVaultABI,
          data: log.data,
          topics: log.topics
        });
        if (event.eventName === "Deposit") {
          return event.args.shares;
        }
      } catch {
        continue;
      }
    }
    return 0n;
  }
  parseWithdrawEvent(logs) {
    for (const log of logs) {
      try {
        const event = (0, import_viem3.decodeEventLog)({
          abi: KernelVaultABI,
          data: log.data,
          topics: log.topics
        });
        if (event.eventName === "Withdraw") {
          return event.args.amount;
        }
      } catch {
        continue;
      }
    }
    return 0n;
  }
  requireWallet() {
    if (!this.walletClient) {
      throw new Error("WalletClient required for write operations");
    }
  }
};

// src/abi/KernelExecutionVerifier.ts
var KernelExecutionVerifierABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      { name: "newImplementation", type: "address" },
      { name: "data", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "verifyAndParseWithImageId",
    inputs: [
      { name: "expectedImageId", type: "bytes32" },
      { name: "journal", type: "bytes" },
      { name: "seal", type: "bytes" }
    ],
    outputs: [
      {
        name: "parsed",
        type: "tuple",
        components: [
          { name: "agentId", type: "bytes32" },
          { name: "agentCodeHash", type: "bytes32" },
          { name: "constraintSetHash", type: "bytes32" },
          { name: "inputRoot", type: "bytes32" },
          { name: "executionNonce", type: "uint64" },
          { name: "inputCommitment", type: "bytes32" },
          { name: "actionCommitment", type: "bytes32" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "parseJournal",
    inputs: [{ name: "journal", type: "bytes" }],
    outputs: [
      {
        name: "parsed",
        type: "tuple",
        components: [
          { name: "agentId", type: "bytes32" },
          { name: "agentCodeHash", type: "bytes32" },
          { name: "constraintSetHash", type: "bytes32" },
          { name: "inputRoot", type: "bytes32" },
          { name: "executionNonce", type: "uint64" },
          { name: "inputCommitment", type: "bytes32" },
          { name: "actionCommitment", type: "bytes32" }
        ]
      }
    ],
    stateMutability: "pure"
  }
];

// src/clients/VerifierClient.ts
var VerifierClient = class {
  publicClient;
  address;
  constructor(publicClient, address) {
    this.publicClient = publicClient;
    this.address = address;
  }
  async verifyAndParse(expectedImageId, journal, seal) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: KernelExecutionVerifierABI,
      functionName: "verifyAndParseWithImageId",
      args: [expectedImageId, journal, seal]
    });
    return {
      agentId: result.agentId,
      agentCodeHash: result.agentCodeHash,
      constraintSetHash: result.constraintSetHash,
      inputRoot: result.inputRoot,
      executionNonce: result.executionNonce,
      inputCommitment: result.inputCommitment,
      actionCommitment: result.actionCommitment
    };
  }
  async parseJournal(journal) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: KernelExecutionVerifierABI,
      functionName: "parseJournal",
      args: [journal]
    });
    return {
      agentId: result.agentId,
      agentCodeHash: result.agentCodeHash,
      constraintSetHash: result.constraintSetHash,
      inputRoot: result.inputRoot,
      executionNonce: result.executionNonce,
      inputCommitment: result.inputCommitment,
      actionCommitment: result.actionCommitment
    };
  }
};

// src/addresses.ts
var ETHEREUM_MAINNET_ADDRESSES = {
  agentRegistry: "0xFa0AAEe4482C7901653855F591B832E7E8a20727",
  vaultFactory: "0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822",
  kernelExecutionVerifier: "0xAf58D2191772bcFFB3260F5140E995ec79e4d88B",
  riscZeroVerifierRouter: "0x8EaB2D97Dfce405A1692a21b3ff3A172d593D319"
};
var HYPEREVM_MAINNET_ADDRESSES = {
  agentRegistry: "0x8fd180069269b5800AD60998c567731894b707b4",
  vaultFactory: "0xCB76E29808733a32946e9fB70A3Fb7b2e5a1a89a",
  kernelExecutionVerifier: "0x98800a0d9a5755Be1f8613DdA265797F3fE2C56b",
  riscZeroVerifierRouter: "0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8"
};
var SEPOLIA_ADDRESSES = {
  agentRegistry: "0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168",
  vaultFactory: "0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C",
  kernelExecutionVerifier: "0x1eB41537037fB771CBA8Cd088C7c806936325eB5",
  riscZeroVerifierRouter: "0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187"
};
var HYPEREVM_TESTNET_ADDRESSES = {
  agentRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3",
  vaultFactory: "0x4c36bCA87f21E16f5af8A6d7Df2D86a5aD13049F",
  kernelExecutionVerifier: "0x0052258E517835081c94c0B685409f2EfC4D502b",
  riscZeroVerifierRouter: "0x0000000000000000000000000000000000000000"
};
var ARBITRUM_ADDRESSES = {
  agentRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b",
  vaultFactory: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30",
  kernelExecutionVerifier: "0x09447147C6E75a60A449f38532F06E19F5F632F3",
  riscZeroVerifierRouter: "0x0b144e07a0826182b6b59788c34b32bfa86fb711"
};
var OPTIMISM_ADDRESSES = {
  agentRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b",
  vaultFactory: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30",
  kernelExecutionVerifier: "0x09447147C6E75a60A449f38532F06E19F5F632F3",
  riscZeroVerifierRouter: "0x0b144e07a0826182b6b59788c34b32bfa86fb711"
};
var DEPLOYMENTS = {
  1: ETHEREUM_MAINNET_ADDRESSES,
  999: HYPEREVM_MAINNET_ADDRESSES,
  42161: ARBITRUM_ADDRESSES,
  10: OPTIMISM_ADDRESSES,
  11155111: SEPOLIA_ADDRESSES,
  998: HYPEREVM_TESTNET_ADDRESSES
};

// src/ExecutionKernelClient.ts
var ExecutionKernelClient = class {
  agents;
  vaultFactory;
  verifier;
  publicClient;
  walletClient;
  config;
  constructor(config) {
    this.config = config;
    this.publicClient = config.publicClient ?? (0, import_viem4.createPublicClient)({
      chain: import_chains.optimismSepolia,
      transport: (0, import_viem4.http)(config.rpcUrl)
    });
    this.walletClient = config.walletClient;
    const addresses = {
      agentRegistry: config.agentRegistry ?? SEPOLIA_ADDRESSES.agentRegistry,
      vaultFactory: config.vaultFactory ?? SEPOLIA_ADDRESSES.vaultFactory,
      kernelExecutionVerifier: config.kernelExecutionVerifier ?? SEPOLIA_ADDRESSES.kernelExecutionVerifier
    };
    this.agents = new AgentRegistryClient(
      this.publicClient,
      addresses.agentRegistry,
      this.walletClient
    );
    this.vaultFactory = new VaultFactoryClient(
      this.publicClient,
      addresses.vaultFactory,
      this.walletClient
    );
    this.verifier = new VerifierClient(
      this.publicClient,
      addresses.kernelExecutionVerifier
    );
  }
  /**
   * Create a KernelVaultClient for a specific vault address
   */
  createVaultClient(vaultAddress) {
    return new KernelVaultClient(this.publicClient, vaultAddress, this.walletClient);
  }
  // ============ Convenience Methods ============
  /**
   * Register a new agent on the AgentRegistry
   */
  async registerAgent(params) {
    return this.agents.register(params);
  }
  /**
   * Get agent information by ID
   */
  async getAgent(agentId) {
    return this.agents.get(agentId);
  }
  /**
   * Deploy a new vault via VaultFactory
   */
  async deployVault(params) {
    return this.vaultFactory.deployVault(params);
  }
  /**
   * Verify an execution proof and parse the journal
   */
  async verifyExecution(imageId, journal, seal) {
    try {
      const parsed = await this.verifier.verifyAndParse(imageId, journal, seal);
      return { valid: true, parsed };
    } catch {
      throw new Error("Proof verification failed");
    }
  }
};

// src/react/provider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var TokamakContext = (0, import_react.createContext)(null);
function TokamakProviderInner({ children, addresses }) {
  const publicClient = (0, import_wagmi.usePublicClient)();
  const { data: walletClient } = (0, import_wagmi.useWalletClient)();
  const chainId = (0, import_wagmi.useChainId)();
  const client = (0, import_react.useMemo)(() => {
    if (!publicClient) return null;
    const addrs = addresses ?? DEPLOYMENTS[chainId];
    if (!addrs) return null;
    return new ExecutionKernelClient({
      publicClient,
      walletClient: walletClient ?? void 0,
      ...addrs
    });
  }, [publicClient, walletClient, chainId, addresses]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TokamakContext.Provider, { value: client, children });
}
function TokamakProvider({ children, addresses }) {
  const [mounted, setMounted] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => setMounted(true), []);
  if (!mounted) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TokamakContext.Provider, { value: null, children });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TokamakProviderInner, { addresses, children });
}
function useTokamakClient() {
  return (0, import_react.useContext)(TokamakContext);
}
function useRequiredTokamakClient() {
  const client = (0, import_react.useContext)(TokamakContext);
  if (!client) {
    throw new Error(
      "useTokamakClient: no client available. Wrap your app in <TokamakProvider> and ensure the wallet is connected to a supported chain."
    );
  }
  return client;
}

// src/react/useAgent.ts
var import_react_query = require("@tanstack/react-query");
function useAgent(agentId) {
  const client = useTokamakClient();
  return (0, import_react_query.useQuery)({
    queryKey: ["tokamak", "agent", agentId],
    queryFn: async () => {
      if (!client || !agentId) return null;
      return client.getAgent(agentId);
    },
    enabled: !!client && !!agentId,
    staleTime: 6e4
  });
}
function useAgentList() {
  const client = useTokamakClient();
  return (0, import_react_query.useQuery)({
    queryKey: ["tokamak", "agents"],
    queryFn: async () => {
      if (!client) return [];
      const ids = await client.agents.getAllAgentIds();
      const agents = await Promise.all(ids.map((id) => client.getAgent(id)));
      return agents.filter((a) => a !== null && a.exists);
    },
    enabled: !!client,
    staleTime: 6e4
  });
}

// src/react/useVault.ts
var import_react_query2 = require("@tanstack/react-query");
var import_wagmi2 = require("wagmi");
function useVault(vaultAddress) {
  const client = useTokamakClient();
  const { address: userAddress } = (0, import_wagmi2.useAccount)();
  return (0, import_react_query2.useQuery)({
    queryKey: ["tokamak", "vault", vaultAddress, userAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;
      const vaultClient = client.createVaultClient(vaultAddress);
      return vaultClient.getInfo(userAddress);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 3e4
  });
}

// src/react/useVaultList.ts
var import_react_query3 = require("@tanstack/react-query");
function useVaultList() {
  const client = useTokamakClient();
  return (0, import_react_query3.useQuery)({
    queryKey: ["tokamak", "vaults"],
    queryFn: async () => {
      if (!client) return [];
      const addresses = await client.vaultFactory.getAllVaults();
      const vaults = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const vc = client.createVaultClient(addr);
            const info = await vc.getInfo();
            return {
              address: addr,
              agentId: info.agentId,
              asset: info.asset,
              totalAssets: info.totalAssets,
              totalShares: info.totalShares,
              totalValueLocked: info.totalValueLocked
            };
          } catch {
            return null;
          }
        })
      );
      return vaults.filter((v) => v !== null);
    },
    enabled: !!client,
    staleTime: 3e4
  });
}
function useVaultsForAgent(agentId) {
  const { data: allVaults, ...rest } = useVaultList();
  const filtered = allVaults?.filter((v) => v.agentId === agentId) ?? [];
  return { data: filtered, ...rest };
}

// src/react/useUserShares.ts
var import_react_query4 = require("@tanstack/react-query");
var import_wagmi3 = require("wagmi");
function useUserShares(vaultAddress) {
  const client = useTokamakClient();
  const { address } = (0, import_wagmi3.useAccount)();
  return (0, import_react_query4.useQuery)({
    queryKey: ["tokamak", "userShares", vaultAddress, address],
    queryFn: async () => {
      if (!client || !vaultAddress || !address) return null;
      const vc = client.createVaultClient(vaultAddress);
      const shares = await vc.shares(address);
      const assetsValue = shares > 0n ? await vc.convertToAssets(shares) : 0n;
      return { shares, assetsValue };
    },
    enabled: !!client && !!vaultAddress && !!address,
    staleTime: 15e3
  });
}

// src/react/useDeposit.ts
var import_react2 = require("react");
var import_wagmi5 = require("wagmi");
var import_viem5 = require("viem");
var import_react_query5 = require("@tanstack/react-query");

// src/react/useChainValidation.ts
var import_wagmi4 = require("wagmi");
var LEGACY_GAS_CHAINS = /* @__PURE__ */ new Set([999, 998]);
function useIsLegacyChain() {
  const chainId = (0, import_wagmi4.useChainId)();
  return LEGACY_GAS_CHAINS.has(chainId);
}
function useIsChainSupported() {
  const chainId = (0, import_wagmi4.useChainId)();
  return chainId in DEPLOYMENTS;
}
function useChainMismatch(expectedChainId) {
  const chainId = (0, import_wagmi4.useChainId)();
  if (!expectedChainId) return false;
  return chainId !== expectedChainId;
}
function getLegacyGasOverrides(chainId) {
  return LEGACY_GAS_CHAINS.has(chainId) ? { type: "legacy" } : {};
}

// src/errors.ts
var TokamakError = class _TokamakError extends Error {
  code;
  cause;
  constructor(code, message, cause) {
    super(message);
    this.name = "TokamakError";
    this.code = code;
    this.cause = cause;
  }
  static from(err) {
    if (err instanceof _TokamakError) return err;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes("user rejected") || msg.includes("user denied"))
        return new _TokamakError("USER_REJECTED" /* USER_REJECTED */, "Transaction rejected by user", err);
      if (msg.includes("insufficient funds") || msg.includes("insufficient balance"))
        return new _TokamakError("INSUFFICIENT_BALANCE" /* INSUFFICIENT_BALANCE */, "Insufficient balance for transaction", err);
      if (msg.includes("strategyactive"))
        return new _TokamakError("STRATEGY_ACTIVE" /* STRATEGY_ACTIVE */, "Vault has an active strategy \u2014 deposits are locked until it settles", err);
      return new _TokamakError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, err.message, err);
    }
    return new _TokamakError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, String(err), err);
  }
};
var DepositError = class _DepositError extends TokamakError {
  constructor(code, message, cause) {
    super(code, message, cause);
    this.name = "DepositError";
  }
  static from(err) {
    const base = TokamakError.from(err);
    return new _DepositError(base.code, base.message, base.cause);
  }
};
var WithdrawError = class _WithdrawError extends TokamakError {
  constructor(code, message, cause) {
    super(code, message, cause);
    this.name = "WithdrawError";
  }
  static from(err) {
    const base = TokamakError.from(err);
    return new _WithdrawError(base.code, base.message, base.cause);
  }
};

// src/react/useDeposit.ts
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function useDeposit(vaultAddress, asset) {
  const client = useTokamakClient();
  const { address } = (0, import_wagmi5.useAccount)();
  const chainId = (0, import_wagmi5.useChainId)();
  const publicClient = (0, import_wagmi5.usePublicClient)();
  const { data: walletClient } = (0, import_wagmi5.useWalletClient)();
  const queryClient = (0, import_react_query5.useQueryClient)();
  const [step, setStep] = (0, import_react2.useState)("idle");
  const [error, setError] = (0, import_react2.useState)(null);
  const [txHash, setTxHash] = (0, import_react2.useState)(null);
  const [sharesMinted, setSharesMinted] = (0, import_react2.useState)(null);
  const isETH = !asset || asset === ZERO_ADDRESS;
  const { data: allowance = 0n } = (0, import_react_query5.useQuery)({
    queryKey: ["tokamak", "allowance", asset, vaultAddress, address],
    queryFn: async () => {
      if (!publicClient || !address || !vaultAddress || !asset || isETH) return 0n;
      return publicClient.readContract({
        address: asset,
        abi: import_viem5.erc20Abi,
        functionName: "allowance",
        args: [address, vaultAddress]
      });
    },
    enabled: !!publicClient && !!address && !!vaultAddress && !isETH,
    staleTime: 1e4
  });
  const needsApproval = (0, import_react2.useCallback)(
    (amount) => !isETH && allowance < amount,
    [isETH, allowance]
  );
  const deposit = (0, import_react2.useCallback)(async (amount) => {
    if (!client || !vaultAddress || !walletClient || !publicClient || !address) {
      setError(new DepositError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, "Wallet not connected"));
      setStep("error");
      return;
    }
    try {
      setError(null);
      setTxHash(null);
      setSharesMinted(null);
      const vaultClient = client.createVaultClient(vaultAddress);
      if (!isETH && allowance < amount) {
        setStep("approving");
        const approveTx = await walletClient.writeContract({
          address: asset,
          abi: import_viem5.erc20Abi,
          functionName: "approve",
          args: [vaultAddress, amount],
          ...getLegacyGasOverrides(chainId)
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        await queryClient.invalidateQueries({
          queryKey: ["tokamak", "allowance", asset, vaultAddress, address]
        });
      }
      setStep("depositing");
      const result = isETH ? await vaultClient.depositETH(amount) : await vaultClient.depositERC20(amount);
      setTxHash(result.txHash);
      setSharesMinted(result.sharesMinted);
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "vault", vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "userShares", vaultAddress] });
    } catch (err) {
      const depositErr = DepositError.from(err);
      setError(depositErr);
      setStep("error");
    }
  }, [client, vaultAddress, walletClient, publicClient, address, isETH, allowance, asset, chainId, queryClient]);
  const reset = (0, import_react2.useCallback)(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setSharesMinted(null);
  }, []);
  return { step, error, txHash, sharesMinted, deposit, reset, needsApproval, isETH, allowance };
}

// src/react/useWithdraw.ts
var import_react3 = require("react");
var import_react_query6 = require("@tanstack/react-query");
function useWithdraw(vaultAddress) {
  const client = useTokamakClient();
  const queryClient = (0, import_react_query6.useQueryClient)();
  const [step, setStep] = (0, import_react3.useState)("idle");
  const [error, setError] = (0, import_react3.useState)(null);
  const [txHash, setTxHash] = (0, import_react3.useState)(null);
  const [assetsOut, setAssetsOut] = (0, import_react3.useState)(null);
  const withdraw = (0, import_react3.useCallback)(async (shares) => {
    if (!client || !vaultAddress) {
      setError(new WithdrawError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, "Wallet not connected"));
      setStep("error");
      return;
    }
    try {
      setError(null);
      setTxHash(null);
      setAssetsOut(null);
      setStep("withdrawing");
      const vaultClient = client.createVaultClient(vaultAddress);
      const result = await vaultClient.withdraw(shares);
      setTxHash(result.txHash);
      setAssetsOut(result.assetsOut);
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "vault", vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "userShares", vaultAddress] });
    } catch (err) {
      setError(WithdrawError.from(err));
      setStep("error");
    }
  }, [client, vaultAddress, queryClient]);
  const reset = (0, import_react3.useCallback)(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setAssetsOut(null);
  }, []);
  return { step, error, txHash, assetsOut, withdraw, reset };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TokamakProvider,
  useAgent,
  useAgentList,
  useChainMismatch,
  useDeposit,
  useIsChainSupported,
  useIsLegacyChain,
  useRequiredTokamakClient,
  useTokamakClient,
  useUserShares,
  useVault,
  useVaultList,
  useVaultsForAgent,
  useWithdraw
});
//# sourceMappingURL=react.js.map
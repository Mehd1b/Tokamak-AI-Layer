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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AgentRegistryABI: () => AgentRegistryABI,
  AgentRegistryClient: () => AgentRegistryClient,
  DEFAULT_CHAIN_ID: () => DEFAULT_CHAIN_ID,
  ExecutionKernelClient: () => ExecutionKernelClient,
  ExecutionStatus: () => ExecutionStatus,
  KernelActionType: () => KernelActionType,
  KernelExecutionVerifierABI: () => KernelExecutionVerifierABI,
  KernelVaultABI: () => KernelVaultABI,
  KernelVaultClient: () => KernelVaultClient,
  OPTIMISM_SEPOLIA_ADDRESSES: () => OPTIMISM_SEPOLIA_ADDRESSES,
  VaultFactoryABI: () => VaultFactoryABI,
  VaultFactoryClient: () => VaultFactoryClient,
  VerifierClient: () => VerifierClient
});
module.exports = __toCommonJS(index_exports);

// src/ExecutionKernelClient.ts
var import_viem = require("viem");
var import_chains = require("viem/chains");

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
    name: "agentExists",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
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
      address: this.address,
      abi: AgentRegistryABI,
      functionName: "register",
      args: [params.salt, params.imageId, params.agentCodeHash]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs[0];
    const agentId = log?.topics?.[1] ?? "0x";
    return { agentId, txHash };
  }
  async update(params) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
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
      { name: "userSalt", type: "bytes32" }
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
      address: this.address,
      abi: VaultFactoryABI,
      functionName: "deployVault",
      args: [params.agentId, params.asset, params.userSalt]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs[0];
    const vaultTopic = log?.topics?.[1];
    const vaultAddress = vaultTopic ? `0x${vaultTopic.slice(26)}` : "0x";
    return { vaultAddress, txHash };
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

// src/abi/KernelVault.ts
var KernelVaultABI = [
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
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "depositERC20Tokens",
      args: [assets]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = receipt.logs.length > 0 ? 0n : 0n;
    return { sharesMinted, txHash };
  }
  async depositETH(value) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "depositETH",
      value
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = receipt.logs.length > 0 ? 0n : 0n;
    return { sharesMinted, txHash };
  }
  async withdraw(shareAmount) {
    this.requireWallet();
    const txHash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: "withdraw",
      args: [shareAmount]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const assetsOut = receipt.logs.length > 0 ? 0n : 0n;
    return { assetsOut, txHash };
  }
  async execute(params) {
    this.requireWallet();
    return await this.walletClient.writeContract({
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

// src/types.ts
var KernelActionType = /* @__PURE__ */ ((KernelActionType2) => {
  KernelActionType2[KernelActionType2["CALL"] = 2] = "CALL";
  KernelActionType2[KernelActionType2["TRANSFER_ERC20"] = 3] = "TRANSFER_ERC20";
  KernelActionType2[KernelActionType2["NO_OP"] = 4] = "NO_OP";
  return KernelActionType2;
})(KernelActionType || {});
var ExecutionStatus = /* @__PURE__ */ ((ExecutionStatus2) => {
  ExecutionStatus2[ExecutionStatus2["Success"] = 1] = "Success";
  ExecutionStatus2[ExecutionStatus2["Failure"] = 2] = "Failure";
  return ExecutionStatus2;
})(ExecutionStatus || {});
var OPTIMISM_SEPOLIA_ADDRESSES = {
  agentRegistry: "0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168",
  vaultFactory: "0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C",
  kernelExecutionVerifier: "0x1eB41537037fB771CBA8Cd088C7c806936325eB5"
};
var DEFAULT_CHAIN_ID = 11155420;

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
    this.publicClient = config.publicClient ?? (0, import_viem.createPublicClient)({
      chain: import_chains.optimismSepolia,
      transport: (0, import_viem.http)(config.rpcUrl)
    });
    this.walletClient = config.walletClient;
    const addresses = {
      agentRegistry: config.agentRegistry ?? OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
      vaultFactory: config.vaultFactory ?? OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
      kernelExecutionVerifier: config.kernelExecutionVerifier ?? OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentRegistryABI,
  AgentRegistryClient,
  DEFAULT_CHAIN_ID,
  ExecutionKernelClient,
  ExecutionStatus,
  KernelActionType,
  KernelExecutionVerifierABI,
  KernelVaultABI,
  KernelVaultClient,
  OPTIMISM_SEPOLIA_ADDRESSES,
  VaultFactoryABI,
  VaultFactoryClient,
  VerifierClient
});
//# sourceMappingURL=index.js.map
import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { TALIdentityRegistryABI } from "@tal-yield-agent/shared";
import type { AgentInfo, TALClientConfig } from "../types.js";

export class IdentityClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: Address;

  constructor(config: TALClientConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.address = config.addresses.identityRegistry;
  }

  // === Read Methods ===

  async agentExists(agentId: bigint): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "agentExists",
      args: [agentId],
    });
  }

  async getAgentURI(agentId: bigint): Promise<string> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "agentURI",
      args: [agentId],
    });
  }

  async getAgentCount(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "getAgentCount",
    });
  }

  async getAgentsByOwner(owner: Address): Promise<readonly bigint[]> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "getAgentsByOwner",
      args: [owner],
    });
  }

  async getOperator(agentId: bigint): Promise<Address> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "getOperator",
      args: [agentId],
    });
  }

  async getOwnerOf(agentId: bigint): Promise<Address> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "ownerOf",
      args: [agentId],
    });
  }

  async isVerifiedOperator(agentId: bigint): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "isVerifiedOperator",
      args: [agentId],
    });
  }

  async getAgentInfo(agentId: bigint): Promise<AgentInfo> {
    const [owner, operator, uri, isVerified] = await Promise.all([
      this.getOwnerOf(agentId),
      this.getOperator(agentId),
      this.getAgentURI(agentId),
      this.isVerifiedOperator(agentId),
    ]);

    return {
      agentId,
      owner,
      operator,
      uri,
      isVerifiedOperator: isVerified,
    };
  }

  // === Write Methods ===

  async register(agentURI: string): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "register",
      args: [agentURI],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async setOperator(agentId: bigint, operator: Address): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "setOperator",
      args: [agentId, operator],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async updateAgentURI(agentId: bigint, newURI: string): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALIdentityRegistryABI,
      functionName: "updateAgentURI",
      args: [agentId, newURI],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient?.account) {
      throw new Error("WalletClient with account required for write operations");
    }
    return this.walletClient;
  }
}

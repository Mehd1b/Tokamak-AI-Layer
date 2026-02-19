import type { PublicClient, WalletClient } from 'viem';
import { decodeEventLog } from 'viem';
import { AgentRegistryABI } from '../abi/AgentRegistry';
import type { KernelAgentInfo } from '../types';

export class AgentRegistryClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: `0x${string}`;

  constructor(
    publicClient: PublicClient,
    address: `0x${string}`,
    walletClient?: WalletClient,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }

  async computeAgentId(
    author: `0x${string}`,
    salt: `0x${string}`,
  ): Promise<`0x${string}`> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: 'computeAgentId',
      args: [author, salt],
    });
    return result;
  }

  async register(params: {
    salt: `0x${string}`;
    imageId: `0x${string}`;
    agentCodeHash: `0x${string}`;
  }): Promise<{ agentId: `0x${string}`; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: 'register',
      args: [params.salt, params.imageId, params.agentCodeHash],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    // Parse AgentRegistered event to get agentId
    let agentId: `0x${string}` | undefined;
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({
          abi: AgentRegistryABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        if (event.eventName === 'AgentRegistered') {
          agentId = (event.args as { agentId: `0x${string}` }).agentId;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!agentId) {
      throw new Error('AgentRegistered event not found in transaction receipt');
    }
    return { agentId, txHash };
  }

  async update(params: {
    agentId: `0x${string}`;
    newImageId: `0x${string}`;
    newAgentCodeHash: `0x${string}`;
  }): Promise<`0x${string}`> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: 'update',
      args: [params.agentId, params.newImageId, params.newAgentCodeHash],
    });
    return txHash;
  }

  async get(agentId: `0x${string}`): Promise<KernelAgentInfo> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: 'get',
      args: [agentId],
    });
    return {
      agentId,
      author: result.author,
      imageId: result.imageId,
      agentCodeHash: result.agentCodeHash,
      exists: result.exists,
    };
  }

  async agentExists(agentId: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: AgentRegistryABI,
      functionName: 'agentExists',
      args: [agentId],
    });
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error('WalletClient required for write operations');
    }
  }
}

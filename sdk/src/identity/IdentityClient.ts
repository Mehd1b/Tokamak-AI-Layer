import {
  type PublicClient,
  type WalletClient,
  type GetContractReturnType,
  getContract,
} from 'viem';
import { TALIdentityRegistryABI } from '../abi/TALIdentityRegistry';
import type {
  Address,
  Bytes32,
  AgentDetails,
  RegistrationParams,
  TransactionResult,
} from '../types';

export class IdentityClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly contract: GetContractReturnType<
    typeof TALIdentityRegistryABI,
    PublicClient
  >;
  private readonly contractAddress: Address;

  constructor(
    publicClient: PublicClient,
    contractAddress: Address,
    walletClient?: WalletClient,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
    this.contract = getContract({
      address: contractAddress,
      abi: TALIdentityRegistryABI,
      client: publicClient,
    });
  }

  /**
   * Register a new agent
   */
  async registerAgent(
    params: RegistrationParams,
  ): Promise<{ agentId: bigint; tx: TransactionResult }> {
    this.requireWallet();

    let hash: Bytes32;

    if (params.zkCommitment) {
      hash = await this.walletClient!.writeContract({
        address: this.contractAddress,
        abi: TALIdentityRegistryABI,
        functionName: 'registerWithZKIdentity',
        args: [params.agentURI, params.zkCommitment],
        chain: this.walletClient!.chain,
        account: this.walletClient!.account!,
      });
    } else {
      hash = await this.walletClient!.writeContract({
        address: this.contractAddress,
        abi: TALIdentityRegistryABI,
        functionName: 'register',
        args: [params.agentURI],
        chain: this.walletClient!.chain,
        account: this.walletClient!.account!,
      });
    }

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Parse AgentRegistered event to get agentId
    const agentId = this.parseAgentIdFromReceipt(receipt);

    if (params.operator) {
      await this.setOperator(agentId, params.operator);
    }

    return {
      agentId,
      tx: {
        hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 'success' ? 'success' : 'reverted',
      },
    };
  }

  /**
   * Get agent details by ID
   */
  async getAgent(agentId: bigint): Promise<AgentDetails> {
    const [owner, agentURI, zkIdentity, verifiedOperator, operator] =
      await Promise.all([
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: TALIdentityRegistryABI,
          functionName: 'ownerOf',
          args: [agentId],
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: TALIdentityRegistryABI,
          functionName: 'agentURI',
          args: [agentId],
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: TALIdentityRegistryABI,
          functionName: 'getZKIdentity',
          args: [agentId],
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: TALIdentityRegistryABI,
          functionName: 'isVerifiedOperator',
          args: [agentId],
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: TALIdentityRegistryABI,
          functionName: 'getOperator',
          args: [agentId],
        }),
      ]);

    const zeroBytes32 =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as Bytes32;
    const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

    return {
      agentId,
      owner: owner as Address,
      agentURI: agentURI as string,
      zkIdentity:
        (zkIdentity as Bytes32) === zeroBytes32
          ? null
          : (zkIdentity as Bytes32),
      verifiedOperator: verifiedOperator as boolean,
      operator:
        (operator as Address) === zeroAddress ? null : (operator as Address),
      registeredAt: new Date(), // Would need event data or subgraph
      updatedAt: new Date(),
      feedbackCount: 0, // Populated by ReputationClient
      averageScore: null,
      verifiedScore: null,
      validationCount: 0,
      successfulValidations: 0,
    };
  }

  /**
   * Get agents owned by an address
   */
  async getAgentsByOwner(owner: Address): Promise<bigint[]> {
    const agentIds = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'getAgentsByOwner',
      args: [owner],
    });
    return agentIds as bigint[];
  }

  /**
   * Get total agent count
   */
  async getAgentCount(): Promise<bigint> {
    const count = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'getAgentCount',
    });
    return count as bigint;
  }

  /**
   * Update agent URI
   */
  async updateAgentURI(
    agentId: bigint,
    newURI: string,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'updateAgentURI',
      args: [agentId, newURI],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Set agent metadata
   */
  async setMetadata(
    agentId: bigint,
    key: string,
    value: `0x${string}`,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'setMetadata',
      args: [agentId, key, value],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Get agent metadata
   */
  async getMetadata(agentId: bigint, key: string): Promise<`0x${string}`> {
    const value = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'getMetadata',
      args: [agentId, key],
    });
    return value as `0x${string}`;
  }

  /**
   * Verify agent wallet
   */
  async verifyAgentWallet(
    agentId: bigint,
    wallet: Address,
    signature: `0x${string}`,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'verifyAgentWallet',
      args: [agentId, wallet, signature],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Check if wallet is verified for agent
   */
  async isVerifiedWallet(agentId: bigint, wallet: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'isVerifiedWallet',
      args: [agentId, wallet],
    });
    return result as boolean;
  }

  /**
   * Set agent operator
   */
  async setOperator(
    agentId: bigint,
    operator: Address,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'setOperator',
      args: [agentId, operator],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Check if agent is verified operator
   */
  async isVerifiedOperator(agentId: bigint): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'isVerifiedOperator',
      args: [agentId],
    });
    return result as boolean;
  }

  /**
   * Get verified capabilities for an agent
   */
  async getVerifiedCapabilities(agentId: bigint): Promise<Bytes32[]> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'getVerifiedCapabilities',
      args: [agentId],
    });
    return result as Bytes32[];
  }

  /**
   * Check if agent exists
   */
  async agentExists(agentId: bigint): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryABI,
      functionName: 'agentExists',
      args: [agentId],
    });
    return result as boolean;
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error(
        'WalletClient required for write operations. Pass a walletClient to TALClient config.',
      );
    }
    if (!this.walletClient.account) {
      throw new Error('WalletClient must have an account connected.');
    }
  }

  private parseAgentIdFromReceipt(receipt: any): bigint {
    // Look for Transfer event (ERC-721 mint: from=0x0)
    for (const log of receipt.logs) {
      if (log.topics.length >= 4) {
        // Transfer(address from, address to, uint256 tokenId)
        const from = log.topics[1];
        if (
          from ===
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        ) {
          return BigInt(log.topics[3]);
        }
      }
    }
    throw new Error('Could not parse agentId from transaction receipt');
  }
}

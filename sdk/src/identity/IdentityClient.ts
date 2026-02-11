import {
  type PublicClient,
  type WalletClient,
  type GetContractReturnType,
  getContract,
} from 'viem';
import { TALIdentityRegistryABI } from '../abi/TALIdentityRegistry';
import { TALIdentityRegistryV2ABI } from '../abi/TALIdentityRegistryV2';
import type {
  Address,
  Bytes32,
  AgentDetails,
  AgentV2Details,
  RegistrationParams,
  RegisterV2Params,
  OperatorConsentData,
  TransactionResult,
  ValidationStats,
} from '../types';
import { AgentStatus, AgentValidationModel } from '../types';

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

  // ==========================================
  // V2 METHODS
  // ==========================================

  /**
   * Register an agent with V2 multi-operator support
   */
  async registerAgentV2(
    params: RegisterV2Params,
  ): Promise<{ agentId: bigint; tx: TransactionResult }> {
    this.requireWallet();

    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'registerV2',
      args: [
        params.agentURI,
        params.validationModel,
        params.operatorConsents.map((c) => ({
          operator: c.operator,
          agentOwner: c.agentOwner,
          agentURI: c.agentURI,
          validationModel: c.validationModel,
          nonce: c.nonce,
          deadline: c.deadline,
        })),
        params.operatorSignatures,
      ],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const agentId = this.parseAgentIdFromReceipt(receipt);

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
   * Get agent details including V2 fields (status, model, operators)
   */
  async getAgentV2(agentId: bigint): Promise<AgentV2Details> {
    const [baseAgent, status, model, operators, pausedAt, reactivatable] =
      await Promise.all([
        this.getAgent(agentId),
        this.getAgentStatus(agentId),
        this.getAgentValidationModel(agentId),
        this.getAgentOperators(agentId),
        this.getAgentPausedAt(agentId),
        this.canReactivateAgent(agentId),
      ]);

    return {
      ...baseAgent,
      status,
      validationModel: model,
      operators,
      pausedAt: pausedAt > 0n ? pausedAt : null,
      canReactivate: reactivatable,
    };
  }

  /**
   * Trigger slashing check on an agent
   */
  async checkAndSlash(agentId: bigint): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'checkAndSlash',
      args: [agentId],
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
   * Reactivate a paused agent after cooldown
   */
  async reactivate(agentId: bigint): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'reactivate',
      args: [agentId],
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
   * Add an operator to an existing agent with EIP-712 consent
   */
  async addOperator(
    agentId: bigint,
    consent: OperatorConsentData,
    signature: `0x${string}`,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'addOperator',
      args: [
        agentId,
        {
          operator: consent.operator,
          agentOwner: consent.agentOwner,
          agentURI: consent.agentURI,
          validationModel: consent.validationModel,
          nonce: consent.nonce,
          deadline: consent.deadline,
        },
        signature,
      ],
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
   * Remove an operator from an agent (owner only)
   */
  async removeOperator(
    agentId: bigint,
    operator: Address,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'removeOperator',
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
   * Operator voluntarily exits an agent (called by operator)
   */
  async operatorExit(agentId: bigint): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'operatorExit',
      args: [agentId],
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

  // ==========================================
  // V2 VIEW METHODS
  // ==========================================

  async getAgentOperators(agentId: bigint): Promise<Address[]> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentOperators',
      args: [agentId],
    });
    return result as Address[];
  }

  async getAgentValidationModel(agentId: bigint): Promise<AgentValidationModel> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentValidationModel',
      args: [agentId],
    });
    return Number(result) as AgentValidationModel;
  }

  async getAgentStatus(agentId: bigint): Promise<AgentStatus> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentStatus',
      args: [agentId],
    });
    return Number(result) as AgentStatus;
  }

  async getOperatorAgents(operator: Address): Promise<bigint[]> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getOperatorAgents',
      args: [operator],
    });
    return result as bigint[];
  }

  async isOperatorOf(agentId: bigint, operator: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'isOperatorOf',
      args: [agentId, operator],
    });
    return result as boolean;
  }

  async getAgentPausedAt(agentId: bigint): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'getAgentPausedAt',
      args: [agentId],
    });
    return result as bigint;
  }

  async canReactivateAgent(agentId: bigint): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'canReactivate',
      args: [agentId],
    });
    return result as boolean;
  }

  async getOperatorNonce(operator: Address): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'operatorNonces',
      args: [operator],
    });
    return result as bigint;
  }

  // ==========================================
  // EIP-712 CONSENT SIGNING HELPER
  // ==========================================

  /**
   * Build the EIP-712 typed data for operator consent signing.
   * The operator signs this with their wallet to authorize backing an agent.
   *
   * @param consent The consent data to sign
   * @param verifyingContract The identity registry proxy address
   * @param chainId The chain ID
   */
  buildOperatorConsentTypedData(
    consent: OperatorConsentData,
    verifyingContract: Address,
    chainId: number,
  ) {
    return {
      domain: {
        name: 'TAL Identity Registry',
        version: '2',
        chainId: BigInt(chainId),
        verifyingContract,
      },
      types: {
        OperatorConsent: [
          { name: 'operator', type: 'address' },
          { name: 'agentOwner', type: 'address' },
          { name: 'agentURI', type: 'string' },
          { name: 'validationModel', type: 'uint8' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'OperatorConsent' as const,
      message: {
        operator: consent.operator,
        agentOwner: consent.agentOwner,
        agentURI: consent.agentURI,
        validationModel: consent.validationModel,
        nonce: consent.nonce,
        deadline: consent.deadline,
      },
    };
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

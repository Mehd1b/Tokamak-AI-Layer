import { type PublicClient, type WalletClient } from 'viem';
import { TALValidationRegistryABI } from '../abi/TALValidationRegistry';
import { TALValidationRegistryV2ABI } from '../abi/TALValidationRegistryV2';
import { TALValidationRegistryV3ABI } from '../abi/TALValidationRegistryV3';
import type {
  Address,
  Bytes32,
  ValidationRequestParams,
  ValidationRequest,
  ValidationResponse,
  ValidationDetails,
  ValidationModel,
  ValidationStatus,
  ValidationStats,
  DualStakingStatus,
  TransactionResult,
} from '../types';
import { ValidationModel as VM } from '../types';

export class ValidationClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly contractAddress: Address;
  private readonly identityRegistryAddress: Address | undefined;
  private readonly stakingBridgeAddress: Address | undefined;

  constructor(
    publicClient: PublicClient,
    contractAddress: Address,
    walletClient?: WalletClient,
    identityRegistryAddress?: Address,
    stakingBridgeAddress?: Address,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
    this.identityRegistryAddress = identityRegistryAddress;
    this.stakingBridgeAddress = stakingBridgeAddress;
  }

  /**
   * Request validation for an agent's output
   */
  async requestValidation(
    params: ValidationRequestParams,
  ): Promise<{ requestHash: Bytes32; tx: TransactionResult }> {
    if (params.model === VM.ReputationOnly) {
      throw new Error(
        'ReputationOnly validation is disabled in V3. ReputationOnly agents are valid by default and do not require validation requests.',
      );
    }

    this.requireWallet();

    const deadlineTimestamp = BigInt(
      Math.floor(params.deadline.getTime() / 1000),
    );

    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'requestValidation',
      args: [
        params.agentId,
        params.taskHash,
        params.outputHash,
        params.model,
        deadlineTimestamp,
      ],
      value: params.bounty,
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Parse ValidationRequested event to get requestHash
    const requestHash = this.parseRequestHashFromReceipt(receipt);

    return {
      requestHash,
      tx: {
        hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 'success' ? 'success' : 'reverted',
      },
    };
  }

  /**
   * Submit validation response
   */
  async submitValidation(
    requestHash: Bytes32,
    score: number,
    proof: `0x${string}`,
    detailsURI: string,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'submitValidation',
      args: [requestHash, score, proof, detailsURI],
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
   * Get validation details
   */
  async getValidation(requestHash: Bytes32): Promise<ValidationDetails> {
    const [reqData, respData] = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getValidation',
      args: [requestHash],
    })) as [any, any];

    const isDisputed = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'isDisputed',
      args: [requestHash],
    })) as boolean;

    const request: ValidationRequest = {
      requestHash,
      agentId: BigInt(reqData.agentId),
      requester: reqData.requester as Address,
      taskHash: reqData.taskHash as Bytes32,
      outputHash: reqData.outputHash as Bytes32,
      model: Number(reqData.model) as ValidationModel,
      bounty: BigInt(reqData.bounty),
      deadline: new Date(Number(reqData.deadline) * 1000),
      status: Number(reqData.status) as ValidationStatus,
    };

    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const hasResponse =
      respData.validator && respData.validator !== zeroAddress;

    const response: ValidationResponse | null = hasResponse
      ? {
          validator: respData.validator as Address,
          score: Number(respData.score),
          proof: respData.proof,
          detailsURI: respData.detailsURI,
          timestamp: new Date(Number(respData.timestamp) * 1000),
        }
      : null;

    return {
      request,
      response,
      isDisputed,
      disputeDeadline: null, // Would need additional contract call
    };
  }

  /**
   * Get all validation hashes for an agent
   */
  async getAgentValidations(agentId: bigint): Promise<Bytes32[]> {
    const hashes = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getAgentValidations',
      args: [agentId],
    });
    return hashes as Bytes32[];
  }

  /**
   * Get validations by requester
   */
  async getValidationsByRequester(requester: Address): Promise<Bytes32[]> {
    const hashes = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getValidationsByRequester',
      args: [requester],
    });
    return hashes as Bytes32[];
  }

  /**
   * Get validations by validator
   */
  async getValidationsByValidator(validator: Address): Promise<Bytes32[]> {
    const hashes = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getValidationsByValidator',
      args: [validator],
    });
    return hashes as Bytes32[];
  }

  /**
   * Dispute a validation
   */
  async disputeValidation(
    requestHash: Bytes32,
    evidence: `0x${string}`,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'disputeValidation',
      args: [requestHash, evidence],
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
   * Get pending validation count for an agent
   */
  async getPendingValidationCount(agentId: bigint): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getPendingValidationCount',
      args: [agentId],
    });
    return Number(count);
  }

  /**
   * Check if a TEE provider is trusted
   */
  async isTrustedTEEProvider(provider: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'isTrustedTEEProvider',
      args: [provider],
    });
    return result as boolean;
  }

  /**
   * Get the selected validator for a request
   */
  async getSelectedValidator(requestHash: Bytes32): Promise<Address> {
    const validator = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryABI,
      functionName: 'getSelectedValidator',
      args: [requestHash],
    });
    return validator as Address;
  }

  // ==========================================
  // V2 METHODS — Epoch-Based Stats
  // ==========================================

  /**
   * Get validation stats for an agent within a time window
   * @param agentId The agent ID
   * @param windowSeconds Time window in seconds (default: 30 days)
   */
  async getAgentValidationStats(
    agentId: bigint,
    windowSeconds: bigint = 2592000n, // 30 days
  ): Promise<ValidationStats> {
    const [total, failed] = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryV2ABI,
      functionName: 'getAgentValidationStats',
      args: [agentId, windowSeconds],
    })) as [bigint, bigint];

    const failureRate =
      total > 0n ? Number((failed * 10000n) / total) / 100 : 0;

    return { total, failed, failureRate };
  }

  /**
   * Get raw epoch stats for an agent
   */
  async getEpochStats(
    agentId: bigint,
    epoch: bigint,
  ): Promise<{ total: bigint; failed: bigint }> {
    const [total, failed] = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryV2ABI,
      functionName: 'getEpochStats',
      args: [agentId, epoch],
    })) as [bigint, bigint];

    return { total, failed };
  }

  /**
   * Get the current epoch number
   */
  async getCurrentEpoch(): Promise<bigint> {
    const epoch = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryV2ABI,
      functionName: 'currentEpoch',
    });
    return epoch as bigint;
  }

  // ==========================================
  // V3 METHODS — Deadline Slashing & Dual Staking
  // ==========================================

  /**
   * Slash a validator who missed a deadline on a StakeSecured request.
   * Anyone can call this after the deadline has passed for a pending request
   * that has a selected validator.
   */
  async slashForMissedDeadline(
    requestHash: Bytes32,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALValidationRegistryV3ABI,
      functionName: 'slashForMissedDeadline',
      args: [requestHash],
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
   * Check dual staking status for an agent (owner + operator stakes).
   * Requires identityRegistryAddress and stakingBridgeAddress to be configured.
   */
  async checkDualStakingStatus(agentId: bigint): Promise<DualStakingStatus> {
    if (!this.identityRegistryAddress || !this.stakingBridgeAddress) {
      throw new Error(
        'identityRegistryAddress and stakingBridgeAddress must be configured to check dual staking status',
      );
    }

    // Get agent owner from identity registry
    const owner = await this.publicClient.readContract({
      address: this.identityRegistryAddress,
      abi: [
        {
          type: 'function',
          name: 'ownerOf',
          inputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
          outputs: [{ name: '', type: 'address', internalType: 'address' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'ownerOf',
      args: [agentId],
    }) as Address;

    // Get MIN_AGENT_OWNER_STAKE from V3 contract
    const minOwnerStake = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALValidationRegistryV3ABI,
      functionName: 'MIN_AGENT_OWNER_STAKE',
    }) as bigint;

    // Get owner's stake from staking bridge
    const ownerStake = await this.publicClient.readContract({
      address: this.stakingBridgeAddress,
      abi: [
        {
          type: 'function',
          name: 'getOperatorStake',
          inputs: [{ name: 'operator', type: 'address', internalType: 'address' }],
          outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'getOperatorStake',
      args: [owner],
    }) as bigint;

    // Get operators from identity registry
    const operators = await this.publicClient.readContract({
      address: this.identityRegistryAddress,
      abi: [
        {
          type: 'function',
          name: 'getOperators',
          inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
          outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'getOperators',
      args: [agentId],
    }) as Address[];

    // Sum operator stakes
    let operatorStake = 0n;
    for (const op of operators) {
      const stake = await this.publicClient.readContract({
        address: this.stakingBridgeAddress,
        abi: [
          {
            type: 'function',
            name: 'getOperatorStake',
            inputs: [{ name: 'operator', type: 'address', internalType: 'address' }],
            outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getOperatorStake',
        args: [op],
      }) as bigint;
      operatorStake += stake;
    }

    return {
      ownerStake,
      ownerMeetsMinimum: ownerStake >= minOwnerStake,
      operatorStake,
      operatorMeetsMinimum: operatorStake >= minOwnerStake,
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

  private parseRequestHashFromReceipt(receipt: any): Bytes32 {
    // Look for ValidationRequested event
    for (const log of receipt.logs) {
      if (log.topics.length >= 2 && log.address.toLowerCase() === this.contractAddress.toLowerCase()) {
        // First indexed topic after event sig is requestHash
        return log.topics[1] as Bytes32;
      }
    }
    throw new Error(
      'Could not parse requestHash from transaction receipt',
    );
  }
}

import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { TALValidationRegistryABI } from "@tal-yield-agent/shared";
import {
  type TALClientConfig,
  type ValidationRequest,
  type ValidationResponse,
  type ValidationResult,
  ValidationModel,
  ValidationStatus,
} from "../types.js";

export class ValidationClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: Address;

  constructor(config: TALClientConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.address = config.addresses.validationRegistry;
  }

  // === Read Methods ===

  async getValidation(requestHash: Hash): Promise<ValidationResult> {
    const [request, response] = await this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getValidation",
      args: [requestHash],
    });

    return {
      request: {
        agentId: request.agentId,
        requester: request.requester,
        taskHash: request.taskHash,
        outputHash: request.outputHash,
        model: request.model as ValidationModel,
        bounty: request.bounty,
        deadline: request.deadline,
        status: request.status as ValidationStatus,
      },
      response: {
        validator: response.validator,
        score: response.score,
        proof: response.proof as Hash,
        detailsURI: response.detailsURI,
        timestamp: response.timestamp,
      },
    };
  }

  async getAgentValidations(agentId: bigint): Promise<readonly Hash[]> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getAgentValidations",
      args: [agentId],
    });
  }

  async getValidationsByRequester(requester: Address): Promise<readonly Hash[]> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getValidationsByRequester",
      args: [requester],
    });
  }

  async getValidationsByValidator(validator: Address): Promise<readonly Hash[]> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getValidationsByValidator",
      args: [validator],
    });
  }

  async getPendingValidationCount(agentId: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getPendingValidationCount",
      args: [agentId],
    });
  }

  async getSelectedValidator(requestHash: Hash): Promise<Address> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "getSelectedValidator",
      args: [requestHash],
    });
  }

  async isDisputed(requestHash: Hash): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "isDisputed",
      args: [requestHash],
    });
  }

  // === Write Methods ===

  async requestValidation(
    agentId: bigint,
    taskHash: Hash,
    outputHash: Hash,
    model: ValidationModel,
    deadline: bigint,
    bounty: bigint,
  ): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "requestValidation",
      args: [agentId, taskHash, outputHash, model, deadline],
      value: bounty,
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async submitValidation(
    requestHash: Hash,
    score: number,
    proof: Hash,
    detailsURI: string,
  ): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "submitValidation",
      args: [requestHash, score, proof, detailsURI],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async disputeValidation(requestHash: Hash, evidence: Hash): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALValidationRegistryABI,
      functionName: "disputeValidation",
      args: [requestHash, evidence],
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

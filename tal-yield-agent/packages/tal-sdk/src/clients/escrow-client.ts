import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { TaskFeeEscrowABI } from "@tal-yield-agent/shared";
import { type TALClientConfig, type TaskEscrowData, TaskStatus } from "../types.js";

export class EscrowClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: Address;

  constructor(config: TALClientConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.address = config.addresses.taskFeeEscrow;
  }

  // === Read Methods ===

  async getRefundDeadline(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "REFUND_DEADLINE",
    });
  }

  async getAgentFee(agentId: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "getAgentFee",
      args: [agentId],
    });
  }

  async getAgentBalance(agentId: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "getAgentBalance",
      args: [agentId],
    });
  }

  async isTaskPaid(taskRef: Hash): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "isTaskPaid",
      args: [taskRef],
    });
  }

  async getTaskEscrow(taskRef: Hash): Promise<TaskEscrowData> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "getTaskEscrow",
      args: [taskRef],
    });

    return {
      payer: result.payer,
      agentId: result.agentId,
      amount: result.amount,
      paidAt: result.paidAt,
      status: result.status as TaskStatus,
    };
  }

  async hasUsedAgent(agentId: bigint, user: Address): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "hasUsedAgent",
      args: [agentId, user],
    });
  }

  // === Write Methods ===

  async setAgentFee(agentId: bigint, feePerTask: bigint): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "setAgentFee",
      args: [agentId, feePerTask],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async payForTask(agentId: bigint, taskRef: Hash, value: bigint): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "payForTask",
      args: [agentId, taskRef],
      value,
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async confirmTask(taskRef: Hash): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "confirmTask",
      args: [taskRef],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async refundTask(taskRef: Hash): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "refundTask",
      args: [taskRef],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async claimFees(agentId: bigint): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TaskFeeEscrowABI,
      functionName: "claimFees",
      args: [agentId],
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

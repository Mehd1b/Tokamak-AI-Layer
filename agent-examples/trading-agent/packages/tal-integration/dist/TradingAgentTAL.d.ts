import type { PublicClient, WalletClient, Hash, Hex, Address } from "viem";
import type { Logger } from "pino";
import type { AppConfig } from "@tal-trading-agent/shared";
export declare enum EscrowTaskStatus {
    Escrowed = 0,
    Confirmed = 1,
    Refunded = 2
}
export interface TaskEscrowData {
    payer: Address;
    agentId: bigint;
    amount: bigint;
    paidAt: bigint;
    status: EscrowTaskStatus;
}
export declare class TradingAgentTAL {
    private readonly publicClient;
    private readonly walletClient;
    private readonly config;
    private readonly log;
    constructor(params: {
        publicClient: PublicClient;
        walletClient?: WalletClient;
        config: AppConfig;
        logger: Logger;
    });
    registerTradingAgent(baseUrl: string): Promise<{
        agentId: bigint;
        txHash: Hash;
    }>;
    getAgentInfo(agentId: bigint): Promise<{
        owner: Address;
        agentURI: string;
        operator: Address;
    }>;
    submitTradeResult(agentId: bigint, feedback: {
        value: number;
        tag1: string;
        tag2: string;
        endpoint: string;
    }): Promise<Hash>;
    /**
     * Submit negative reputation feedback after a failed/reverted trade.
     * Uses a negative value and "trade-failed" tags so aggregations reflect risk.
     */
    submitTradeFailure(agentId: bigint, params: {
        endpoint: string;
        reason: string;
    }): Promise<Hash>;
    getReputation(agentId: bigint): Promise<{
        feedbackCount: bigint;
        averageScore: number;
    }>;
    requestValidation(params: {
        agentId: bigint;
        taskHash: Hex;
        outputHash: Hex;
        bounty: bigint;
    }): Promise<{
        requestHash: Hex;
        txHash: Hash;
    }>;
    /**
     * Check the on-chain status of a validation request.
     * Returns the validation status enum: 0=Pending, 1=Completed, 2=Expired, 3=Disputed
     * and the validator's score if completed.
     */
    getValidationStatus(requestHash: Hex): Promise<{
        status: number;
        score: number | null;
        validator: Address | null;
    }>;
    /**
     * Set the per-task fee for this agent on the TaskFeeEscrow contract.
     * Must be called by the agent owner.
     */
    setAgentFee(agentId: bigint, feePerTask: bigint): Promise<Hash>;
    /**
     * Confirm a task has been completed, releasing escrowed funds to the agent balance.
     * Called by the agent owner/operator after analysis is delivered.
     */
    confirmTask(taskRef: Hex): Promise<Hash>;
    /**
     * Claim accumulated fees from confirmed tasks.
     * Transfers the agent's balance from the escrow to the owner.
     */
    claimFees(agentId: bigint): Promise<Hash>;
    /**
     * Read the escrow data for a specific task reference.
     */
    getEscrowStatus(taskRef: Hex): Promise<TaskEscrowData>;
    /**
     * Check if a task has been paid (escrowed) on-chain.
     */
    isTaskPaid(taskRef: Hex): Promise<boolean>;
    /**
     * Get the configured per-task fee for an agent.
     */
    getAgentFee(agentId: bigint): Promise<bigint>;
    /**
     * Get the unclaimed fee balance for an agent.
     */
    getAgentBalance(agentId: bigint): Promise<bigint>;
    private requireWallet;
    private uploadRegistration;
    private parseAgentIdFromReceipt;
}
//# sourceMappingURL=TradingAgentTAL.d.ts.map
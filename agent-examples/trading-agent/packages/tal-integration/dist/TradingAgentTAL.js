import { parseEventLogs } from "viem";
import { TAL_CONTRACTS } from "@tal-trading-agent/shared";
// ---------------------------------------------------------------------------
// Minimal inline ABIs -- only the functions/events the trading agent needs
// ---------------------------------------------------------------------------
const identityRegistryAbi = [
    {
        type: "function",
        name: "register",
        inputs: [{ name: "_agentURI", type: "string" }],
        outputs: [{ name: "agentId", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "ownerOf",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "agentURI",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getOperator",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "Transfer",
        inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "tokenId", type: "uint256", indexed: true },
        ],
    },
];
const reputationRegistryAbi = [
    {
        type: "function",
        name: "submitFeedback",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "value", type: "int128" },
            { name: "valueDecimals", type: "uint8" },
            { name: "tag1", type: "string" },
            { name: "tag2", type: "string" },
            { name: "endpoint", type: "string" },
            { name: "feedbackURI", type: "string" },
            { name: "feedbackHash", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getFeedbackCount",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getClientList",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "address[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getSummary",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "clientAddresses", type: "address[]" },
        ],
        outputs: [
            {
                name: "summary",
                type: "tuple",
                components: [
                    { name: "totalValue", type: "int256" },
                    { name: "count", type: "uint256" },
                    { name: "min", type: "int128" },
                    { name: "max", type: "int128" },
                ],
            },
        ],
        stateMutability: "view",
    },
];
const validationRegistryAbi = [
    {
        type: "function",
        name: "requestValidation",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "taskHash", type: "bytes32" },
            { name: "outputHash", type: "bytes32" },
            { name: "model", type: "uint8" },
            { name: "deadline", type: "uint256" },
        ],
        outputs: [{ name: "requestHash", type: "bytes32" }],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "getValidation",
        inputs: [{ name: "requestHash", type: "bytes32" }],
        outputs: [
            {
                name: "request",
                type: "tuple",
                components: [
                    { name: "agentId", type: "uint256" },
                    { name: "requester", type: "address" },
                    { name: "taskHash", type: "bytes32" },
                    { name: "outputHash", type: "bytes32" },
                    { name: "model", type: "uint8" },
                    { name: "bounty", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "status", type: "uint8" },
                ],
            },
            {
                name: "response",
                type: "tuple",
                components: [
                    { name: "validator", type: "address" },
                    { name: "score", type: "uint8" },
                    { name: "proof", type: "bytes" },
                    { name: "detailsURI", type: "string" },
                    { name: "timestamp", type: "uint256" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "ValidationRequested",
        inputs: [
            { name: "requestHash", type: "bytes32", indexed: true },
            { name: "agentId", type: "uint256", indexed: true },
            { name: "model", type: "uint8", indexed: false },
        ],
    },
];
const taskFeeEscrowAbi = [
    {
        type: "function",
        name: "setAgentFee",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "feePerTask", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "confirmTask",
        inputs: [{ name: "taskRef", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "claimFees",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getTaskEscrow",
        inputs: [{ name: "taskRef", type: "bytes32" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "payer", type: "address" },
                    { name: "agentId", type: "uint256" },
                    { name: "amount", type: "uint256" },
                    { name: "paidAt", type: "uint256" },
                    { name: "status", type: "uint8" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getAgentFee",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getAgentBalance",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "isTaskPaid",
        inputs: [{ name: "taskRef", type: "bytes32" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
];
// ---------------------------------------------------------------------------
// Escrow task status (mirrors on-chain enum)
// ---------------------------------------------------------------------------
export var EscrowTaskStatus;
(function (EscrowTaskStatus) {
    EscrowTaskStatus[EscrowTaskStatus["Escrowed"] = 0] = "Escrowed";
    EscrowTaskStatus[EscrowTaskStatus["Confirmed"] = 1] = "Confirmed";
    EscrowTaskStatus[EscrowTaskStatus["Refunded"] = 2] = "Refunded";
})(EscrowTaskStatus || (EscrowTaskStatus = {}));
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// StakeSecured = 1 in the on-chain ValidationModel enum
const VALIDATION_MODEL_STAKE_SECURED = 1;
// Default validation deadline offset: 24 hours from now
const DEFAULT_DEADLINE_SECONDS = 24 * 60 * 60;
// Feedback value scaling: 2 decimal places
const VALUE_DECIMALS = 2;
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
// ---------------------------------------------------------------------------
// TradingAgentTAL
// ---------------------------------------------------------------------------
export class TradingAgentTAL {
    publicClient;
    walletClient;
    config;
    log;
    constructor(params) {
        this.publicClient = params.publicClient;
        this.walletClient = params.walletClient;
        this.config = params.config;
        this.log = params.logger.child({ module: "TradingAgentTAL" });
    }
    // ========================================================================
    // IDENTITY - Agent Registration
    // ========================================================================
    async registerTradingAgent(baseUrl) {
        this.requireWallet();
        const registrationFile = {
            type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            name: "TAL Trading Agent",
            description: "AI-powered quantitative trading agent. Analyzes DEX pools, generates strategies, and executes trades via Uniswap V3.",
            active: true,
            services: {
                A2A: `${baseUrl}/api/agents/trader`,
            },
            supportedTrust: ["reputation", "crypto-economic"],
            tal: {
                capabilities: [
                    {
                        id: "trade-analysis",
                        name: "Trade Analysis",
                        description: "Analyzes DEX pools and generates quantitative trading strategies",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: {
                                    type: "string",
                                    description: "Natural language trading request",
                                },
                                budget: { type: "string", description: "Budget in wei" },
                                horizon: {
                                    type: "string",
                                    enum: ["1h", "4h", "1d", "1w", "1m"],
                                },
                                riskTolerance: {
                                    type: "string",
                                    enum: ["conservative", "moderate", "aggressive"],
                                },
                            },
                            required: ["prompt", "budget"],
                        },
                        outputSchema: {
                            type: "object",
                            properties: {
                                strategy: { type: "object" },
                                trades: { type: "array" },
                                riskMetrics: { type: "object" },
                            },
                        },
                    },
                    {
                        id: "trade-execution",
                        name: "Trade Execution",
                        description: "Executes approved trading strategies via Uniswap V3",
                        inputSchema: {
                            type: "object",
                            properties: {
                                strategyId: { type: "string" },
                                signedTransaction: { type: "string" },
                            },
                        },
                    },
                ],
                pricing: {
                    currency: "TON",
                    perRequest: "0.05",
                },
            },
        };
        const agentURI = await this.uploadRegistration(registrationFile);
        this.log.info({ agentURI }, "Registration file prepared, calling register()");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.identityRegistry,
            abi: identityRegistryAbi,
            functionName: "register",
            args: [agentURI],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        this.log.info({ txHash }, "register() tx submitted, waiting for receipt");
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`register() transaction reverted: ${txHash}`);
        }
        const agentId = this.parseAgentIdFromReceipt(receipt);
        this.log.info({ agentId: agentId.toString(), txHash }, "Agent registered on TAL");
        return { agentId, txHash };
    }
    async getAgentInfo(agentId) {
        const [owner, agentURI, operator] = await Promise.all([
            this.publicClient.readContract({
                address: TAL_CONTRACTS.identityRegistry,
                abi: identityRegistryAbi,
                functionName: "ownerOf",
                args: [agentId],
            }),
            this.publicClient.readContract({
                address: TAL_CONTRACTS.identityRegistry,
                abi: identityRegistryAbi,
                functionName: "agentURI",
                args: [agentId],
            }),
            this.publicClient.readContract({
                address: TAL_CONTRACTS.identityRegistry,
                abi: identityRegistryAbi,
                functionName: "getOperator",
                args: [agentId],
            }),
        ]);
        return {
            owner: owner,
            agentURI: agentURI,
            operator: operator,
        };
    }
    // ========================================================================
    // REPUTATION - Feedback after trades
    // ========================================================================
    async submitTradeResult(agentId, feedback) {
        this.requireWallet();
        const scaledValue = BigInt(Math.round(feedback.value * 10 ** VALUE_DECIMALS));
        this.log.info({
            agentId: agentId.toString(),
            value: feedback.value,
            scaledValue: scaledValue.toString(),
            tag1: feedback.tag1,
            tag2: feedback.tag2,
        }, "Submitting trade result feedback");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.reputationRegistry,
            abi: reputationRegistryAbi,
            functionName: "submitFeedback",
            args: [
                agentId,
                scaledValue,
                VALUE_DECIMALS,
                feedback.tag1,
                feedback.tag2,
                feedback.endpoint,
                "",
                ZERO_BYTES32,
            ],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        this.log.info({ txHash }, "submitFeedback() tx submitted");
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`submitFeedback() transaction reverted: ${txHash}`);
        }
        this.log.info({ txHash }, "Trade result feedback submitted successfully");
        return txHash;
    }
    /**
     * Submit negative reputation feedback after a failed/reverted trade.
     * Uses a negative value and "trade-failed" tags so aggregations reflect risk.
     */
    async submitTradeFailure(agentId, params) {
        this.requireWallet();
        // Negative score: -50 scaled to -5000 with 2 decimals
        const FAILURE_SCORE = BigInt(-5000);
        this.log.warn({ agentId: agentId.toString(), reason: params.reason }, "Submitting trade failure feedback (negative reputation)");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.reputationRegistry,
            abi: reputationRegistryAbi,
            functionName: "submitFeedback",
            args: [
                agentId,
                FAILURE_SCORE,
                VALUE_DECIMALS,
                "trade-failed",
                params.reason.slice(0, 32),
                params.endpoint,
                "",
                ZERO_BYTES32,
            ],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`submitFeedback() (failure) reverted: ${txHash}`);
        }
        this.log.info({ txHash }, "Trade failure feedback submitted");
        return txHash;
    }
    async getReputation(agentId) {
        const feedbackCount = (await this.publicClient.readContract({
            address: TAL_CONTRACTS.reputationRegistry,
            abi: reputationRegistryAbi,
            functionName: "getFeedbackCount",
            args: [agentId],
        }));
        if (feedbackCount === 0n) {
            return { feedbackCount: 0n, averageScore: 0 };
        }
        const clients = (await this.publicClient.readContract({
            address: TAL_CONTRACTS.reputationRegistry,
            abi: reputationRegistryAbi,
            functionName: "getClientList",
            args: [agentId],
        }));
        if (clients.length === 0) {
            return { feedbackCount, averageScore: 0 };
        }
        const summary = (await this.publicClient.readContract({
            address: TAL_CONTRACTS.reputationRegistry,
            abi: reputationRegistryAbi,
            functionName: "getSummary",
            args: [agentId, clients],
        }));
        const averageScore = summary.count > 0n
            ? Number(summary.totalValue) / Number(summary.count)
            : 0;
        return { feedbackCount, averageScore };
    }
    // ========================================================================
    // VALIDATION - StakeSecured for high-value trades
    // ========================================================================
    async requestValidation(params) {
        this.requireWallet();
        const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
        this.log.info({
            agentId: params.agentId.toString(),
            taskHash: params.taskHash,
            outputHash: params.outputHash,
            bounty: params.bounty.toString(),
            deadline: deadline.toString(),
        }, "Requesting StakeSecured validation");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.validationRegistry,
            abi: validationRegistryAbi,
            functionName: "requestValidation",
            args: [
                params.agentId,
                params.taskHash,
                params.outputHash,
                VALIDATION_MODEL_STAKE_SECURED,
                deadline,
            ],
            value: params.bounty,
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        this.log.info({ txHash }, "requestValidation() tx submitted");
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`requestValidation() transaction reverted: ${txHash}`);
        }
        const validationEvents = parseEventLogs({
            abi: validationRegistryAbi,
            logs: receipt.logs,
            eventName: "ValidationRequested",
        });
        if (validationEvents.length === 0) {
            throw new Error("ValidationRequested event not found in transaction receipt");
        }
        const requestHash = validationEvents[0].args.requestHash;
        this.log.info({ requestHash, txHash }, "Validation requested successfully");
        return { requestHash, txHash };
    }
    /**
     * Check the on-chain status of a validation request.
     * Returns the validation status enum: 0=Pending, 1=Completed, 2=Expired, 3=Disputed
     * and the validator's score if completed.
     */
    async getValidationStatus(requestHash) {
        const result = await this.publicClient.readContract({
            address: TAL_CONTRACTS.validationRegistry,
            abi: validationRegistryAbi,
            functionName: "getValidation",
            args: [requestHash],
        });
        const [request, response] = result;
        const isCompleted = request.status === 1;
        return {
            status: request.status,
            score: isCompleted ? response.score : null,
            validator: isCompleted ? response.validator : null,
        };
    }
    // ========================================================================
    // TASK FEE ESCROW - Paid analysis requests
    // ========================================================================
    /**
     * Set the per-task fee for this agent on the TaskFeeEscrow contract.
     * Must be called by the agent owner.
     */
    async setAgentFee(agentId, feePerTask) {
        this.requireWallet();
        this.log.info({ agentId: agentId.toString(), feePerTask: feePerTask.toString() }, "Setting agent fee on TaskFeeEscrow");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "setAgentFee",
            args: [agentId, feePerTask],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`setAgentFee() transaction reverted: ${txHash}`);
        }
        this.log.info({ txHash }, "Agent fee set successfully");
        return txHash;
    }
    /**
     * Confirm a task has been completed, releasing escrowed funds to the agent balance.
     * Called by the agent owner/operator after analysis is delivered.
     */
    async confirmTask(taskRef) {
        this.requireWallet();
        this.log.info({ taskRef }, "Confirming task completion on escrow");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "confirmTask",
            args: [taskRef],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`confirmTask() transaction reverted: ${txHash}`);
        }
        this.log.info({ txHash }, "Task confirmed, escrow released");
        return txHash;
    }
    /**
     * Claim accumulated fees from confirmed tasks.
     * Transfers the agent's balance from the escrow to the owner.
     */
    async claimFees(agentId) {
        this.requireWallet();
        this.log.info({ agentId: agentId.toString() }, "Claiming accumulated fees from escrow");
        const txHash = await this.walletClient.writeContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "claimFees",
            args: [agentId],
            chain: this.walletClient.chain,
            account: this.walletClient.account,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        if (receipt.status !== "success") {
            throw new Error(`claimFees() transaction reverted: ${txHash}`);
        }
        this.log.info({ txHash }, "Fees claimed successfully");
        return txHash;
    }
    /**
     * Read the escrow data for a specific task reference.
     */
    async getEscrowStatus(taskRef) {
        const result = (await this.publicClient.readContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "getTaskEscrow",
            args: [taskRef],
        }));
        return {
            payer: result.payer,
            agentId: result.agentId,
            amount: result.amount,
            paidAt: result.paidAt,
            status: result.status,
        };
    }
    /**
     * Check if a task has been paid (escrowed) on-chain.
     */
    async isTaskPaid(taskRef) {
        return (await this.publicClient.readContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "isTaskPaid",
            args: [taskRef],
        }));
    }
    /**
     * Get the configured per-task fee for an agent.
     */
    async getAgentFee(agentId) {
        return (await this.publicClient.readContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "getAgentFee",
            args: [agentId],
        }));
    }
    /**
     * Get the unclaimed fee balance for an agent.
     */
    async getAgentBalance(agentId) {
        return (await this.publicClient.readContract({
            address: TAL_CONTRACTS.taskFeeEscrow,
            abi: taskFeeEscrowAbi,
            functionName: "getAgentBalance",
            args: [agentId],
        }));
    }
    // ========================================================================
    // Private helpers
    // ========================================================================
    requireWallet() {
        if (!this.walletClient) {
            throw new Error("WalletClient required for write operations. Provide walletClient in constructor params.");
        }
        if (!this.walletClient.account) {
            throw new Error("WalletClient must have an account connected.");
        }
    }
    async uploadRegistration(file) {
        const { pinataApiKey, pinataSecretKey } = this.config;
        if (pinataApiKey && pinataSecretKey) {
            this.log.info("Uploading registration file to IPFS via Pinata");
            const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    pinata_api_key: pinataApiKey,
                    pinata_secret_api_key: pinataSecretKey,
                },
                body: JSON.stringify({
                    pinataContent: file,
                    pinataMetadata: { name: "TAL Trading Agent Registration" },
                }),
            });
            if (!response.ok) {
                throw new Error(`Pinata upload failed: ${response.status} ${response.statusText}`);
            }
            const data = (await response.json());
            const uri = `ipfs://${data.IpfsHash}`;
            this.log.info({ uri }, "Registration file uploaded to IPFS");
            return uri;
        }
        // Fallback: use a data URI with the JSON inline
        this.log.warn("No Pinata credentials configured, using inline data URI as placeholder");
        const encoded = Buffer.from(JSON.stringify(file)).toString("base64");
        return `data:application/json;base64,${encoded}`;
    }
    parseAgentIdFromReceipt(receipt) {
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() ===
                TAL_CONTRACTS.identityRegistry.toLowerCase() &&
                log.topics.length >= 4) {
                const from = log.topics[1];
                if (from ===
                    "0x0000000000000000000000000000000000000000000000000000000000000000") {
                    return BigInt(log.topics[3]);
                }
            }
        }
        throw new Error("Could not parse agentId from transaction receipt");
    }
}
//# sourceMappingURL=TradingAgentTAL.js.map
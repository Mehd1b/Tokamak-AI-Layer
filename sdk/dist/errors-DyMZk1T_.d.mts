import { WalletClient, PublicClient } from 'viem';

interface DeploymentAddresses {
    agentRegistry: `0x${string}`;
    vaultFactory: `0x${string}`;
    kernelExecutionVerifier: `0x${string}`;
    riscZeroVerifierRouter: `0x${string}`;
}
declare const SEPOLIA_ADDRESSES: DeploymentAddresses;
declare const DEPLOYMENTS: Record<number, DeploymentAddresses>;
declare const DEFAULT_CHAIN_ID = 1;

declare enum KernelActionType {
    CALL = 2,
    TRANSFER_ERC20 = 3,
    NO_OP = 4
}
declare enum ExecutionStatus {
    Success = 1,
    Failure = 2
}
interface KernelInput {
    protocolVersion: number;
    kernelVersion: number;
    agentId: `0x${string}`;
    agentCodeHash: `0x${string}`;
    constraintSetHash: `0x${string}`;
    inputRoot: `0x${string}`;
    executionNonce: bigint;
    opaqueAgentInputs: `0x${string}`;
}
interface KernelJournal extends KernelInput {
    inputCommitment: `0x${string}`;
    actionCommitment: `0x${string}`;
    executionStatus: ExecutionStatus;
}
interface ParsedJournal {
    agentId: `0x${string}`;
    agentCodeHash: `0x${string}`;
    constraintSetHash: `0x${string}`;
    inputRoot: `0x${string}`;
    executionNonce: bigint;
    inputCommitment: `0x${string}`;
    actionCommitment: `0x${string}`;
}
interface KernelAction {
    actionType: KernelActionType;
    target: `0x${string}`;
    payload: `0x${string}`;
}
interface KernelAgentInfo {
    agentId: `0x${string}`;
    author: `0x${string}`;
    imageId: `0x${string}`;
    agentCodeHash: `0x${string}`;
    exists: boolean;
}
interface KernelVaultInfo {
    address: `0x${string}`;
    owner: `0x${string}`;
    agentId: `0x${string}`;
    asset: `0x${string}`;
    totalAssets: bigint;
    totalShares: bigint;
    totalValueLocked: bigint;
    userShares: bigint;
    userAssets: bigint;
}
interface DeployVaultParams {
    agentId: `0x${string}`;
    asset: `0x${string}`;
    userSalt: `0x${string}`;
    expectedImageId: `0x${string}`;
}
interface ExecuteParams {
    journal: `0x${string}`;
    seal: `0x${string}`;
    agentOutputBytes: `0x${string}`;
}

interface ExecutionKernelConfig {
    chainId?: number;
    rpcUrl?: string;
    agentRegistry?: `0x${string}`;
    vaultFactory?: `0x${string}`;
    kernelExecutionVerifier?: `0x${string}`;
    walletClient?: WalletClient;
    publicClient?: PublicClient;
}

declare class AgentRegistryClient {
    private readonly publicClient;
    private readonly walletClient;
    private readonly address;
    constructor(publicClient: PublicClient, address: `0x${string}`, walletClient?: WalletClient);
    computeAgentId(author: `0x${string}`, salt: `0x${string}`): Promise<`0x${string}`>;
    register(params: {
        salt: `0x${string}`;
        imageId: `0x${string}`;
        agentCodeHash: `0x${string}`;
    }): Promise<{
        agentId: `0x${string}`;
        txHash: `0x${string}`;
    }>;
    update(params: {
        agentId: `0x${string}`;
        newImageId: `0x${string}`;
        newAgentCodeHash: `0x${string}`;
    }): Promise<`0x${string}`>;
    get(agentId: `0x${string}`): Promise<KernelAgentInfo>;
    getAllAgentIds(): Promise<`0x${string}`[]>;
    agentExists(agentId: `0x${string}`): Promise<boolean>;
    private requireWallet;
}

declare class VaultFactoryClient {
    private readonly publicClient;
    private readonly walletClient;
    private readonly address;
    constructor(publicClient: PublicClient, address: `0x${string}`, walletClient?: WalletClient);
    registry(): Promise<`0x${string}`>;
    verifier(): Promise<`0x${string}`>;
    computeVaultAddress(owner: `0x${string}`, agentId: `0x${string}`, asset: `0x${string}`, userSalt: `0x${string}`): Promise<{
        vault: `0x${string}`;
        salt: `0x${string}`;
    }>;
    deployVault(params: DeployVaultParams): Promise<{
        vaultAddress: `0x${string}`;
        txHash: `0x${string}`;
    }>;
    getAllVaults(): Promise<`0x${string}`[]>;
    getAgentVaults(agentId: `0x${string}`): Promise<`0x${string}`[]>;
    isDeployedVault(vault: `0x${string}`): Promise<boolean>;
    private requireWallet;
}

declare class KernelVaultClient {
    private readonly publicClient;
    private readonly walletClient;
    readonly vaultAddress: `0x${string}`;
    constructor(publicClient: PublicClient, vaultAddress: `0x${string}`, walletClient?: WalletClient);
    asset(): Promise<`0x${string}`>;
    agentId(): Promise<`0x${string}`>;
    trustedImageId(): Promise<`0x${string}`>;
    totalShares(): Promise<bigint>;
    totalAssets(): Promise<bigint>;
    totalDeposited(): Promise<bigint>;
    totalWithdrawn(): Promise<bigint>;
    totalValueLocked(): Promise<bigint>;
    shares(account: `0x${string}`): Promise<bigint>;
    lastExecutionNonce(): Promise<bigint>;
    lastExecutionTimestamp(): Promise<bigint>;
    convertToShares(assets: bigint): Promise<bigint>;
    convertToAssets(sharesAmount: bigint): Promise<bigint>;
    depositERC20(assets: bigint): Promise<{
        sharesMinted: bigint;
        txHash: `0x${string}`;
    }>;
    depositETH(value: bigint): Promise<{
        sharesMinted: bigint;
        txHash: `0x${string}`;
    }>;
    withdraw(shareAmount: bigint): Promise<{
        assetsOut: bigint;
        txHash: `0x${string}`;
    }>;
    execute(params: ExecuteParams): Promise<`0x${string}`>;
    getInfo(userAddress?: `0x${string}`): Promise<KernelVaultInfo>;
    private parseDepositEvent;
    private parseWithdrawEvent;
    private requireWallet;
}

declare class VerifierClient {
    private readonly publicClient;
    private readonly address;
    constructor(publicClient: PublicClient, address: `0x${string}`);
    verifyAndParse(expectedImageId: `0x${string}`, journal: `0x${string}`, seal: `0x${string}`): Promise<ParsedJournal>;
    parseJournal(journal: `0x${string}`): Promise<ParsedJournal>;
}

declare class ExecutionKernelClient {
    readonly agents: AgentRegistryClient;
    readonly vaultFactory: VaultFactoryClient;
    readonly verifier: VerifierClient;
    private readonly publicClient;
    private readonly walletClient;
    private readonly config;
    constructor(config: ExecutionKernelConfig);
    /**
     * Create a KernelVaultClient for a specific vault address
     */
    createVaultClient(vaultAddress: `0x${string}`): KernelVaultClient;
    /**
     * Register a new agent on the AgentRegistry
     */
    registerAgent(params: {
        salt: `0x${string}`;
        imageId: `0x${string}`;
        agentCodeHash: `0x${string}`;
    }): Promise<{
        agentId: `0x${string}`;
        txHash: `0x${string}`;
    }>;
    /**
     * Get agent information by ID
     */
    getAgent(agentId: `0x${string}`): Promise<KernelAgentInfo>;
    /**
     * Deploy a new vault via VaultFactory
     */
    deployVault(params: DeployVaultParams): Promise<{
        vaultAddress: `0x${string}`;
        txHash: `0x${string}`;
    }>;
    /**
     * Verify an execution proof and parse the journal
     */
    verifyExecution(imageId: `0x${string}`, journal: `0x${string}`, seal: `0x${string}`): Promise<{
        valid: boolean;
        parsed: ParsedJournal;
    }>;
}

declare enum ErrorCode {
    NETWORK_MISMATCH = "NETWORK_MISMATCH",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    USER_REJECTED = "USER_REJECTED",
    APPROVAL_FAILED = "APPROVAL_FAILED",
    DEPOSIT_FAILED = "DEPOSIT_FAILED",
    WITHDRAW_FAILED = "WITHDRAW_FAILED",
    AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
    VAULT_NOT_FOUND = "VAULT_NOT_FOUND",
    STRATEGY_ACTIVE = "STRATEGY_ACTIVE",
    TRANSACTION_REVERTED = "TRANSACTION_REVERTED"
}
declare class TokamakError extends Error {
    readonly code: ErrorCode;
    readonly cause?: unknown;
    constructor(code: ErrorCode, message: string, cause?: unknown);
    static from(err: unknown): TokamakError;
}
declare class DepositError extends TokamakError {
    constructor(code: ErrorCode, message: string, cause?: unknown);
    static from(err: unknown): DepositError;
}
declare class WithdrawError extends TokamakError {
    constructor(code: ErrorCode, message: string, cause?: unknown);
    static from(err: unknown): WithdrawError;
}

export { AgentRegistryClient as A, DEFAULT_CHAIN_ID as D, ErrorCode as E, type KernelAction as K, type ParsedJournal as P, SEPOLIA_ADDRESSES as S, TokamakError as T, VaultFactoryClient as V, WithdrawError as W, DEPLOYMENTS as a, type DeployVaultParams as b, type DeploymentAddresses as c, DepositError as d, type ExecuteParams as e, ExecutionKernelClient as f, type ExecutionKernelConfig as g, ExecutionStatus as h, KernelActionType as i, type KernelAgentInfo as j, type KernelInput as k, type KernelJournal as l, KernelVaultClient as m, type KernelVaultInfo as n, VerifierClient as o };

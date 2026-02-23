import { WalletClient, PublicClient } from 'viem';

interface DeploymentAddresses {
    agentRegistry: `0x${string}`;
    vaultFactory: `0x${string}`;
    kernelExecutionVerifier: `0x${string}`;
    riscZeroVerifierRouter: `0x${string}`;
}
declare const SEPOLIA_ADDRESSES: DeploymentAddresses;
declare const DEPLOYMENTS: Record<number, DeploymentAddresses>;
declare const DEFAULT_CHAIN_ID = 11155111;

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

declare const AgentRegistryABI: readonly [{
    readonly type: "function";
    readonly name: "owner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "upgradeToAndCall";
    readonly inputs: readonly [{
        readonly name: "newImplementation";
        readonly type: "address";
    }, {
        readonly name: "data";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "payable";
}, {
    readonly type: "function";
    readonly name: "computeAgentId";
    readonly inputs: readonly [{
        readonly name: "author";
        readonly type: "address";
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "pure";
}, {
    readonly type: "function";
    readonly name: "register";
    readonly inputs: readonly [{
        readonly name: "salt";
        readonly type: "bytes32";
    }, {
        readonly name: "imageId";
        readonly type: "bytes32";
    }, {
        readonly name: "agentCodeHash";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "update";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "newImageId";
        readonly type: "bytes32";
    }, {
        readonly name: "newAgentCodeHash";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "get";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "info";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "author";
            readonly type: "address";
        }, {
            readonly name: "imageId";
            readonly type: "bytes32";
        }, {
            readonly name: "agentCodeHash";
            readonly type: "bytes32";
        }, {
            readonly name: "_deprecated";
            readonly type: "string";
        }, {
            readonly name: "exists";
            readonly type: "bool";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "unregister";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "vaults";
        readonly type: "address[]";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "agentExists";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "agentCount";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "agentAt";
    readonly inputs: readonly [{
        readonly name: "index";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "getAllAgentIds";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "AgentUnregistered";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "author";
        readonly type: "address";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "AgentRegistered";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "author";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "imageId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "agentCodeHash";
        readonly type: "bytes32";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "AgentUpdated";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "newImageId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "newAgentCodeHash";
        readonly type: "bytes32";
        readonly indexed: false;
    }];
}, {
    readonly type: "error";
    readonly name: "AgentAlreadyExists";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
}, {
    readonly type: "error";
    readonly name: "AgentNotFound";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
}, {
    readonly type: "error";
    readonly name: "NotAgentAuthor";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "caller";
        readonly type: "address";
    }, {
        readonly name: "author";
        readonly type: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "InvalidImageId";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidAgentCodeHash";
    readonly inputs: readonly [];
}];

declare const VaultFactoryABI: readonly [{
    readonly type: "function";
    readonly name: "owner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "upgradeToAndCall";
    readonly inputs: readonly [{
        readonly name: "newImplementation";
        readonly type: "address";
    }, {
        readonly name: "data";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "payable";
}, {
    readonly type: "function";
    readonly name: "registry";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "verifier";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "computeVaultAddress";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "userSalt";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "deployVault";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "userSalt";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "isDeployedVault";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "vaultCount";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "vaultAt";
    readonly inputs: readonly [{
        readonly name: "index";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "getAllVaults";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "VaultDeployed";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "asset";
        readonly type: "address";
        readonly indexed: false;
    }, {
        readonly name: "trustedImageId";
        readonly type: "bytes32";
        readonly indexed: false;
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
        readonly indexed: false;
    }];
}, {
    readonly type: "error";
    readonly name: "AgentNotRegistered";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
}, {
    readonly type: "error";
    readonly name: "NotAgentAuthor";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "caller";
        readonly type: "address";
    }, {
        readonly name: "author";
        readonly type: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "VaultAlreadyExists";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }];
}];

declare const KernelVaultABI: readonly [{
    readonly type: "function";
    readonly name: "asset";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "agentId";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "trustedImageId";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalShares";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalAssets";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalDeposited";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalWithdrawn";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalValueLocked";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "shares";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lastExecutionNonce";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint64";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lastExecutionTimestamp";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "convertToShares";
    readonly inputs: readonly [{
        readonly name: "assets";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "convertToAssets";
    readonly inputs: readonly [{
        readonly name: "_shares";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "depositERC20Tokens";
    readonly inputs: readonly [{
        readonly name: "assets";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "sharesMinted";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "depositETH";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "sharesMinted";
        readonly type: "uint256";
    }];
    readonly stateMutability: "payable";
}, {
    readonly type: "function";
    readonly name: "withdraw";
    readonly inputs: readonly [{
        readonly name: "shareAmount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "assetsOut";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "execute";
    readonly inputs: readonly [{
        readonly name: "journal";
        readonly type: "bytes";
    }, {
        readonly name: "seal";
        readonly type: "bytes";
    }, {
        readonly name: "agentOutputBytes";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "event";
    readonly name: "Deposit";
    readonly inputs: readonly [{
        readonly name: "sender";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "shares";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "Withdraw";
    readonly inputs: readonly [{
        readonly name: "sender";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "shares";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "ExecutionApplied";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "executionNonce";
        readonly type: "uint64";
        readonly indexed: true;
    }, {
        readonly name: "actionCommitment";
        readonly type: "bytes32";
        readonly indexed: false;
    }, {
        readonly name: "actionCount";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}];

declare const KernelExecutionVerifierABI: readonly [{
    readonly type: "function";
    readonly name: "owner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "upgradeToAndCall";
    readonly inputs: readonly [{
        readonly name: "newImplementation";
        readonly type: "address";
    }, {
        readonly name: "data";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "payable";
}, {
    readonly type: "function";
    readonly name: "verifyAndParseWithImageId";
    readonly inputs: readonly [{
        readonly name: "expectedImageId";
        readonly type: "bytes32";
    }, {
        readonly name: "journal";
        readonly type: "bytes";
    }, {
        readonly name: "seal";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "parsed";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "agentId";
            readonly type: "bytes32";
        }, {
            readonly name: "agentCodeHash";
            readonly type: "bytes32";
        }, {
            readonly name: "constraintSetHash";
            readonly type: "bytes32";
        }, {
            readonly name: "inputRoot";
            readonly type: "bytes32";
        }, {
            readonly name: "executionNonce";
            readonly type: "uint64";
        }, {
            readonly name: "inputCommitment";
            readonly type: "bytes32";
        }, {
            readonly name: "actionCommitment";
            readonly type: "bytes32";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "parseJournal";
    readonly inputs: readonly [{
        readonly name: "journal";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "parsed";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "agentId";
            readonly type: "bytes32";
        }, {
            readonly name: "agentCodeHash";
            readonly type: "bytes32";
        }, {
            readonly name: "constraintSetHash";
            readonly type: "bytes32";
        }, {
            readonly name: "inputRoot";
            readonly type: "bytes32";
        }, {
            readonly name: "executionNonce";
            readonly type: "uint64";
        }, {
            readonly name: "inputCommitment";
            readonly type: "bytes32";
        }, {
            readonly name: "actionCommitment";
            readonly type: "bytes32";
        }];
    }];
    readonly stateMutability: "pure";
}];

export { AgentRegistryABI, AgentRegistryClient, DEFAULT_CHAIN_ID, DEPLOYMENTS, type DeployVaultParams, type DeploymentAddresses, type ExecuteParams, ExecutionKernelClient, type ExecutionKernelConfig, ExecutionStatus, type KernelAction, KernelActionType, type KernelAgentInfo, KernelExecutionVerifierABI, type KernelInput, type KernelJournal, KernelVaultABI, KernelVaultClient, type KernelVaultInfo, SEPOLIA_ADDRESSES as OPTIMISM_SEPOLIA_ADDRESSES, type ParsedJournal, SEPOLIA_ADDRESSES, VaultFactoryABI, VaultFactoryClient, VerifierClient };

export { A as AgentRegistryClient, D as DEFAULT_CHAIN_ID, a as DEPLOYMENTS, b as DeployVaultParams, c as DeploymentAddresses, d as DepositError, E as ErrorCode, e as ExecuteParams, f as ExecutionKernelClient, g as ExecutionKernelConfig, h as ExecutionStatus, K as KernelAction, i as KernelActionType, j as KernelAgentInfo, k as KernelInput, l as KernelJournal, m as KernelVaultClient, n as KernelVaultInfo, S as OPTIMISM_SEPOLIA_ADDRESSES, P as ParsedJournal, S as SEPOLIA_ADDRESSES, T as TokamakError, V as VaultFactoryClient, o as VerifierClient, W as WithdrawError } from './errors-Bo9oKMn7.mjs';
import 'viem';

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
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "transferOwnership";
    readonly inputs: readonly [{
        readonly name: "newOwner";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "factory";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "setFactory";
    readonly inputs: readonly [{
        readonly name: "factory_";
        readonly type: "address";
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
}, {
    readonly type: "error";
    readonly name: "VaultHasDeposits";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }, {
        readonly name: "assets";
        readonly type: "uint256";
    }];
}, {
    readonly type: "error";
    readonly name: "OwnableUnauthorizedAccount";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferred";
    readonly inputs: readonly [{
        readonly name: "previousOwner";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "newOwner";
        readonly type: "address";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "FactoryUpdated";
    readonly inputs: readonly [{
        readonly name: "previousFactory";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "newFactory";
        readonly type: "address";
        readonly indexed: true;
    }];
}, {
    readonly type: "function";
    readonly name: "setMetadataURI";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "uri";
        readonly type: "string";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "getMetadataURI";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "AgentMetadataUpdated";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "metadataURI";
        readonly type: "string";
        readonly indexed: false;
    }];
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
    }, {
        readonly name: "expectedImageId";
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
    readonly type: "function";
    readonly name: "getAgentVaults";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "transferOwnership";
    readonly inputs: readonly [{
        readonly name: "newOwner";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
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
}, {
    readonly type: "error";
    readonly name: "ImageIdChanged";
    readonly inputs: readonly [{
        readonly name: "expected";
        readonly type: "bytes32";
    }, {
        readonly name: "actual";
        readonly type: "bytes32";
    }];
}, {
    readonly type: "function";
    readonly name: "vaultProtocolType";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint8";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "setVaultProtocolType";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
    }, {
        readonly name: "protocolType";
        readonly type: "uint8";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "event";
    readonly name: "VaultProtocolTypeSet";
    readonly inputs: readonly [{
        readonly name: "vault";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "protocolType";
        readonly type: "uint8";
        readonly indexed: false;
    }];
}, {
    readonly type: "error";
    readonly name: "OwnableUnauthorizedAccount";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferred";
    readonly inputs: readonly [{
        readonly name: "previousOwner";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "newOwner";
        readonly type: "address";
        readonly indexed: true;
    }];
}];

declare const KernelVaultABI: readonly [{
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

export { AgentRegistryABI, KernelExecutionVerifierABI, KernelVaultABI, VaultFactoryABI };

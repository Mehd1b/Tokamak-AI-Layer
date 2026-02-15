export declare const aaveV3PoolAbi: readonly [{
    readonly name: "getReserveData";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "configuration";
            readonly type: "uint256";
        }, {
            readonly name: "liquidityIndex";
            readonly type: "uint128";
        }, {
            readonly name: "currentLiquidityRate";
            readonly type: "uint128";
        }, {
            readonly name: "variableBorrowIndex";
            readonly type: "uint128";
        }, {
            readonly name: "currentVariableBorrowRate";
            readonly type: "uint128";
        }, {
            readonly name: "currentStableBorrowRate";
            readonly type: "uint128";
        }, {
            readonly name: "lastUpdateTimestamp";
            readonly type: "uint40";
        }, {
            readonly name: "id";
            readonly type: "uint16";
        }, {
            readonly name: "aTokenAddress";
            readonly type: "address";
        }, {
            readonly name: "stableDebtTokenAddress";
            readonly type: "address";
        }, {
            readonly name: "variableDebtTokenAddress";
            readonly type: "address";
        }, {
            readonly name: "interestRateStrategyAddress";
            readonly type: "address";
        }, {
            readonly name: "accruedToTreasury";
            readonly type: "uint128";
        }, {
            readonly name: "unbacked";
            readonly type: "uint128";
        }, {
            readonly name: "isolationModeTotalDebt";
            readonly type: "uint128";
        }];
    }];
}, {
    readonly name: "getUserAccountData";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "user";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "totalCollateralBase";
        readonly type: "uint256";
    }, {
        readonly name: "totalDebtBase";
        readonly type: "uint256";
    }, {
        readonly name: "availableBorrowsBase";
        readonly type: "uint256";
    }, {
        readonly name: "currentLiquidationThreshold";
        readonly type: "uint256";
    }, {
        readonly name: "ltv";
        readonly type: "uint256";
    }, {
        readonly name: "healthFactor";
        readonly type: "uint256";
    }];
}, {
    readonly name: "supply";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "onBehalfOf";
        readonly type: "address";
    }, {
        readonly name: "referralCode";
        readonly type: "uint16";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "borrow";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "interestRateMode";
        readonly type: "uint256";
    }, {
        readonly name: "referralCode";
        readonly type: "uint16";
    }, {
        readonly name: "onBehalfOf";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "repay";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "interestRateMode";
        readonly type: "uint256";
    }, {
        readonly name: "onBehalfOf";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}, {
    readonly name: "withdraw";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "to";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}];
export declare const aaveV3PoolDataProviderAbi: readonly [{
    readonly name: "getReserveConfigurationData";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "decimals";
        readonly type: "uint256";
    }, {
        readonly name: "ltv";
        readonly type: "uint256";
    }, {
        readonly name: "liquidationThreshold";
        readonly type: "uint256";
    }, {
        readonly name: "liquidationBonus";
        readonly type: "uint256";
    }, {
        readonly name: "reserveFactor";
        readonly type: "uint256";
    }, {
        readonly name: "usageAsCollateralEnabled";
        readonly type: "bool";
    }, {
        readonly name: "borrowingEnabled";
        readonly type: "bool";
    }, {
        readonly name: "stableBorrowRateEnabled";
        readonly type: "bool";
    }, {
        readonly name: "isActive";
        readonly type: "bool";
    }, {
        readonly name: "isFrozen";
        readonly type: "bool";
    }];
}, {
    readonly name: "getReserveData";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "unbacked";
        readonly type: "uint256";
    }, {
        readonly name: "accruedToTreasuryScaled";
        readonly type: "uint256";
    }, {
        readonly name: "totalAToken";
        readonly type: "uint256";
    }, {
        readonly name: "totalStableDebt";
        readonly type: "uint256";
    }, {
        readonly name: "totalVariableDebt";
        readonly type: "uint256";
    }, {
        readonly name: "liquidityRate";
        readonly type: "uint256";
    }, {
        readonly name: "variableBorrowRate";
        readonly type: "uint256";
    }, {
        readonly name: "stableBorrowRate";
        readonly type: "uint256";
    }, {
        readonly name: "averageStableBorrowRate";
        readonly type: "uint256";
    }, {
        readonly name: "liquidityIndex";
        readonly type: "uint256";
    }, {
        readonly name: "variableBorrowIndex";
        readonly type: "uint256";
    }, {
        readonly name: "lastUpdateTimestamp";
        readonly type: "uint40";
    }];
}];
export declare const aaveV3OracleAbi: readonly [{
    readonly name: "getAssetPrice";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}, {
    readonly name: "getAssetsPrices";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "assets";
        readonly type: "address[]";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256[]";
    }];
}];
export declare const erc20ApproveAbi: readonly [{
    readonly name: "approve";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
}];
//# sourceMappingURL=AaveV3Abi.d.ts.map
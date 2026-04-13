# Setter / Admin Functions

## KernelVault
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| setOracleSigner(address, uint64) | onlyOwner | YES | OracleSignerUpdated |
| setBondSigner(address) | onlyOwner | YES | BondSignerUpdated |
| setRequireOracle(bool) | onlyOwner | YES | RequireOracleUpdated |
| setAccessControl(address) | onlyOwner | **NO** | **SILENT SETTER** |
| setFees(uint256, uint256) | onlyOwner | YES | FeesUpdated |
| setFeeRecipient(address) | onlyOwner | YES | FeeRecipientUpdated |
| setProtocolTreasury(address, uint256) | onlyOwner | YES | ProtocolTreasuryUpdated |
| pause() | onlyOwner | YES | Paused (OZ) |
| unpause() | onlyOwner | YES | Unpaused (OZ) |
| rescueTokens(address, address, uint256) | onlyOwner (+ totalShares==0) | **NO** | **SILENT SETTER** |
| settle() | onlyOwner | YES | StrategySettled |

## OptimisticKernelVault
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| setChallengeWindow(uint256) | onlyOwner | YES | OptimisticConfigUpdated |
| setMinBond(uint256) | onlyOwner | YES | OptimisticConfigUpdated |
| setMaxPending(uint256) | onlyOwner | YES | OptimisticConfigUpdated |
| setOptimisticEnabled(bool) | onlyOwner | YES | OptimisticConfigUpdated |
| setBondChainId(uint256) | onlyOwner | YES | BondChainIdUpdated |

## MetaVault
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| addVault(address, uint256) | onlyOwner | YES | VaultAdded |
| removeVault(address) | onlyOwner | YES | VaultRemoved |
| sweepDonations() | onlyOwner | YES | DonationSwept |
| rebalance(address[], uint256[]) | onlyOwner | YES | Rebalanced |

## WSTONBondManager
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| setTreasury(address) | onlyOwner | YES | TreasuryUpdated |
| setMinBondFloor(uint256) | onlyOwner | YES | MinBondFloorUpdated |
| authorizeVault(address) | onlyOwner | YES | VaultAuthorized |
| revokeVault(address) | onlyOwner | YES | VaultRevoked |
| setTrustedRelayer(address) | onlyOwner | YES | TrustedRelayerUpdated or TrustedRelayerProposed |
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferred |
| rescueTokens(address, address, uint256) | onlyOwner | YES | TokensRescued |
| markSlashPending(address, address, uint64) | relayer or owner | YES | SlashPendingMarked |

## AgentRegistry
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferProposed |
| setFactory(address) | onlyOwner | YES | FactoryUpdated |
| scheduleImplementation(address) | onlyOwner | YES | ImplementationScheduled |
| cancelImplementation() | onlyOwner | YES | ImplementationCancelled |
| setMetadataURI(bytes32, string) | agent author | YES | AgentMetadataUpdated |

## VaultFactory
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferProposed |
| scheduleImplementation(address) | onlyOwner | YES | ImplementationScheduled |
| cancelImplementation() | onlyOwner | YES | ImplementationCancelled |
| setVaultCreationCodeStore(address) | onlyOwner (initial only) | YES | VaultCreationCodeStoreUpdated |
| setOptimisticVaultCreationCodeStore(address) | onlyOwner (initial only) | YES | OptimisticVaultCreationCodeStoreUpdated |
| scheduleVaultCreationCodeStore(address) | onlyOwner | YES | VaultCodeStoreScheduled |
| activateVaultCreationCodeStore() | onlyOwner | YES | VaultCreationCodeStoreUpdated |
| scheduleOptimisticVaultCreationCodeStore(address) | onlyOwner | YES | OptimisticVaultCodeStoreScheduled |
| activateOptimisticVaultCreationCodeStore() | onlyOwner | YES | OptimisticVaultCreationCodeStoreUpdated |
| setProtocolTreasury(address) | onlyOwner | YES | ProtocolTreasuryUpdated |
| setDefaultProtocolFeeSplitBps(uint256) | onlyOwner | YES | DefaultProtocolFeeSplitUpdated |
| setVaultProtocolType(address, uint8) | owner or vault owner | YES | VaultProtocolTypeSet |
| registerExternalVault(address, bytes32) | onlyOwner | YES | ExternalVaultRegistered |

## KernelExecutionVerifier
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferProposed |
| setVerificationPaused(bool) | onlyOwner | YES | VerificationPauseSet |
| approveVerifier(address) | onlyOwner | YES | VerifierApproved |
| revokeVerifier(address) | onlyOwner | YES | VerifierRevoked (+ VerifierProposalCancelled if pending) |
| proposeVerifier(address) | onlyOwner | YES | VerifierProposed |
| cancelVerifierProposal() | onlyOwner | YES | VerifierProposalCancelled |

## PointsProgram
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferred |
| setSeasonEnd(uint256) | onlyOwner | YES | SeasonEndUpdated |
| setAuthorizedCaller(address, bool) | onlyOwner | YES | AuthorizedCallerUpdated |
| setReferrer(address, address) | authorizedCallers | YES | ReferrerSet |

## BuilderProgram
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferred |
| setAuthorizedUpdater(address, bool) | onlyOwner | YES | AuthorizedUpdaterSet |

## ReferralManager
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferred |
| setAuthorizedRecorder(address, bool) | onlyOwner | YES | AuthorizedRecorderSet |

## VaultAccessControl
| Function | Access | Emits Event? | Event |
|----------|--------|--------------|-------|
| transferOwnership(address) | onlyOwner | YES | OwnershipTransferred |
| setWhitelistEnabled(bool) | onlyOwner | YES | WhitelistEnabledUpdated |
| addToWhitelist(address[]) | onlyOwner | YES | WhitelistAdded |
| removeFromWhitelist(address[]) | onlyOwner | YES | WhitelistRemoved |
| setDepositCapEnabled(bool) | onlyOwner | YES | DepositCapEnabledUpdated |
| setDepositCap(address, uint256) | onlyOwner | YES | DepositCapSet |
| setDefaultDepositCap(uint256) | onlyOwner | YES | DefaultDepositCapSet |
| setKycVerifierEnabled(bool) | onlyOwner | YES | KycVerifierEnabledUpdated |
| setKycVerifier(address) | onlyOwner | YES | KycVerifierSet |

## Adapters (common pattern)
| Contract | Function | Access | Emits Event? |
|----------|----------|--------|--------------|
| AaveV3Adapter | setAllowedAsset(address, address, bool) | vault owner | YES (AssetAllowanceUpdated) |
| AaveV3Adapter | setMinHealthFactor(uint256) | onlyAdapterOwner | YES (MinHealthFactorUpdated) |
| UniswapV4Adapter | setSlippage(address, uint256) | vault owner | YES (SlippageUpdated) |
| UniswapV4Adapter | setDefaultFee(address, uint24) | vault owner | YES (DefaultFeeUpdated) |
| PendleAdapter | setMarketWhitelist(address, address, bool) | vault owner | YES (MarketWhitelistUpdated) |
| PendleAdapter | setExpiryBuffer(address, uint256) | vault owner or adapter owner | YES (ExpiryBufferUpdated) |

## Permissionless State-Modifiers

| Function | Contract | Who Can Call | Side Effect |
|----------|----------|-------------|-------------|
| emergencySettle() | KernelVault | Anyone (after 7d) | Clears strategy state |
| emergencyWithdraw() | KernelVault | Any share holder (paused + 14d) | Burns shares, transfers assets |
| slashExpired(uint64) | OptimisticKernelVault | Anyone (after deadline) | Slashes bond, emits event |
| activateTrustedRelayer() | WSTONBondManager | Anyone (after delay) | Activates queued relayer |
| activateVerifier() | KernelExecutionVerifier | Anyone (after delay) | Activates queued verifier |
| acceptOwnership() | AgentRegistry, VaultFactory, KernelExecutionVerifier | Pending owner only | Transfers ownership |
| reclaimExpiredBond() | WSTONBondManager | Bond operator (after 90d) | Releases expired bond |
| register(bytes32, bytes32, bytes32) | AgentRegistry | Anyone | Creates agent entry |
| registerCode(string) | ReferralManager | Anyone | Creates referral code |

## Setter x Emit Cross-Reference — SILENT SETTERs

| Setter Function | Contract | Emits Event? | Event Name | Missing? |
|-----------------|----------|--------------|------------|----------|
| setAccessControl(address) | KernelVault | NO | - | **MISSING_EVENT** |
| rescueTokens(address, address, uint256) | KernelVault | NO | - | **MISSING_EVENT** |

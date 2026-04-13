# Emit Statements

Total emit statements across all in-scope contracts: **208**

## By Contract

| Contract | Emit Count | Key Events |
|----------|-----------|------------|
| KernelVault | 21 | Deposit, Withdraw, ExecutionApplied, ActionExecuted, NoOpActionExecuted, TransferExecuted, NoncesSkipped, StrategyActivated, StrategySettled, OracleSignerUpdated, BondSignerUpdated, RequireOracleUpdated, FeesUpdated, FeeRecipientUpdated, ProtocolTreasuryUpdated, ManagementFeeCollected, PerformanceFeeCollected |
| OptimisticKernelVault | 6 | OptimisticExecutionSubmitted, ProofSubmitted, ExecutionSlashed, BondChainIdUpdated, OptimisticConfigUpdated |
| MetaVault | 10 | Deposit, Withdraw, Rebalanced, DonationSwept, UnderlyingWithdrawFailed, VaultAdded, VaultRemoved, RebalanceDepositFailed, RebalanceWithdrawFailed |
| WSTONBondManager | 18 | BondLocked, BondReleased, BondSlashed, TreasuryUpdated, MinBondFloorUpdated, VaultAuthorized, VaultRevoked, OwnershipTransferred, TrustedRelayerUpdated, CrossChainBondLocked, BondReclaimed, TokensRescued, TrustedRelayerProposed, SlashPendingMarked |
| AgentRegistry | 12 | OwnershipTransferred, FactoryUpdated, ImplementationScheduled, ImplementationCancelled, AgentRegistered, AgentUpdated, AgentUnregistered, AgentDeprecated, AgentUndeprecated, AgentSuccessorSet, AgentMetadataUpdated, OwnershipTransferProposed |
| VaultFactory | 18 | OwnershipTransferred, ProtocolTreasuryUpdated, DefaultProtocolFeeSplitUpdated, ImplementationScheduled, ImplementationCancelled, VaultCreationCodeStoreUpdated, OptimisticVaultCreationCodeStoreUpdated, VaultCodeStoreScheduled, OptimisticVaultCodeStoreScheduled, VaultDeployed, OptimisticVaultDeployed, VaultProtocolTypeSet, ExternalVaultRegistered, OwnershipTransferProposed |
| KernelExecutionVerifier | 12 | OwnershipTransferred, VerifierApproved, VerifierRevoked, VerifierProposed, VerifierProposalCancelled, VerifierActivated, VerificationPauseSet, ImplementationScheduled, ImplementationCancelled, OwnershipTransferProposed |
| PointsProgram | 7 | OwnershipTransferred, SeasonEndUpdated, AuthorizedCallerUpdated, PointsAccrued, ReferralBonus, DepositBalanceUpdated, ExecutionBonus, ReferrerSet |
| BuilderProgram | 7 | BuilderRegistered, StatsUpdated, TierChanged, GrantAllocated, GrantClaimed, OwnershipTransferred, AuthorizedUpdaterSet |
| ReferralManager | 5 | CodeRegistered, ReferralRecorded, OwnershipTransferred, AuthorizedRecorderSet |
| VaultAccessControl | 12 | OwnershipTransferred, WhitelistEnabledUpdated, WhitelistAdded, WhitelistRemoved, DepositCapEnabledUpdated, DepositCapSet, DefaultDepositCapSet, KycVerifierEnabledUpdated, KycVerifierSet, DepositRecorded |
| StakingRouter | 2 | Staked, Unstaked |
| Adapters (total) | ~76 | VaultRegistered, various operation events (Supplied, Withdrawn, Borrowed, etc.), EmergencyWithdraw, OrderSubmitted, etc. |

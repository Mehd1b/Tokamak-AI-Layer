# Event Definitions (SLITHER_AVAILABLE=false, grep fallback)
## Total events found: 152 (across 34 source files)

## KernelVault.sol
- L350: Deposit(address indexed sender, uint256 amount, uint256 shares)
- L353: Withdraw(address indexed sender, uint256 amount, uint256 shares)
- L356: ExecutionApplied(...)
- L364: ActionExecuted(...)
- L369: NoOpActionExecuted(uint256 indexed actionIndex, uint32 actionType)
- L373: TransferExecuted(...)
- L378: NoncesSkipped(uint64 indexed fromNonce, uint64 indexed toNonce, uint64 skippedCount)
- L381: StrategyActivated(uint256 snapshotAssets, uint256 snapshotShares)
- L384: StrategySettled(uint256 settledAssets, uint256 currentAssets)
- L387: OracleSignerUpdated(address indexed signer, uint64 maxAge)
- L390: BondSignerUpdated(address indexed signer)
- L393: RequireOracleUpdated(bool required)
- L396: ManagementFeeCollected(uint256 shares, address recipient)
- L399: PerformanceFeeCollected(uint256 shares, address recipient, uint256 pps)
- L402: FeesUpdated(uint256 managementFeeBps, uint256 performanceFeeBps)
- L405: FeeRecipientUpdated(address indexed recipient)
- L408: ProtocolTreasuryUpdated(address indexed treasury, uint256 splitBps)

## OptimisticKernelVault.sol (inherited from IOptimisticKernelVault)
- OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline)
- ProofSubmitted(uint64 indexed executionNonce, address indexed submitter)
- ExecutionSlashed(uint64 indexed executionNonce, address indexed slasher, uint256 bondAmount)
- BondChainIdUpdated(uint256 newChainId)
- OptimisticConfigUpdated(uint256 challengeWindow, uint256 minBond, uint256 maxPending, bool enabled)

## AgentRegistry.sol
- L107: OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
- L110: FactoryUpdated(address indexed previousFactory, address indexed newFactory)
- L113: ImplementationScheduled(address indexed implementation, uint256 activatesAt)
- L116: ImplementationCancelled(address indexed implementation)
- L119: OwnershipTransferProposed(address indexed currentOwner, address indexed proposedOwner)

## VaultFactory.sol
- L123: OwnershipTransferred(...)
- L126: ProtocolTreasuryUpdated(address indexed treasury)
- L129: DefaultProtocolFeeSplitUpdated(uint256 splitBps)
- L132: ImplementationScheduled(address indexed implementation, uint256 activatesAt)
- L135: ImplementationCancelled(address indexed implementation)
- L138: OwnershipTransferProposed(...)
- L311: VaultCodeStoreScheduled(address indexed newStore, uint256 activatesAt)
- L312: OptimisticVaultCodeStoreScheduled(address indexed newStore, uint256 activatesAt)
- L315: VaultCreationCodeStoreUpdated(address indexed newStore)
- L318: OptimisticVaultCreationCodeStoreUpdated(address indexed newStore)

## KernelExecutionVerifier.sol
- L238: OwnershipTransferred(...)
- L241: VerifierApproved(address indexed verifier)
- L244: VerifierRevoked(address indexed verifier)
- L247: VerifierProposed(address indexed verifier, uint256 activatesAt)
- L250: VerifierProposalCancelled(address indexed verifier)
- L253: VerifierActivated(address indexed oldVerifier, address indexed newVerifier)
- L256: ImplementationScheduled(address indexed implementation, uint256 activatesAt)
- L259: ImplementationCancelled(address indexed implementation)
- L262: OwnershipTransferProposed(...)
- L265: VerificationPauseSet(bool paused)

## WSTONBondManager.sol
- L124: BondLocked(...)
- L127: BondReleased(...)
- L130: BondSlashed(...)
- L137: TreasuryUpdated(address indexed newTreasury)
- L138: MinBondFloorUpdated(uint256 newMinBondFloor)
- L139: VaultAuthorized(address indexed vault)
- L140: VaultRevoked(address indexed vault)
- L141: OwnershipTransferred(...)
- L142: TrustedRelayerUpdated(address indexed newRelayer)
- L143: CrossChainBondLocked(...)
- L146: BondReclaimed(...)
- L149: TokensRescued(address indexed token, address indexed to, uint256 amount)
- L151: TrustedRelayerProposed(address indexed newRelayer, uint256 activatesAt)
- L153: SlashPendingMarked(address indexed operator, address indexed vault, uint64 indexed nonce)

## VaultAccessControl.sol (extension)
- WhitelistEnabledUpdated(bool enabled), WhitelistAdded(address[]), WhitelistRemoved(address[])
- DepositCapEnabledUpdated(bool enabled), DepositCapSet(address indexed, uint256)
- DefaultDepositCapSet(uint256), KycVerifierEnabledUpdated(bool), KycVerifierSet(address)
- DepositRecorded(address indexed user, uint256 amount, uint256 totalDeposited)

## Adapters
- AaveV3Adapter: VaultRegistered, Supplied, Withdrawn, Borrowed, Repaid, RewardsClaimed, EmergencyWithdrawn, AssetAllowanceUpdated, MinHealthFactorUpdated, BorrowForfeited
- MorphoAdapter: VaultRegistered, MarketWhitelisted, MarketDelisted, Supplied, Withdrawn, Borrowed, Repaid, CollateralSupplied, CollateralWithdrawn, Reallocated, EmergencyWithdraw
- LidoAdapter: VaultRegistered, ETHStaked, StETHWrapped, WstETHUnwrapped, WithdrawalRequested, WithdrawalClaimed, EmergencyWithdraw
- HyperliquidAdapter: RawCoreWriterDisabled, OrderIntentSubmitted
- TradingSubAccount: MarginDeposited, OrderSubmitted, WithdrawnToVault, HypeBridgedToCore, PerpToSpotTransfer, SpotToEvmTransfer, ApiWalletAdded, RawCoreWriterAction
- UniswapV4Adapter: VaultRegistered, SwapExecuted, LiquidityAdded, LiquidityRemoved, FeesCollected, SlippageUpdated, DefaultFeeUpdated, WithdrawnToVault
- PolymarketAdapter: VaultRegistered, OutcomeBought, OutcomeSold, Redeemed, WithdrawnToVault, USDCDeposited
- PendleAdapter: VaultRegistered, MarketWhitelistUpdated, PtYtMinted, PtYtRedeemed, PtSwappedForToken, TokenSwappedForPt, LiquidityAdded, LiquidityRemoved, RewardsClaimed, WithdrawnToVault, ExpiryBufferUpdated

## Other
- MetaVault: Deposit, Withdraw, Rebalanced, DonationSwept, UnderlyingWithdrawFailed, VaultAdded, VaultRemoved, RebalanceDepositFailed, RebalanceWithdrawFailed
- PointsProgram: PointsAccrued, ExecutionBonus, ReferralBonus, SeasonEndUpdated, AuthorizedCallerUpdated, DepositBalanceUpdated, ReferrerSet
- ReferralManager: CodeRegistered, ReferralRecorded, AuthorizedRecorderSet
- BuilderProgram: BuilderRegistered, StatsUpdated, TierChanged, GrantAllocated, GrantClaimed, AuthorizedUpdaterSet
- StakingRouter: Staked, Unstaked

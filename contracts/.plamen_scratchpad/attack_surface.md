# Attack Surface

## External Dependencies

### 1. RISC Zero Verifier (IRiscZeroVerifier)
- **Type**: ZK proof verification system
- **Interaction**: `KernelExecutionVerifier.verify()` and `verifyAndParseWithImageId()`
- **Trust Level**: Critical — proof forgery bypasses entire execution trust model
- **C-03 Fix**: Verifier rotation with allowlist + timelock added
- **Side Effects**: None (pure verification)

### 2. Aave V3 (IPool, IPoolAddressesProvider, IAaveOracle, IRewardsController)
- **Type**: Lending protocol
- **Interaction**: AaveV3Adapter — supply, withdraw, borrow, repay, claimRewards
- **Token Nature**: aTokens (rebasing receipt tokens representing supplied assets)
- **Side Effects**: aToken auto-accrues interest (rebasing); reward claims may transfer multiple tokens
- **Return-Value Tokens**: aTokens on supply; underlying on withdraw
- **State Coupling**: Health factor depends on Aave oracle prices; min health factor enforced

### 3. Morpho Blue (IMorpho, IMorphoOracle)
- **Type**: Lending protocol (isolated markets)
- **Interaction**: MorphoAdapter — supply, withdraw, borrow, repay, supplyCollateral, withdrawCollateral, reallocate
- **Token Nature**: Morpho shares (non-rebasing, share-based)
- **Side Effects**: Oracle price feed used for LTV calculation (1e36 scale)
- **Return-Value Tokens**: Underlying on withdraw; no receipt token (share accounting is internal to Morpho)
- **State Coupling**: Market-specific oracle, irm, lltv parameters

### 4. Lido (ILido, IWstETH, IWithdrawalQueue)
- **Type**: Liquid staking
- **Interaction**: LidoAdapter — submit ETH for stETH, wrap/unwrap stETH↔wstETH, request/claim withdrawals
- **Token Nature**: stETH (rebasing), wstETH (non-rebasing wrapped receipt)
- **Side Effects**: stETH balance updates on oracle reports (rebase); withdrawal queue is asynchronous
- **Return-Value Tokens**: stETH on submit; wstETH on wrap; ETH on claim
- **State Coupling**: Lido oracle reports can change stETH balances between transactions

### 5. Pendle (IPendleRouter, IPendleMarket, IPendleSy)
- **Type**: Yield tokenization
- **Interaction**: PendleAdapter — mint PT/YT, redeem, swap PT, add/remove liquidity, claim rewards
- **Token Nature**: PT (principal token), YT (yield token), LP tokens, SY (standardized yield)
- **Side Effects**: Market expiry affects all operations; reward distribution on claim
- **Return-Value Tokens**: PT+YT on mint; SY/underlying on redeem; LP on addLiquidity
- **State Coupling**: Market expiry timestamp; implied rate; market exchange rate

### 6. Uniswap V4 (ISwapRouter, INonfungiblePositionManager)
- **Type**: DEX (AMM)
- **Interaction**: UniswapV4Adapter — exactInputSingle, addLiquidity (mint), removeLiquidity (decreaseLiquidity + collect), collectFees
- **Token Nature**: NFT position tokens (ERC-721 for LP positions)
- **Side Effects**: Fee accrual on positions; price impact on swaps
- **Return-Value Tokens**: tokenOut on swap; position NFT on mint; token0+token1 on remove
- **State Coupling**: Pool price, tick, liquidity state

### 7. Polymarket CTF Exchange
- **Type**: Prediction market
- **Interaction**: PolymarketAdapter — buyOutcome, sellOutcome, redeemResolved (scaffolding)
- **Token Nature**: Conditional tokens (ERC-1155 for YES/NO outcomes)
- **Side Effects**: Resolution outcome determines redemption value
- **NOTE**: Contains scaffolding logic — not production-ready

### 8. Hyperliquid CoreWriter (precompile at 0x3333...3333)
- **Type**: Perpetual futures order system (precompile)
- **Interaction**: TradingSubAccount — sendRawAction for limit orders, usdClassTransfer, spotSend, addApiWallet
- **Token Nature**: USDC on HyperCore (1e6 for perp, 1e8 for spot)
- **Side Effects**: All actions are NON-ATOMIC — fire and forget, no revert on failure
- **State Coupling**: HyperCore position state, leverage, margin balance (off-EVM state)

### 9. Tokamak Staking (IWTON, IWSTON)
- **Type**: Liquid staking wrapper
- **Interaction**: StakingRouter — swapFromTON (TON→WTON), depositWTONAndGetWSTON (WTON→WSTON)
- **Token Nature**: TON (18d), WTON (27d), WSTON (27d, liquid staking receipt)
- **Side Effects**: Decimal scaling (18→27→27)
- **Return-Value Tokens**: WTON on swap; WSTON on deposit

### 10. WSTON Token (ERC20)
- **Type**: Liquid staking derivative token
- **Interaction**: WSTONBondManager uses WSTON as bond collateral
- **Token Nature**: Standard ERC20 (SafeERC20 used)
- **Unsolicited Transfer**: Possible — but `totalLockedGlobal` accounting separates bonded from excess

## Token Flow Matrix

| Token | Type | Entry Functions | State Tracking | Accounting Queries Affected? | Unsolicited Transfer? | Side-Effect? | Return-Value? |
|-------|------|----------------|----------------|-------|------|------|------|
| ERC20 asset (vault) | Deposit token | depositERC20Tokens | balanceOf(this) for ERC20; trackedETHBalance for ETH | totalAssets(), effectiveTotalAssets(), currentPps() | YES — ERC20 can be sent directly; ETH vault uses trackedETHBalance to prevent inflation | NO | NO |
| ETH (vault) | Native | depositETH, receive() | trackedETHBalance | totalAssets(), effectiveTotalAssets(), currentPps() | YES — selfdestruct can donate ETH; mitigated by trackedETHBalance | NO | NO |
| Meta shares | Internal accounting | deposit() on MetaVault | totalShares, shares[user] | getNav() | N/A (internal) | NO | NO |
| KernelVault shares | Internal accounting | depositERC20Tokens, depositETH | totalShares, shares[user] | currentPps(), convertToAssets() | N/A (internal) | NO | NO |
| WSTON | Bond collateral | lockBond, lockBondDirect, lockBondBatch | totalBonded[op], totalLockedGlobal | getBondedAmount(), getMinBond() | YES — excess above totalLockedGlobal is rescuable | NO | NO |
| aTokens | Rebasing receipt | AaveV3Adapter.supply | trackedCollateral per vault | Health factor via getHealthFactor() | YES — aTokens can be sent to vault | YES (rebase) | YES |
| stETH | Rebasing | LidoAdapter.stakeETH | Vault balance | KernelVault totalAssets if stETH is vault asset | YES | YES (oracle rebase) | YES |
| wstETH | Non-rebasing wrapper | LidoAdapter.wrapStETH | Vault balance | KernelVault totalAssets if wstETH is vault asset | YES | NO | YES |
| PT/YT/LP (Pendle) | Yield tokens | PendleAdapter.mintPtYt | Not tracked by adapter (held by vault) | Via vault balance | YES | YES (expiry) | YES |
| USDC (HyperCore) | Perp margin | TradingSubAccount.depositMargin | Off-chain (HyperCore) | Not on-chain visible | NO (bridged) | YES (async settlement) | NO |
| Uniswap LP NFT | Position token | UniswapV4Adapter.addLiquidity | storedPositionIds[vault] | Indirect via vault balance | YES — NFTs can be transferred directly | YES (fee accrual) | YES |

## Signal Elevation Tags

| Tag | Location | Reason |
|-----|----------|--------|
| [ELEVATE:STORAGE_LAYOUT] | AgentRegistry, VaultFactory, KernelExecutionVerifier | UUPS upgradeable with __gap slots; new state added in audit fixes |
| [ELEVATE:FORK_ANCESTRY:ERC4626] | KernelVault, MetaVault | ERC4626-like PPS with virtual offset (DECIMALS_OFFSET = 1e3) |
| [ELEVATE:BRANCH_ASYMMETRY] | KernelVault._processWithdraw vs depositERC20Tokens | Deposit uses effectiveTotalAssets(); withdraw uses snapshot during strategy. M-05 fix uses snapshotTotalShares for withdraw denominator. |
| [ELEVATE:BRANCH_ASYMMETRY] | KernelVault._collectManagementFee vs _collectPerformanceFee | Both block during strategyActive, but different re-anchor logic on empty vault |
| [ELEVATE:INLINE_ASSEMBLY] | KernelOutputParser, OracleVerifier, VaultFactory (CREATE2), TradingSubAccount | Assembly used for binary parsing, signature decomposition, CREATE2 deployment, CoreWriter encoding |
| [ELEVATE:REINIT_RISK] | None detected | All UUPS contracts use _disableInitializers() in constructor |

## Critical Attack Surfaces (Ranked)

1. **ZK Proof Verification** — CVE-2025-52484 + verifier rotation (C-03). Single point of trust for entire execution model.
2. **Oracle Signature Verification** — dual-role separation (C-02), bound signatures, staleness. Compromise = unbonded drain.
3. **Fee Extraction Mechanics** — HWM manipulation (C-05), management fee accrual timing (M-01), strategy-active guards, combined fee cap, cooldowns. Most complex attack surface.
4. **Cross-Chain Bond System** — WSTONBondManager relayer trust, slash-pending race (H-02), relayer rotation bypass (H-03), bond expiry safety valve.
5. **Strategy Snapshot Accounting** — snapshotTotalAssets/snapshotTotalShares dual-state during active strategy. Affects PPS for deposits/withdrawals/fees/emergency exits.
6. **MetaVault NAV Manipulation** — NAV depends on underlying vault PPS; donation inflation (M-14 fix); rebalance slippage.
7. **Adapter External Interactions** — Each adapter routes vault funds to external protocols with different trust models, receipt token behavior, and failure modes.
8. **UUPS Upgrade Governance** — AgentRegistry, VaultFactory, KernelExecutionVerifier all upgradeable with timelocked proposals. Code store swaps also timelocked (M-07).

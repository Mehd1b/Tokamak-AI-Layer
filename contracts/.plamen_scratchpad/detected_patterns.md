# Detected Patterns

## Flag Summary

| Flag | Detected? | Contracts | Count |
|------|-----------|-----------|-------|
| TEMPORAL | YES | KernelVault, OptimisticKernelVault, MetaVault, WSTONBondManager, PointsProgram, PendleAdapter, BuilderProgram, AgentRegistry, VaultFactory, KernelExecutionVerifier | 10 |
| ORACLE | YES | KernelVault, OptimisticKernelVault, OracleVerifier, KernelExecutionVerifier, MorphoAdapter, AaveV3Adapter, HyperliquidAdapter, TradingSubAccount, WSTONBondManager | 9 |
| FLASH_LOAN | NO | No direct flash loan patterns detected in core contracts | 0 |
| FLASH_LOAN_EXTERNAL | NO | No Uniswap/Balancer flash loan integrations | 0 |
| ERC4626 | YES | KernelVault (ERC4626-like PPS), MetaVault (vault-of-vaults), OptimisticKernelVault | 3 |
| STAKING_RECEIPT | YES | LidoAdapter (stETH/wstETH), StakingRouter (WSTON), PendleAdapter (PT/YT tokens), AaveV3Adapter (aTokens) | 4 |
| BALANCE_DEPENDENT | YES | KernelVault, MetaVault, PointsProgram, WSTONBondManager, StakingRouter, LidoAdapter, PendleAdapter, TradingSubAccount | 8 |
| CROSS_CHAIN | YES | OptimisticKernelVault (bondChainId), WSTONBondManager (cross-chain relayer), VaultFactory, HyperliquidAdapter, TradingSubAccount | 5 |
| SEMI_TRUSTED_ROLE | YES | KernelVault (owner), WSTONBondManager (trustedRelayer, onlyAuthorizedVault, onlyOwner), MetaVault (owner), VaultFactory (onlyOwner), AgentRegistry (onlyOwner), KernelExecutionVerifier (onlyOwner), PointsProgram (authorizedCallers), BuilderProgram (authorizedUpdaters), ReferralManager (authorizedRecorders), VaultAccessControl (onlyOwner) | 10 |
| MIGRATION | YES | AgentRegistry (UUPS upgrade + timelock), VaultFactory (UUPS upgrade + timelock + code store swap), KernelExecutionVerifier (UUPS upgrade + verifier rotation), OptimisticKernelVault (_deprecated field), AaveV3Adapter (V3 references) | 5 |
| SHARE_ALLOCATION | YES | KernelVault (shares, fee distribution, pro-rata withdrawal), MetaVault (meta shares, proportional vault allocation), WSTONBondManager (slash distribution: finder/depositor/treasury), BuilderProgram (vesting grants) | 4 |
| MONETARY_PARAMETER | YES | KernelVault (managementFeeBps, performanceFeeBps, protocolFeeSplitBps, MAX_CALL_VALUE_BPS), MetaVault (MAX_ALLOCATION_BPS, MAX_REBALANCE_SLIPPAGE_BPS), WSTONBondManager (FINDER_FEE_BPS, DEPOSITOR_SHARE_BPS, minBondFloor), PointsProgram (REFERRAL_BONUS_BPS, multipliers) | 4 |
| MIXED_DECIMALS | YES | PointsProgram (decimal normalization per vault asset), TradingSubAccount (1e6/1e8 CoreWriter scaling), StakingRouter (TON 18d → WTON 27d), MorphoAdapter (oracle price scale 1e36), AaveV3Adapter (decimals for health factor), BuilderProgram (18-decimal thresholds), ReferralManager (decimal-normalized points) | 7 |
| HAS_SIGNATURES | YES | OracleVerifier (ecrecover, EIP-191, EIP-2 malleability), KernelVault (oracle signatures), OptimisticKernelVault (bond attestation signatures) | 3 |
| STORAGE_LAYOUT | YES | AgentRegistry (UUPS proxy, __gap), VaultFactory (UUPS proxy, __gap), KernelExecutionVerifier (UUPS proxy, __gap, C-03 new slots), KernelOutputParser (assembly for binary parsing), OracleVerifier (assembly for signature decomposition), VaultCreationCodeStore (code as runtime bytecode) | 6 |
| CROSS_CHAIN_MSG | NO | No LayerZero/CCIP/Wormhole message receivers | 0 |
| OUTCOME_CALLBACK | NO | No ERC721/1155 callbacks, no flash loan callbacks in scope contracts | 0 |
| MULTI_STEP_OPS | YES | WSTONBondManager (lockBondDirect + executeOptimistic across chains), PointsProgram (approve→deposit→updateDepositBalance), KernelVault (approve for deposit) | 3 |
| NAMED_EXTERNAL_PROTOCOL | YES | AaveV3Adapter (IPool, IPoolAddressesProvider, IAaveOracle, IRewardsController), MorphoAdapter (IMorpho, IMorphoOracle), LidoAdapter (ILido, IWstETH, IWithdrawalQueue), PendleAdapter (IPendleRouter, IPendleMarket, IPendleSy), UniswapV4Adapter (ISwapRouter, INonfungiblePositionManager) | 5 |

## Additional Pattern Notes

### Protocol-Specific Concerns

1. **Cross-chain oracle relay trust**: WSTONBondManager relies on `trustedRelayer` for cross-chain bond release/slash. H-02 (slash-pending flag) and H-03 (relayer rotation bypass) already fixed but critical trust surface.

2. **HyperCore non-atomicity**: TradingSubAccount/HyperliquidAdapter interact with CoreWriter which does NOT revert on HyperCore failures. All order submissions are "fire and forget" intents.

3. **Dual oracle roles**: KernelVault has separate `oracleSigner` (Role A, price) and `bondSigner` (Role B, bond attestation) after C-02 fix. Role separation invariant enforced at 4 sites.

4. **Binary format alignment**: KernelOutputParser parses binary agent output that must match Rust kernel-core byte-for-byte. All integers are little-endian. Journal is exactly 209 bytes.

5. **ERC4626 virtual offset**: KernelVault uses DECIMALS_OFFSET=1e3 for inflation protection. MetaVault uses the same pattern.

6. **Fee extraction complexity**: KernelVault has management fees (time-based), performance fees (HWM-based), protocol treasury split, fee recipient rotation cooldowns, and combined fee caps. Multiple audit fixes (C-05, M-01, M-05, M-07, M-21, M-23, L-10, L-19, L-20) indicate this is a high-complexity attack surface.

7. **Strategy snapshot accounting**: During `strategyActive`, KernelVault uses frozen snapshots for PPS. This creates dual-state (live vs snapshot) accounting across deposits, withdrawals, fee collection, and emergency exits.

8. **MetaVault vault-of-vaults**: Deposits to MetaVault, then rebalances to underlying KernelVaults. NAV depends on underlying vault PPS accuracy. H-01 fix uses effectiveTotalAssets.

# Function List (SLITHER_AVAILABLE=false, grep fallback)
## Source: grep from src/ (interfaces excluded)
## Total function declarations found: 455

See function_list_raw.txt for full list.

### Key contracts with public/external functions:
src/MockYieldSource.sol:56:    function withdraw(address depositor) external {
src/OptimisticKernelVault.sol:265:    function submitProof(uint64 executionNonce, bytes calldata seal) external nonReentrant {
src/OptimisticKernelVault.sol:293:    function slashExpired(uint64 executionNonce) external nonReentrant {
src/OptimisticKernelVault.sol:310:    function selfSlash(uint64 executionNonce) external nonReentrant {
src/OptimisticKernelVault.sol:328:    function setChallengeWindow(uint256 window) external {
src/OptimisticKernelVault.sol:344:    function setMinBond(uint256 amount) external {
src/OptimisticKernelVault.sol:355:    function setMaxPending(uint256 max) external {
src/OptimisticKernelVault.sol:396:    function setOptimisticEnabled(bool enabled) external {
src/OptimisticKernelVault.sol:431:    function setBondChainId(uint256 _bondChainId) external {
src/AgentRegistry.sol:140:    function initialize(address initialOwner) external initializer {
src/AgentRegistry.sol:157:    function transferOwnership(address newOwner) external onlyOwner {
src/AgentRegistry.sol:164:    function acceptOwnership() external {
src/AgentRegistry.sol:181:    function setFactory(address factory_) external onlyOwner {
src/AgentRegistry.sol:193:    function scheduleImplementation(address newImplementation) external onlyOwner {
src/AgentRegistry.sol:201:    function cancelImplementation() external onlyOwner {
src/AgentRegistry.sol:266:    function update(bytes32 agentId, bytes32 newImageId, bytes32 newAgentCodeHash) external {
src/AgentRegistry.sol:290:    function unregister(bytes32 agentId) external {
src/AgentRegistry.sol:357:    function deprecate(bytes32 agentId) external {
src/AgentRegistry.sol:369:    function undeprecate(bytes32 agentId) external {
src/AgentRegistry.sol:386:    function setSuccessor(bytes32 agentId, bytes32 successorAgentId) external {
src/AgentRegistry.sol:425:    function setMetadataURI(bytes32 agentId, string calldata uri) external {
src/ReferralManager.sol:101:    function transferOwnership(address newOwner) external onlyOwner {
src/ReferralManager.sol:111:    function registerCode(string calldata code) external {
src/ReferralManager.sol:127:    function setAuthorizedRecorder(address recorder, bool allowed) external onlyOwner {
src/ReferralManager.sol:138:    function recordReferral(address depositor, bytes32 codeHash, uint256 amount, uint8 decimals) external {
src/BuilderProgram.sol:165:    function transferOwnership(address newOwner) external onlyOwner {
src/BuilderProgram.sol:174:    function setAuthorizedUpdater(address updater, bool authorized) external onlyOwner {
src/BuilderProgram.sol:184:    function registerBuilder(string calldata name, string calldata url) external {
src/BuilderProgram.sol:417:    function claimGrant() external {
src/MockWSTON.sol:18:    function mint(address to, uint256 amount) external {
src/VaultFactory.sol:190:    function transferOwnership(address newOwner) external onlyOwner {
src/VaultFactory.sol:198:    function acceptOwnership() external {
src/VaultFactory.sol:219:    function scheduleImplementation(address newImplementation) external onlyOwner {
src/VaultFactory.sol:227:    function cancelImplementation() external onlyOwner {
src/VaultFactory.sol:256:    function setVaultCreationCodeStore(address newStore) external onlyOwner {
src/VaultFactory.sol:265:    function setOptimisticVaultCreationCodeStore(address newStore) external onlyOwner {
src/VaultFactory.sol:274:    function scheduleVaultCreationCodeStore(address newStore) external onlyOwner {
src/VaultFactory.sol:283:    function activateVaultCreationCodeStore() external onlyOwner {
src/VaultFactory.sol:293:    function scheduleOptimisticVaultCreationCodeStore(address newStore) external onlyOwner {
src/VaultFactory.sol:302:    function activateOptimisticVaultCreationCodeStore() external onlyOwner {
src/VaultFactory.sol:324:    function setProtocolTreasury(address treasury) external onlyOwner {
src/VaultFactory.sol:332:    function setDefaultProtocolFeeSplitBps(uint256 splitBps) external onlyOwner {
src/VaultFactory.sol:532:    function setVaultProtocolType(address vault, uint8 protocolType) external {
src/VaultFactory.sol:547:    function registerExternalVault(address vault, bytes32 agentId) external onlyOwner {
src/PointsProgram.sol:230:    function transferOwnership(address newOwner) external onlyOwner {
src/PointsProgram.sol:240:    function setSeasonEnd(uint256 timestamp) external onlyOwner {
src/PointsProgram.sol:255:    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
src/PointsProgram.sol:325:    function batchAccrue(address[] calldata vaults, address[] calldata users) external {
src/PointsProgram.sol:408:    function setReferrer(address user, address referrer) external {
src/extensions/VaultAccessControl.sol:126:    function transferOwnership(address newOwner) external onlyOwner {
src/extensions/VaultAccessControl.sol:136:    function setWhitelistEnabled(bool enabled) external onlyOwner {
src/extensions/VaultAccessControl.sol:143:    function addToWhitelist(address[] calldata accounts) external onlyOwner {
src/extensions/VaultAccessControl.sol:153:    function removeFromWhitelist(address[] calldata accounts) external onlyOwner {
src/extensions/VaultAccessControl.sol:165:    function setDepositCapEnabled(bool enabled) external onlyOwner {
src/extensions/VaultAccessControl.sol:173:    function setDepositCap(address account, uint256 maxAssets) external onlyOwner {
src/extensions/VaultAccessControl.sol:180:    function setDefaultDepositCap(uint256 maxAssets) external onlyOwner {
src/extensions/VaultAccessControl.sol:194:    function setKycVerifierEnabled(bool enabled) external onlyOwner {
src/extensions/VaultAccessControl.sol:201:    function setKycVerifier(address verifier) external onlyOwner {
src/extensions/VaultAccessControl.sol:213:    function recordDeposit(address user, uint256 amount) external {
src/extensions/VaultAccessControl.sol:227:    function recordWithdrawal(address user, uint256 amount) external {
src/adapters/TradingSubAccount.sol:10:    function sendRawAction(bytes calldata data) external;
src/adapters/TradingSubAccount.sol:16:    function deposit(uint256 amount, uint32 destinationDex) external;
src/adapters/TradingSubAccount.sol:172:    function bridgeHypeToCore() external onlyAdapter {
src/adapters/TradingSubAccount.sol:190:    function executeDepositMargin(uint256 amount) external onlyAdapter {
src/adapters/TradingSubAccount.sol:240:    function closePositionAtPrice(uint64 px) external onlyAdapter {
src/adapters/TradingSubAccount.sol:310:    function executeWithdraw(address to) external onlyAdapter {
src/adapters/TradingSubAccount.sol:331:    function executePerpToSpot(uint64 ntl) external onlyAdapter {
src/adapters/TradingSubAccount.sol:343:    function executeSpotToEvm(uint64 amount) external onlyAdapter {
src/adapters/TradingSubAccount.sol:366:    function executeAddApiWallet(address wallet, string calldata name) external onlyAdapter {
src/adapters/TradingSubAccount.sol:377:    function executeRawCoreWriter(bytes calldata rawData) external onlyAdapter {
src/adapters/LidoAdapter.sol:32:    function claimWithdrawal(uint256 _requestId) external;
src/adapters/LidoAdapter.sol:165:    function registerVault(address vault) external nonReentrant {
src/adapters/LidoAdapter.sol:195:    function stakeETH() external payable nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:219:    function syncRebase() external nonReentrant {
src/adapters/LidoAdapter.sol:247:    function wrapToWstETH(uint256 stethAmount) external nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:280:    function unwrapFromWstETH(uint256 wstethAmount) external nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:307:    function requestWithdrawal(uint256[] calldata amounts) external nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:346:    function claimWithdrawal(uint256 requestId) external nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:384:    function withdrawToVault() external nonReentrant onlyRegisteredVault {
src/adapters/LidoAdapter.sol:473:    function rescueETH(address payable to, uint256 amount) external nonReentrant {
src/adapters/MorphoAdapter.sol:285:    function registerVault(address vault) external nonReentrant {
src/adapters/MorphoAdapter.sol:309:    function unregisterVault(address vault) external nonReentrant {
src/adapters/MorphoAdapter.sol:336:    function whitelistMarket(address vault, MarketParams calldata params) external nonReentrant {
src/adapters/MorphoAdapter.sol:358:    function delistMarket(address vault, MarketParams calldata params) external nonReentrant {
src/adapters/MorphoAdapter.sol:599:    function withdrawToVault() external nonReentrant onlyRegisteredVault {
src/adapters/AaveV3Adapter.sol:19:    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
src/adapters/AaveV3Adapter.sol:212:    function registerVault(address vault) external override nonReentrant {
src/adapters/AaveV3Adapter.sol:239:    function unregisterVault(address vault) external nonReentrant {
src/adapters/AaveV3Adapter.sol:284:    function supply(address asset, uint256 amount) external override nonReentrant onlyRegisteredVault {
src/adapters/AaveV3Adapter.sol:476:    function withdrawToVault() external override nonReentrant onlyRegisteredVault {
src/adapters/AaveV3Adapter.sol:528:    function setMinHealthFactor(uint256 newMinHealthFactor) external override onlyAdapterOwner {
src/adapters/HyperliquidAdapter.sol:116:    function disableRawCoreWriter() external {
src/adapters/HyperliquidAdapter.sol:171:    function depositMargin(uint256 amount) external override nonReentrant {
src/adapters/HyperliquidAdapter.sol:235:    function closePositionAtPrice(uint64 px) external override nonReentrant onlyRegisteredVault {
src/adapters/HyperliquidAdapter.sol:245:    function closePosition() external override {
src/adapters/HyperliquidAdapter.sol:250:    function withdrawToVault() external override nonReentrant onlyRegisteredVault {
src/adapters/HyperliquidAdapter.sol:258:    function depositMarginAdmin(address vault, uint256 amount) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:277:    function fundSubAccountHype(address vault) external payable nonReentrant {
src/adapters/HyperliquidAdapter.sol:298:    function closePositionAtPriceAdmin(address vault, uint64 px) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:344:    function transferPerpToSpot(address vault, uint64 usdcAmount) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:360:    function transferSpotToEvm(address vault, uint64 usdcAmount) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:373:    function withdrawToVaultAdmin(address vault) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:404:    function rawCoreWriterAdmin(address vault, bytes calldata rawData) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:421:    function depositMarginFromVaultAdmin(address vault, uint256 amount) external nonReentrant {
src/adapters/HyperliquidAdapter.sol:435:    function depositSubBalanceAdmin(address vault) external nonReentrant {
src/adapters/UniswapV4Adapter.sol:100:    function transferFrom(address from, address to, uint256 tokenId) external;
src/adapters/UniswapV4Adapter.sol:297:    function registerVault(address vault) external nonReentrant {
src/adapters/UniswapV4Adapter.sol:333:    function setSlippage(address vault, uint256 slippageBps) external nonReentrant {
src/adapters/UniswapV4Adapter.sol:349:    function setDefaultFee(address vault, uint24 fee) external nonReentrant {
src/adapters/UniswapV4Adapter.sol:563:    function withdrawToVault() external nonReentrant onlyRegisteredVault {
src/adapters/PolymarketAdapter.sol:151:    function depositUSDC(uint256 usdcAmount) external onlyRegisteredVault nonReentrant {
src/adapters/PolymarketAdapter.sol:191:    function withdrawToVault() external onlyRegisteredVault nonReentrant {
src/adapters/PendleAdapter.sol:332:    function registerVault(address vault) external nonReentrant {
src/adapters/PendleAdapter.sol:400:    function setExpiryBuffer(address vault, uint256 newBuffer) external nonReentrant {
src/MetaVault.sol:354:    function _emergencyWithdrawExternal(address vault, uint256 shareAmount) external {
src/MetaVault.sol:365:    function sweepDonations() external nonReentrant onlyOwner {
src/MetaVault.sol:475:    function addVault(address vault, uint256 weightBps) external onlyOwner {
src/MetaVault.sol:509:    function removeVault(address vault) external onlyOwner {
src/MetaVault.sol:586:    function depositToVaultExternal(address vault, uint256 assets) external {
src/KernelVault.sol:14:    function recordWithdrawal(address user, uint256 amount) external;
src/KernelVault.sol:565:    function rescueTokens(address token, address to, uint256 amount) external {
src/KernelVault.sol:581:    function setOracleSigner(address _signer, uint64 _maxAge) external {
src/KernelVault.sol:606:    function setBondSigner(address _signer) external {
src/KernelVault.sol:620:    function setRequireOracle(bool _required) external {
src/KernelVault.sol:629:    function setAccessControl(address _accessControl) external {
src/KernelVault.sol:684:    function setFees(uint256 mgmtBps, uint256 perfBps) external {
src/KernelVault.sol:743:    function setFeeRecipient(address recipient) external {
src/KernelVault.sol:775:    function setProtocolTreasury(address treasury, uint256 splitBps) external {
src/KernelVault.sol:1444:    function settle() external {
src/KernelVault.sol:1452:    function emergencySettle() external {
src/KernelVault.sol:1464:    function pause() external {
src/KernelVault.sol:1470:    function unpause() external {
src/KernelExecutionVerifier.sol:300:    function initialize(address _verifier, address initialOwner) external initializer {
src/KernelExecutionVerifier.sol:325:    function transferOwnership(address newOwner) external onlyOwner {
src/KernelExecutionVerifier.sol:332:    function acceptOwnership() external {
src/KernelExecutionVerifier.sol:350:    function setVerificationPaused(bool paused) external onlyOwner {
src/KernelExecutionVerifier.sol:371:    function approveVerifier(address candidate) external onlyOwner {
src/KernelExecutionVerifier.sol:384:    function revokeVerifier(address candidate) external onlyOwner {
src/KernelExecutionVerifier.sol:403:    function proposeVerifier(address candidate) external onlyOwner {
src/KernelExecutionVerifier.sol:417:    function cancelVerifierProposal() external onlyOwner {
src/KernelExecutionVerifier.sol:435:    function activateVerifier() external {
src/KernelExecutionVerifier.sol:471:    function scheduleImplementation(address newImplementation) external onlyOwner {
src/KernelExecutionVerifier.sol:479:    function cancelImplementation() external onlyOwner {
src/WSTONBondManager.sol:321:    function lockBondDirect(address vault, uint64 nonce, uint256 amount) external nonReentrant {
src/WSTONBondManager.sol:376:    function markSlashPending(address operator, address vault, uint64 nonce) external {
src/WSTONBondManager.sol:487:    function reclaimExpiredBond(address vault, uint64 nonce) external nonReentrant {
src/WSTONBondManager.sol:571:    function setTreasury(address _treasury) external onlyOwner {
src/WSTONBondManager.sol:580:    function setMinBondFloor(uint256 _minBondFloor) external onlyOwner {
src/WSTONBondManager.sol:586:    function authorizeVault(address vault) external onlyOwner {
src/WSTONBondManager.sol:591:    function revokeVault(address vault) external onlyOwner {

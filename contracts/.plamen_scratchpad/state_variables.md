# State Variables (SLITHER_AVAILABLE=false, grep fallback)

## KernelVault.sol (core vault — very large contract)
Key state (from grep and KernelVault analysis):
- `address public asset` — vault asset (address(0) for ETH)
- `address public verifier` — KernelExecutionVerifier
- `bytes32 public agentId` — bound agent ID
- `bytes32 public trustedImageId` — immutable at deploy
- `uint64 public executionNonce` — monotonic, increments per execution
- `uint256 public totalShares` — total shares outstanding
- `uint256 public totalAssets` — total assets tracked
- `bool public strategyActive` — strategy active flag
- `uint256 public snapshotTotalAssets` — snapshot at strategy start
- `uint256 public snapshotTotalShares` — snapshot at strategy start
- `uint256 public lastFeeTimestamp` — used for management/performance fee calculation
- `uint256 public managementFeeBps` — management fee in BPS
- `uint256 public performanceFeeBps` — performance fee in BPS
- `address public feeRecipient` — fee recipient address
- `address public protocolTreasury` — protocol treasury
- `uint256 public protocolFeeSplitBps` — protocol fee split
- `uint256 public highWaterMark` — high-water mark for performance fee
- `mapping(address => uint256) public shares` — per-user shares
- `mapping(address => uint256) public totalDeposited` — per-user total deposited

## OptimisticKernelVault.sol (extends KernelVault)
- `bool public optimisticEnabled` — L32
- `uint256 public challengeWindow` — L33
- `uint256 public minBond` — L34
- `uint256 public maxPending` — L35
- `uint256 public bondChainId` — L36
- `mapping(uint64 => PendingExecution) public pendingExecutions` — L37
- `uint256 internal _pendingCount` — L38
- Constants: MIN_CHALLENGE_WINDOW=30min, MAX_CHALLENGE_WINDOW=24h, DEFAULT_MAX_PENDING=3, MAX_MAX_PENDING=10
- Status codes: EMPTY=0, PENDING=1, FINALIZED=2, SLASHED=3

## AgentRegistry.sol
- `mapping(bytes32 => AgentInfo) internal _agents` — L24
- `bytes32[] private _agentIds` — L27
- `address private _owner` — L30
- `address private _factory` — L33
- `mapping(bytes32 => uint256) internal _agentIdIndex` — L36
- `uint256 public constant MAX_VAULTS_PER_UNREGISTER = 50` — L39
- `mapping(bytes32 => bool) internal _deprecated` — L42
- `mapping(bytes32 => bytes32) internal _successors` — L45
- `mapping(bytes32 => string) internal _agentMetadataURI` — L48
- `uint256 public constant UPGRADE_DELAY = 48 hours` — L62
- `address public pendingImplementation` — L65
- `uint256 public pendingImplementationActivatesAt` — L69
- `address public pendingOwner` — L72
- `uint256[40] private __gap` — L76 (UUPS storage gap)

## VaultFactory.sol
- `address public _verifier` — L21
- `mapping(address => bool) public isDeployedVault` — L24
- `address[] private _deployedVaults` — L27
- `address private _owner` — L30
- `address public _vaultCreationCodeStore` — L33
- `mapping(bytes32 => address[]) internal _agentVaults` — L36
- `address public _optimisticVaultCreationCodeStore` — L39
- `mapping(address => uint8) public _vaultProtocolType` — L42
- `address public protocolTreasury` — L45
- `uint256 public defaultProtocolFeeSplitBps` — L48
- `uint256 public constant UPGRADE_DELAY = 48 hours` — L64
- `address public pendingImplementation` — L67
- `uint256 public pendingImplementationActivatesAt` — L71
- `address public pendingOwner` — L74
- `address public pendingVaultCodeStore` — L86
- `uint256 public pendingVaultCodeStoreActivatesAt` — L87
- `address public pendingOptimisticVaultCodeStore` — L90
- `uint256 public pendingOptimisticVaultCodeStoreActivatesAt` — L91
- `uint256[33] private __gap` — L95

## WSTONBondManager.sol
- `mapping(address => mapping(address => mapping(uint64 => Bond))) public bonds` — operator→vault→nonce→Bond
- `mapping(address => uint256) public totalBonded` — per-operator
- `address public bondToken` — WSTON ERC20
- `address public treasury` — slash receiver (10%)
- `address public trustedRelayer` — L1 relay agent
- `uint256 public minBondFloor` — minimum bond floor
- `mapping(address => bool) internal _authorizedVaults` — whitelisted vaults
- `address public pendingOwner` — two-step ownership
- `address public pendingRelayer` — two-step relayer rotation
- `uint256 public pendingRelayerActivatesAt` — delay for relayer rotation

## KernelOutputParser.sol (library constants)
- `uint256 public constant MAX_ACTIONS_PER_OUTPUT = 64`
- `uint256 public constant MAX_ACTION_PAYLOAD_BYTES = 16_384`
- `uint32 public constant ACTION_TYPE_CALL = 0x00000002`
- `uint32 public constant ACTION_TYPE_TRANSFER_ERC20 = 0x00000003`
- `uint32 public constant ACTION_TYPE_NO_OP = 0x00000004`

## VaultAccessControl.sol (extension)
- `address private _owner` — vault owner
- `bool public whitelistEnabled` — whitelist gate
- `mapping(address => bool) public whitelist` — whitelisted depositors
- `bool public depositCapEnabled` — deposit cap gate
- `mapping(address => uint256) public depositCap` — per-user cap
- `uint256 public defaultDepositCap` — default cap
- `bool public kycVerifierEnabled` — KYC gate
- `address public kycVerifier` — KYC contract
- `mapping(address => uint256) public totalDeposited` — cumulative per-user

## MetaVault.sol
- `address public asset` — underlying asset
- `address[] public vaults` — sub-vault list
- `mapping(address => uint256) public vaultWeightBps` — target weights
- `uint256 public totalWeightBps` — sum of weights
- `mapping(address => uint256) public shares` — per-user shares
- `uint256 public totalShares` — total MetaVault shares

## PointsProgram.sol
- `mapping(address => uint256) public points` — per-user points
- `mapping(address => uint256) public depositBalance` — per-user deposit tracking
- `uint256 public seasonEnd` — season end timestamp
- `address[] public authorizedCallers` — authorized callers

## ReferralManager.sol
- `address public owner` — L13
- `mapping(address => bool) public authorizedRecorders` — L18
- `mapping(bytes32 => address) public referralCodes` — codeHash→referrer
- `mapping(address => bytes32) public referrerCode` — referrer→codeHash
- `mapping(address => uint256) public referralPoints` — L27
- `mapping(address => address) public referredBy` — L30
- `mapping(address => uint256) public referralCount` — L33

## BuilderProgram.sol
- `address public owner` — L59
- `address public vaultFactory` — L62
- `address public agentRegistry` — L65
- `mapping(address => Builder) public builders` — L71
- `address[] public builderAddresses` — L74
- `mapping(address => Grant) public grants` — L77
- `mapping(address => bool) public authorizedUpdaters` — L80
- Constants: SILVER_THRESHOLD=100_000e18, GOLD_THRESHOLD=1_000_000e18, BPS_DENOMINATOR=10_000

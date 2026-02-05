// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {ITALIdentityRegistry} from "../../src/interfaces/ITALIdentityRegistry.sol";
import {IERC8004IdentityRegistry} from "../../src/interfaces/IERC8004IdentityRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MockStakingV2
 * @notice Mock Staking V2 contract for testing operator stake verification
 */
contract MockStakingV2 {
    mapping(address => uint256) public stakes;

    function setStake(address operator, uint256 amount) external {
        stakes[operator] = amount;
    }

    function getStake(address operator) external view returns (uint256) {
        return stakes[operator];
    }
}

/**
 * @title MockZKVerifier
 * @notice Mock ZK Verifier contract for testing capability verification
 */
contract MockZKVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verifyCapabilityProof(
        bytes32 commitment,
        bytes32 capabilityHash,
        bytes calldata zkProof
    ) external view returns (bool) {
        // Simple mock: return shouldVerify if proof is non-empty
        return shouldVerify && zkProof.length > 0 && commitment != bytes32(0) && capabilityHash != bytes32(0);
    }
}

/**
 * @title TALIdentityRegistryTest
 * @notice Comprehensive unit tests for TALIdentityRegistry
 */
contract TALIdentityRegistryTest is Test {
    // ============ Constants ============
    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);

    // ============ Contracts ============
    TALIdentityRegistry public registry;
    TALIdentityRegistry public implementation;
    MockStakingV2 public stakingV2;
    MockZKVerifier public zkVerifier;

    // ============ Test Accounts ============
    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public operator1 = makeAddr("operator1");
    address public operator2 = makeAddr("operator2");
    uint256 public walletPrivateKey = 0x12345;
    address public wallet;

    // ============ Test Data ============
    string public constant AGENT_URI = "ipfs://QmTest123";
    string public constant AGENT_URI_2 = "ipfs://QmTest456";
    string public constant NEW_URI = "ipfs://QmNewUri";
    bytes32 public constant ZK_COMMITMENT = keccak256("test-zk-commitment");
    bytes32 public constant ZK_COMMITMENT_2 = keccak256("test-zk-commitment-2");
    bytes32 public constant CAPABILITY_HASH = keccak256("capability:compute");
    bytes32 public constant CAPABILITY_HASH_2 = keccak256("capability:storage");
    bytes public constant ZK_PROOF = hex"deadbeef";

    // ============ EIP-712 Constants ============
    bytes32 private constant WALLET_VERIFICATION_TYPEHASH =
        keccak256("WalletVerification(uint256 agentId,address wallet,uint256 nonce)");

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        stakingV2 = new MockStakingV2();
        zkVerifier = new MockZKVerifier();

        // Deploy implementation
        implementation = new TALIdentityRegistry();

        // Deploy proxy and initialize
        bytes memory initData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(stakingV2),
            address(zkVerifier)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        registry = TALIdentityRegistry(address(proxy));

        // Setup wallet for signature tests
        wallet = vm.addr(walletPrivateKey);

        // Give users some ETH
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }

    // ============ Helper Functions ============

    function _registerAgent(address owner, string memory uri) internal returns (uint256) {
        vm.prank(owner);
        return registry.register(uri);
    }

    function _registerAgentWithZK(address owner, string memory uri, bytes32 commitment) internal returns (uint256) {
        vm.prank(owner);
        return registry.registerWithZKIdentity(uri, commitment);
    }

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TALIdentityRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(registry)
            )
        );
    }

    function _getWalletVerificationSignature(
        uint256 agentId,
        address _wallet,
        uint256 nonce,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(WALLET_VERIFICATION_TYPEHASH, agentId, _wallet, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ============ Registration Tests ============

    function test_register_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertEq(agentId, 1, "First agent ID should be 1");
        assertEq(registry.ownerOf(agentId), user1, "Owner should be user1");
        assertEq(registry.agentURI(agentId), AGENT_URI, "URI should match");
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IERC8004IdentityRegistry.Registered(1, user1, AGENT_URI);

        vm.prank(user1);
        registry.register(AGENT_URI);
    }

    function test_register_incrementsTokenId() public {
        uint256 agentId1 = _registerAgent(user1, AGENT_URI);
        uint256 agentId2 = _registerAgent(user2, AGENT_URI_2);

        assertEq(agentId1, 1, "First agent ID should be 1");
        assertEq(agentId2, 2, "Second agent ID should be 2");
    }

    function test_register_mintsNFT() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertEq(registry.balanceOf(user1), 1, "User should have 1 NFT");
        assertEq(registry.ownerOf(agentId), user1, "User should own the NFT");
    }

    function testFuzz_register_multipleAgents(uint8 count) public {
        vm.assume(count > 0 && count <= 50);

        for (uint8 i = 0; i < count; i++) {
            address user = makeAddr(string(abi.encodePacked("user", i)));
            vm.prank(user);
            uint256 agentId = registry.register(AGENT_URI);
            assertEq(agentId, i + 1, "Agent ID should increment");
        }

        assertEq(registry.getAgentCount(), count, "Agent count should match");
    }

    // ============ ZK Identity Tests ============

    function test_registerWithZKIdentity_success() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        assertEq(agentId, 1, "Agent ID should be 1");
        assertEq(registry.getZKIdentity(agentId), ZK_COMMITMENT, "ZK commitment should match");
        assertEq(registry.ownerOf(agentId), user1, "Owner should be user1");
    }

    function test_registerWithZKIdentity_emitsEvents() public {
        vm.expectEmit(true, true, false, true);
        emit IERC8004IdentityRegistry.Registered(1, user1, AGENT_URI);

        vm.expectEmit(true, false, false, true);
        emit ITALIdentityRegistry.ZKIdentitySet(1, ZK_COMMITMENT);

        vm.prank(user1);
        registry.registerWithZKIdentity(AGENT_URI, ZK_COMMITMENT);
    }

    function test_setZKIdentity_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.setZKIdentity(agentId, ZK_COMMITMENT);

        assertEq(registry.getZKIdentity(agentId), ZK_COMMITMENT, "ZK commitment should be set");
    }

    function test_setZKIdentity_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.expectEmit(true, false, false, true);
        emit ITALIdentityRegistry.ZKIdentitySet(agentId, ZK_COMMITMENT);

        vm.prank(user1);
        registry.setZKIdentity(agentId, ZK_COMMITMENT);
    }

    function test_setZKIdentity_revertIfAlreadySet() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.ZKIdentityAlreadySet.selector, agentId));
        registry.setZKIdentity(agentId, ZK_COMMITMENT_2);
    }

    function test_setZKIdentity_revertIfNotOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.setZKIdentity(agentId, ZK_COMMITMENT);
    }

    function test_setZKIdentity_revertIfAgentNotFound() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.setZKIdentity(999, ZK_COMMITMENT);
    }

    function test_getZKIdentity_returnsCorrectValue() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        bytes32 identity = registry.getZKIdentity(agentId);
        assertEq(identity, ZK_COMMITMENT, "ZK identity should match");
    }

    function test_getZKIdentity_returnsZeroIfNotSet() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        bytes32 identity = registry.getZKIdentity(agentId);
        assertEq(identity, bytes32(0), "ZK identity should be zero");
    }

    // ============ URI Management Tests ============

    function test_updateAgentURI_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.updateAgentURI(agentId, NEW_URI);

        assertEq(registry.agentURI(agentId), NEW_URI, "URI should be updated");
    }

    function test_updateAgentURI_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.expectEmit(true, false, false, true);
        emit IERC8004IdentityRegistry.AgentURIUpdated(agentId, NEW_URI);

        vm.prank(user1);
        registry.updateAgentURI(agentId, NEW_URI);
    }

    function test_updateAgentURI_revertIfNotOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.updateAgentURI(agentId, NEW_URI);
    }

    function test_updateAgentURI_revertIfAgentNotFound() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.updateAgentURI(999, NEW_URI);
    }

    function test_agentURI_returnsCorrectValue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        string memory uri = registry.agentURI(agentId);
        assertEq(uri, AGENT_URI, "URI should match");
    }

    function test_tokenURI_matchesAgentURI() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertEq(registry.tokenURI(agentId), registry.agentURI(agentId), "tokenURI and agentURI should match");
    }

    // ============ Metadata Tests ============

    function test_setMetadata_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        bytes memory value = abi.encode("test-value");

        vm.prank(user1);
        registry.setMetadata(agentId, "testKey", value);

        bytes memory retrieved = registry.getMetadata(agentId, "testKey");
        assertEq(retrieved, value, "Metadata value should match");
    }

    function test_setMetadata_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        bytes memory value = abi.encode("test-value");

        vm.expectEmit(true, false, false, true);
        emit IERC8004IdentityRegistry.MetadataUpdated(agentId, "testKey");

        vm.prank(user1);
        registry.setMetadata(agentId, "testKey", value);
    }

    function test_getMetadata_returnsCorrectValue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        bytes memory value = hex"1234567890abcdef";

        vm.prank(user1);
        registry.setMetadata(agentId, "customKey", value);

        bytes memory retrieved = registry.getMetadata(agentId, "customKey");
        assertEq(retrieved, value, "Metadata should match");
    }

    function test_getMetadata_returnsEmptyIfNotSet() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        bytes memory retrieved = registry.getMetadata(agentId, "nonExistentKey");
        assertEq(retrieved.length, 0, "Metadata should be empty");
    }

    function test_setMetadata_revertIfNotOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.setMetadata(agentId, "testKey", hex"1234");
    }

    function test_setMetadata_revertIfAgentNotFound() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.setMetadata(999, "testKey", hex"1234");
    }

    function testFuzz_setMetadata_arbitraryData(bytes memory value) public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.setMetadata(agentId, "fuzzKey", value);

        bytes memory retrieved = registry.getMetadata(agentId, "fuzzKey");
        assertEq(retrieved, value, "Fuzzed metadata should match");
    }

    // ============ Wallet Verification Tests ============

    function test_verifyAgentWallet_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 nonce = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonce, walletPrivateKey);

        vm.prank(user1);
        registry.verifyAgentWallet(agentId, wallet, signature);

        assertTrue(registry.isVerifiedWallet(agentId, wallet), "Wallet should be verified");
    }

    function test_verifyAgentWallet_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 nonce = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonce, walletPrivateKey);

        vm.expectEmit(true, false, false, true);
        emit IERC8004IdentityRegistry.AgentWalletVerified(agentId, wallet);

        vm.prank(user1);
        registry.verifyAgentWallet(agentId, wallet, signature);
    }

    function test_isVerifiedWallet_returnsTrue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 nonce = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonce, walletPrivateKey);

        vm.prank(user1);
        registry.verifyAgentWallet(agentId, wallet, signature);

        assertTrue(registry.isVerifiedWallet(agentId, wallet), "Wallet should be verified");
    }

    function test_isVerifiedWallet_returnsFalse() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertFalse(registry.isVerifiedWallet(agentId, wallet), "Wallet should not be verified");
    }

    function test_verifyAgentWallet_revertIfInvalidSignature() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        bytes memory invalidSignature = new bytes(65); // Empty signature

        vm.prank(user1);
        vm.expectRevert("Invalid signature");
        registry.verifyAgentWallet(agentId, wallet, invalidSignature);
    }

    function test_verifyAgentWallet_revertIfWrongSigner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 wrongPrivateKey = 0x99999;
        uint256 nonce = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonce, wrongPrivateKey);

        vm.prank(user1);
        vm.expectRevert("Invalid signature");
        registry.verifyAgentWallet(agentId, wallet, signature);
    }

    function test_verifyAgentWallet_revertIfNotOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 nonce = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonce, walletPrivateKey);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.verifyAgentWallet(agentId, wallet, signature);
    }

    function test_verifyAgentWallet_incrementsNonce() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        uint256 nonceBefore = registry.walletNonces(wallet);
        bytes memory signature = _getWalletVerificationSignature(agentId, wallet, nonceBefore, walletPrivateKey);

        vm.prank(user1);
        registry.verifyAgentWallet(agentId, wallet, signature);

        assertEq(registry.walletNonces(wallet), nonceBefore + 1, "Nonce should increment");
    }

    function test_verifyAgentWallet_revertIfSignatureTooShort() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        bytes memory shortSignature = new bytes(64); // Too short

        vm.prank(user1);
        vm.expectRevert("Invalid signature length");
        registry.verifyAgentWallet(agentId, wallet, shortSignature);
    }

    // ============ Operator Tests ============

    function test_setOperator_success() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertEq(registry.getOperator(agentId), operator1, "Operator should be set");
    }

    function test_setOperator_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.expectEmit(true, true, false, true);
        emit ITALIdentityRegistry.OperatorSet(agentId, operator1);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);
    }

    function test_setOperator_revertIfNotOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.setOperator(agentId, operator1);
    }

    function test_getOperator_returnsCorrectValue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertEq(registry.getOperator(agentId), operator1, "Operator should match");
    }

    function test_getOperator_returnsZeroIfNotSet() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertEq(registry.getOperator(agentId), address(0), "Operator should be zero");
    }

    function test_checkOperatorStatus_withSufficientStake() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertTrue(registry.checkOperatorStatus(agentId), "Operator should be verified");
    }

    function test_checkOperatorStatus_withInsufficientStake() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE - 1);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertFalse(registry.checkOperatorStatus(agentId), "Operator should not be verified");
    }

    function test_checkOperatorStatus_withZeroStake() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertFalse(registry.checkOperatorStatus(agentId), "Operator should not be verified");
    }

    function test_refreshOperatorStatus_updatesStatus() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        // Set operator with insufficient stake
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE - 1);
        vm.prank(user1);
        registry.setOperator(agentId, operator1);
        assertFalse(registry.checkOperatorStatus(agentId), "Should not be verified initially");

        // Update stake to sufficient
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE);

        // Refresh status
        registry.refreshOperatorStatus(agentId);
        assertTrue(registry.checkOperatorStatus(agentId), "Should be verified after refresh");
    }

    function test_refreshOperatorStatus_emitsEvent() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        vm.expectEmit(true, false, false, true);
        emit ITALIdentityRegistry.OperatorStatusChanged(agentId, true, MIN_OPERATOR_STAKE);

        registry.refreshOperatorStatus(agentId);
    }

    function test_isVerifiedOperator_returnsTrue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, MIN_OPERATOR_STAKE);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        assertTrue(registry.isVerifiedOperator(agentId), "Should be verified operator");
    }

    function test_isVerifiedOperator_returnsFalse() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertFalse(registry.isVerifiedOperator(agentId), "Should not be verified operator");
    }

    function testFuzz_operatorStake_thresholdBehavior(uint256 stake) public {
        vm.assume(stake < type(uint256).max);
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        stakingV2.setStake(operator1, stake);

        vm.prank(user1);
        registry.setOperator(agentId, operator1);

        if (stake >= MIN_OPERATOR_STAKE) {
            assertTrue(registry.checkOperatorStatus(agentId), "Should be verified with sufficient stake");
        } else {
            assertFalse(registry.checkOperatorStatus(agentId), "Should not be verified with insufficient stake");
        }
    }

    // ============ Capability Verification Tests ============

    function test_verifyCapability_success() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        bool success = registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);

        assertTrue(success, "Capability verification should succeed");
        assertTrue(registry.isCapabilityVerified(agentId, CAPABILITY_HASH), "Capability should be verified");
    }

    function test_verifyCapability_emitsEvent() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        vm.expectEmit(true, true, false, true);
        emit ITALIdentityRegistry.CapabilityVerified(agentId, CAPABILITY_HASH);

        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
    }

    function test_verifyCapability_revertIfNoZKIdentity() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.expectRevert("No ZK identity set");
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
    }

    function test_verifyCapability_revertIfAlreadyVerified() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);

        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.CapabilityAlreadyVerified.selector, agentId, CAPABILITY_HASH));
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
    }

    function test_verifyCapability_revertIfInvalidProof() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);
        zkVerifier.setShouldVerify(false);

        vm.expectRevert(ITALIdentityRegistry.InvalidZKProof.selector);
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
    }

    function test_verifyCapability_revertIfAgentNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.verifyCapability(999, CAPABILITY_HASH, ZK_PROOF);
    }

    function test_isCapabilityVerified_returnsTrue() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);

        assertTrue(registry.isCapabilityVerified(agentId, CAPABILITY_HASH), "Capability should be verified");
    }

    function test_isCapabilityVerified_returnsFalse() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        assertFalse(registry.isCapabilityVerified(agentId, CAPABILITY_HASH), "Capability should not be verified");
    }

    function test_getVerifiedCapabilities_returnsAll() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);
        registry.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
        registry.verifyCapability(agentId, CAPABILITY_HASH_2, ZK_PROOF);

        bytes32[] memory capabilities = registry.getVerifiedCapabilities(agentId);

        assertEq(capabilities.length, 2, "Should have 2 capabilities");
        assertEq(capabilities[0], CAPABILITY_HASH, "First capability should match");
        assertEq(capabilities[1], CAPABILITY_HASH_2, "Second capability should match");
    }

    function test_getVerifiedCapabilities_returnsEmpty() public {
        uint256 agentId = _registerAgentWithZK(user1, AGENT_URI, ZK_COMMITMENT);

        bytes32[] memory capabilities = registry.getVerifiedCapabilities(agentId);

        assertEq(capabilities.length, 0, "Should have no capabilities");
    }

    // ============ Query Tests ============

    function test_getAgentCount_returnsCorrect() public {
        assertEq(registry.getAgentCount(), 0, "Initial count should be 0");

        _registerAgent(user1, AGENT_URI);
        assertEq(registry.getAgentCount(), 1, "Count should be 1");

        _registerAgent(user2, AGENT_URI_2);
        assertEq(registry.getAgentCount(), 2, "Count should be 2");
    }

    function test_getAgentsByOwner_returnsCorrect() public {
        uint256 agentId1 = _registerAgent(user1, AGENT_URI);
        uint256 agentId2 = _registerAgent(user1, AGENT_URI_2);
        _registerAgent(user2, AGENT_URI);

        uint256[] memory user1Agents = registry.getAgentsByOwner(user1);
        uint256[] memory user2Agents = registry.getAgentsByOwner(user2);

        assertEq(user1Agents.length, 2, "User1 should have 2 agents");
        assertEq(user1Agents[0], agentId1, "First agent ID should match");
        assertEq(user1Agents[1], agentId2, "Second agent ID should match");
        assertEq(user2Agents.length, 1, "User2 should have 1 agent");
    }

    function test_getAgentsByOwner_returnsEmptyForNoAgents() public {
        uint256[] memory agents = registry.getAgentsByOwner(user1);

        assertEq(agents.length, 0, "Should return empty array");
    }

    function test_agentExists_returnsTrue() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        assertTrue(registry.agentExists(agentId), "Agent should exist");
    }

    function test_agentExists_returnsFalse() public {
        assertFalse(registry.agentExists(1), "Agent should not exist");
        assertFalse(registry.agentExists(999), "Agent should not exist");
    }

    // ============ Access Control Tests ============

    function test_pause_onlyPauser() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.register(AGENT_URI);
    }

    function test_pause_revertIfNotPauser() public {
        vm.prank(user1);
        vm.expectRevert();
        registry.pause();
    }

    function test_unpause_onlyPauser() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        // Should be able to register again
        uint256 agentId = _registerAgent(user1, AGENT_URI);
        assertEq(agentId, 1, "Should be able to register after unpause");
    }

    function test_unpause_revertIfNotPauser() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.unpause();
    }

    function test_setStakingV2_onlyAdmin() public {
        address newStakingV2 = makeAddr("newStakingV2");

        vm.prank(admin);
        registry.setStakingV2(newStakingV2);

        assertEq(registry.stakingV2(), newStakingV2, "StakingV2 should be updated");
    }

    function test_setStakingV2_revertIfNotAdmin() public {
        address newStakingV2 = makeAddr("newStakingV2");

        vm.prank(user1);
        vm.expectRevert();
        registry.setStakingV2(newStakingV2);
    }

    function test_setZKVerifier_onlyAdmin() public {
        address newZKVerifier = makeAddr("newZKVerifier");

        vm.prank(admin);
        registry.setZKVerifier(newZKVerifier);

        assertEq(registry.zkVerifier(), newZKVerifier, "ZKVerifier should be updated");
    }

    function test_setZKVerifier_revertIfNotAdmin() public {
        address newZKVerifier = makeAddr("newZKVerifier");

        vm.prank(user1);
        vm.expectRevert();
        registry.setZKVerifier(newZKVerifier);
    }

    function test_hasUpgraderRole() public {
        assertTrue(registry.hasRole(UPGRADER_ROLE, admin), "Admin should have UPGRADER_ROLE");
        assertFalse(registry.hasRole(UPGRADER_ROLE, user1), "User1 should not have UPGRADER_ROLE");
    }

    function test_hasPauserRole() public {
        assertTrue(registry.hasRole(PAUSER_ROLE, admin), "Admin should have PAUSER_ROLE");
        assertFalse(registry.hasRole(PAUSER_ROLE, user1), "User1 should not have PAUSER_ROLE");
    }

    function test_hasAdminRole() public {
        assertTrue(registry.hasRole(DEFAULT_ADMIN_ROLE, admin), "Admin should have DEFAULT_ADMIN_ROLE");
        assertFalse(registry.hasRole(DEFAULT_ADMIN_ROLE, user1), "User1 should not have DEFAULT_ADMIN_ROLE");
    }

    // ============ Transfer Tests ============

    function test_transfer_updatesAgentsByOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        // Verify initial state
        uint256[] memory user1AgentsBefore = registry.getAgentsByOwner(user1);
        assertEq(user1AgentsBefore.length, 1, "User1 should have 1 agent before transfer");

        // Transfer
        vm.prank(user1);
        registry.transferFrom(user1, user2, agentId);

        // Verify final state
        uint256[] memory user1AgentsAfter = registry.getAgentsByOwner(user1);
        uint256[] memory user2AgentsAfter = registry.getAgentsByOwner(user2);

        assertEq(user1AgentsAfter.length, 0, "User1 should have 0 agents after transfer");
        assertEq(user2AgentsAfter.length, 1, "User2 should have 1 agent after transfer");
        assertEq(user2AgentsAfter[0], agentId, "User2 should own the transferred agent");
    }

    function test_transfer_multipleAgents_updatesCorrectly() public {
        uint256 agentId1 = _registerAgent(user1, AGENT_URI);
        uint256 agentId2 = _registerAgent(user1, AGENT_URI_2);

        // Transfer first agent
        vm.prank(user1);
        registry.transferFrom(user1, user2, agentId1);

        // Verify state
        uint256[] memory user1Agents = registry.getAgentsByOwner(user1);
        uint256[] memory user2Agents = registry.getAgentsByOwner(user2);

        assertEq(user1Agents.length, 1, "User1 should have 1 agent");
        assertEq(user1Agents[0], agentId2, "User1 should still own agentId2");
        assertEq(user2Agents.length, 1, "User2 should have 1 agent");
        assertEq(user2Agents[0], agentId1, "User2 should own agentId1");
    }

    function test_safeTransfer_updatesAgentsByOwner() public {
        uint256 agentId = _registerAgent(user1, AGENT_URI);

        vm.prank(user1);
        registry.safeTransferFrom(user1, user2, agentId);

        uint256[] memory user1Agents = registry.getAgentsByOwner(user1);
        uint256[] memory user2Agents = registry.getAgentsByOwner(user2);

        assertEq(user1Agents.length, 0, "User1 should have 0 agents");
        assertEq(user2Agents.length, 1, "User2 should have 1 agent");
    }

    // ============ ERC721 Interface Tests ============

    function test_supportsInterface_ERC721() public {
        // ERC721 interface ID: 0x80ac58cd
        assertTrue(registry.supportsInterface(0x80ac58cd), "Should support ERC721");
    }

    function test_supportsInterface_AccessControl() public {
        // AccessControl interface ID: 0x7965db0b
        assertTrue(registry.supportsInterface(0x7965db0b), "Should support AccessControl");
    }

    function test_name() public {
        assertEq(registry.name(), "TAL Agent Identity", "Name should match");
    }

    function test_symbol() public {
        assertEq(registry.symbol(), "TALID", "Symbol should match");
    }

    // ============ Pausable Behavior Tests ============

    function test_register_revertWhenPaused() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.register(AGENT_URI);
    }

    function test_registerWithZKIdentity_revertWhenPaused() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.registerWithZKIdentity(AGENT_URI, ZK_COMMITMENT);
    }

    // ============ Edge Case Tests ============

    function test_register_emptyURI() public {
        uint256 agentId = _registerAgent(user1, "");

        assertEq(registry.agentURI(agentId), "", "Empty URI should be allowed");
    }

    function test_zkVerifier_notSet_autoVerifies() public {
        // Deploy new registry without ZK verifier
        bytes memory initData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(stakingV2),
            address(0) // No ZK verifier
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        TALIdentityRegistry registryNoVerifier = TALIdentityRegistry(address(proxy));

        // Register with ZK identity
        vm.prank(user1);
        uint256 agentId = registryNoVerifier.registerWithZKIdentity(AGENT_URI, ZK_COMMITMENT);

        // Verify capability should auto-succeed when no verifier is set
        bool success = registryNoVerifier.verifyCapability(agentId, CAPABILITY_HASH, ZK_PROOF);
        assertTrue(success, "Should auto-verify when no verifier set");
    }

    function test_stakingV2_notSet_operatorNotVerified() public {
        // Deploy new registry without staking
        bytes memory initData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(0), // No staking
            address(zkVerifier)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        TALIdentityRegistry registryNoStaking = TALIdentityRegistry(address(proxy));

        // Register agent
        vm.prank(user1);
        uint256 agentId = registryNoStaking.register(AGENT_URI);

        // Set operator
        vm.prank(user1);
        registryNoStaking.setOperator(agentId, operator1);

        // Operator should not be verified without staking contract
        assertFalse(registryNoStaking.checkOperatorStatus(agentId), "Operator should not be verified without staking");
    }
}

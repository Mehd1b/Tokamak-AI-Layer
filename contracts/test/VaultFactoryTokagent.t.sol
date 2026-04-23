// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { TokagentVaultCreationCodeStore } from "../src/TokagentVaultCreationCodeStore.sol";
import { VaultCreationCodeStore } from "../src/VaultCreationCodeStore.sol";
import { IVaultFactory } from "../src/interfaces/IVaultFactory.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DummyRegistry {
    function get(bytes32) external pure returns (bytes memory) {
        return "";
    }
}

contract _MockTarget {
    function setValue(uint256) external {}
}

contract VaultFactoryTokagentTest is Test {
    VaultFactory internal factory;
    TokagentVaultCreationCodeStore internal store;
    _MockTarget internal target;

    address internal owner = makeAddr("factoryOwner");
    address internal user = makeAddr("user");
    address internal operator = makeAddr("operator");
    bytes4 internal constant SET_VALUE = bytes4(keccak256("setValue(uint256)"));

    function setUp() public {
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead),
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        factory = VaultFactory(address(proxy));

        store = new TokagentVaultCreationCodeStore();
        vm.prank(owner);
        factory.setTokagentVaultCreationCodeStoreOnce(address(store));

        target = new _MockTarget();
    }

    function _emptyEntries() internal pure returns (IVaultFactory.TokagentEntry[] memory) {
        return new IVaultFactory.TokagentEntry[](0);
    }

    function _emptyApprovals() internal pure returns (IVaultFactory.TokagentApprovalSpec[] memory) {
        return new IVaultFactory.TokagentApprovalSpec[](0);
    }

    function _targetEntries() internal view returns (IVaultFactory.TokagentEntry[] memory entries) {
        entries = new IVaultFactory.TokagentEntry[](1);
        entries[0] = IVaultFactory.TokagentEntry({ target: address(target), selector: SET_VALUE });
    }

    function test_setTokagentStore_setsOnce() public {
        assertEq(factory.tokagentVaultCreationCodeStore(), address(store));
    }

    function test_setTokagentStore_rejectsSecondSet() public {
        TokagentVaultCreationCodeStore store2 = new TokagentVaultCreationCodeStore();
        vm.prank(owner);
        vm.expectRevert("already set");
        factory.setTokagentVaultCreationCodeStoreOnce(address(store2));
    }

    function test_setTokagentStore_rejectsNonOwner() public {
        TokagentVaultCreationCodeStore store2 = new TokagentVaultCreationCodeStore();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.OwnableUnauthorizedAccount.selector, user));
        factory.setTokagentVaultCreationCodeStoreOnce(address(store2));
    }

    function test_setTokagentStore_rejectsZero() public {
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead),
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        VaultFactory freshFactory = VaultFactory(address(proxy));
        vm.prank(owner);
        vm.expectRevert("zero store");
        freshFactory.setTokagentVaultCreationCodeStoreOnce(address(0));
    }

    function test_deployTokagent_happyPath() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        uint256 beforeCount = factory.vaultCount();
        vm.prank(user);
        address vaultAddr = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        uint256 afterCount = factory.vaultCount();

        assertEq(afterCount, beforeCount + 1);
        assertTrue(factory.isDeployedVault(vaultAddr));

        TokagentVault v = TokagentVault(payable(vaultAddr));
        assertEq(v.owner(), user);
        assertEq(v.operator(), operator);
        assertTrue(v.isAllowlisted(address(target), SET_VALUE));
        assertEq(v.vaultKind(), keccak256("TokagentVault:v1"));
    }

    function test_deployTokagent_create2Deterministic() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        (address predicted,) = factory.computeTokagentVaultAddress(
            user, operator, entries, approvals, bytes32(uint256(7))
        );

        vm.prank(user);
        address actual = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(7)));

        assertEq(actual, predicted);
    }

    function test_deployTokagent_sameSaltDifferentOperatorDifferentAddress() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        address op2 = makeAddr("op2");

        vm.prank(user);
        address v1 = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        vm.prank(user);
        address v2 = factory.deployTokagentVault(op2, entries, approvals, bytes32(uint256(1)));

        assertTrue(v1 != v2);
    }

    function test_deployTokagent_rejectsZeroOperator() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        vm.prank(user);
        vm.expectRevert("zero operator");
        factory.deployTokagentVault(address(0), entries, approvals, bytes32(0));
    }

    function test_deployTokagent_beforeStoreSetReverts() public {
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead),
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        VaultFactory f = VaultFactory(address(proxy));
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        vm.prank(user);
        vm.expectRevert("tokagent code store not set");
        f.deployTokagentVault(operator, entries, approvals, bytes32(0));
    }

    function test_deployTokagent_vaultKindDistinguishesFromZkp() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        vm.prank(user);
        address vaultAddr = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        TokagentVault v = TokagentVault(payable(vaultAddr));
        assertEq(v.vaultKind(), keccak256("TokagentVault:v1"));
    }
}

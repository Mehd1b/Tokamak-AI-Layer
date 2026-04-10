// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { PolymarketAdapter } from "../src/adapters/PolymarketAdapter.sol";

contract PmUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address t, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "bal");
        balanceOf[msg.sender] -= a;
        balanceOf[t] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "bal");
        if (allowance[f][msg.sender] != type(uint256).max) {
            require(allowance[f][msg.sender] >= a, "allow");
            allowance[f][msg.sender] -= a;
        }
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

contract PmVault {
    function approveToken(address tok, address sp, uint256 a) external {
        PmUSDC(tok).approve(sp, a);
    }

    function callAdapter(address adapter, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory r) = adapter.call(data);
        require(ok, string(r));
        return r;
    }
}

contract PolymarketAdapterTest is Test {
    PolymarketAdapter public adapter;
    PmUSDC public usdc;
    address public factory = address(0xFACC);
    PmVault public vaultA;
    PmVault public vaultB;

    function setUp() public {
        usdc = new PmUSDC();
        adapter = new PolymarketAdapter(address(usdc), address(0xDEAD), factory);

        vaultA = new PmVault();
        vaultB = new PmVault();

        // Factory registers vaults
        vm.startPrank(factory);
        adapter.registerVault(address(vaultA), bytes32(uint256(1)), address(0x1), address(0x2));
        adapter.registerVault(address(vaultB), bytes32(uint256(2)), address(0x3), address(0x4));
        vm.stopPrank();

        usdc.mint(address(vaultA), 100_000e6);
        usdc.mint(address(vaultB), 50_000e6);
        vaultA.approveToken(address(usdc), address(adapter), type(uint256).max);
        vaultB.approveToken(address(usdc), address(adapter), type(uint256).max);
    }

    // H-02 regression
    function test_H02_withdrawToVault_onlyDrainsCaller() public {
        // Both deposit
        vaultA.callAdapter(address(adapter), abi.encodeCall(adapter.depositUSDC, (100_000e6)));
        vaultB.callAdapter(address(adapter), abi.encodeCall(adapter.depositUSDC, (50_000e6)));

        assertEq(usdc.balanceOf(address(adapter)), 150_000e6);
        assertEq(adapter.vaultUsdcBalance(address(vaultA)), 100_000e6);
        assertEq(adapter.vaultUsdcBalance(address(vaultB)), 50_000e6);

        // B calls withdrawToVault — it must receive exactly 50k, not the 150k aggregate
        uint256 preB = usdc.balanceOf(address(vaultB));
        vaultB.callAdapter(address(adapter), abi.encodeCall(adapter.withdrawToVault, ()));
        assertEq(usdc.balanceOf(address(vaultB)) - preB, 50_000e6);

        // A's 100k is intact
        assertEq(adapter.vaultUsdcBalance(address(vaultA)), 100_000e6);
        assertEq(usdc.balanceOf(address(adapter)), 100_000e6);
    }

    function test_H02_stubFunctionsRevert() public {
        vm.expectRevert(PolymarketAdapter.NotImplemented.selector);
        vaultA.callAdapter(
            address(adapter), abi.encodeCall(adapter.buyOutcome, (true, 1e6, 0))
        );
        vm.expectRevert(PolymarketAdapter.NotImplemented.selector);
        vaultA.callAdapter(
            address(adapter), abi.encodeCall(adapter.sellOutcome, (true, 1e6, 0))
        );
        vm.expectRevert(PolymarketAdapter.NotImplemented.selector);
        vaultA.callAdapter(address(adapter), abi.encodeCall(adapter.redeemResolved, ()));
    }
}

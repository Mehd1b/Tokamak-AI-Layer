// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockWSTONVault
 * @notice Mock contract for testing WSTONVault integration in TALValidationRegistry
 * @dev Simulates getLockedBalance, isVerifiedOperator, and slash without real ERC20 transfers.
 */
contract MockWSTONVault {
    uint256 public constant VERIFIED_THRESHOLD = 1000 ether;

    mapping(address => uint256) public lockedBalance;
    mapping(address => bool) public wasSlashed;

    event Slashed(address indexed operator, uint256 amount);

    function setLockedBalance(address operator, uint256 amount) external {
        lockedBalance[operator] = amount;
    }

    function getLockedBalance(address operator) external view returns (uint256) {
        return lockedBalance[operator];
    }

    function isVerifiedOperator(address operator) external view returns (bool) {
        return lockedBalance[operator] >= VERIFIED_THRESHOLD;
    }

    function slash(address operator, uint256 amount) external {
        require(lockedBalance[operator] >= amount, "Insufficient balance");
        lockedBalance[operator] -= amount;
        wasSlashed[operator] = true;
        emit Slashed(operator, amount);
    }
}

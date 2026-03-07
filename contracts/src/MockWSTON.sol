// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockWSTON
/// @notice Simple ERC20 mock for Wrapped Staked TON, used as bond token on HyperEVM.
///         Uses 27 decimals to match the real L1WrappedStakedTON contract.
contract MockWSTON is ERC20 {
    constructor() ERC20("Wrapped Staked TON", "WSTON") {
        _mint(msg.sender, 1_000_000 * 10 ** 27);
    }

    function decimals() public pure override returns (uint8) {
        return 27;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

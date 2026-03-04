// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { KernelVault } from "./KernelVault.sol";

/// @title VaultCreationCodeStore
/// @notice Stores KernelVault creation code as runtime bytecode.
/// @dev Deploy once. The contract's runtime code IS KernelVault's initcode.
///      Read via `address(store).code` to avoid embedding KernelVault bytecode
///      in VaultFactory, keeping VaultFactory under HyperEVM's 3M block gas limit.
contract VaultCreationCodeStore {
    constructor() {
        bytes memory code = type(KernelVault).creationCode;
        assembly {
            return(add(code, 0x20), mload(code))
        }
    }
}

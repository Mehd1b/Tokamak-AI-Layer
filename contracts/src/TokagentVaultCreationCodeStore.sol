// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TokagentVault } from "./TokagentVault.sol";

/// @title TokagentVaultCreationCodeStore
/// @notice Stores TokagentVault creation code as runtime bytecode.
/// @dev Deploy once. The contract's runtime code IS TokagentVault's initcode.
///      Read via `address(store).code` to avoid embedding TokagentVault bytecode
///      in VaultFactory, keeping VaultFactory under HyperEVM's 3M block gas limit.
contract TokagentVaultCreationCodeStore {
    constructor() {
        bytes memory code = type(TokagentVault).creationCode;
        assembly {
            return(add(code, 0x20), mload(code))
        }
    }
}

---
title: Solidity Integration
sidebar_position: 2
---

# Solidity Integration

This document provides details on integrating with the Execution Kernel contracts from Solidity.

## Contract Interfaces

The Execution Kernel has four core contracts: `AgentRegistry`, `VaultFactory`, `KernelExecutionVerifier`, and `KernelVault`. For function signatures and detailed descriptions of each contract, see the [Verifier Overview](/onchain/verifier-overview).

## Parsing the Journal

Use the KernelOutputParser library:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

library KernelOutputParser {
    struct ParsedJournal {
        uint32 protocolVersion;
        uint32 kernelVersion;
        bytes32 agentId;
        bytes32 agentCodeHash;
        bytes32 constraintSetHash;
        bytes32 inputRoot;
        uint64 executionNonce;
        bytes32 inputCommitment;
        bytes32 actionCommitment;
        uint8 executionStatus;
    }

    uint8 constant EXECUTION_STATUS_SUCCESS = 0x01;
    uint8 constant EXECUTION_STATUS_FAILURE = 0x02;

    function parse(bytes calldata journal)
        internal
        pure
        returns (ParsedJournal memory parsed)
    {
        require(journal.length == 209, "Invalid journal length");

        // Parse little-endian u32
        parsed.protocolVersion = _readU32LE(journal, 0);
        parsed.kernelVersion = _readU32LE(journal, 4);

        // Parse 32-byte fields
        parsed.agentId = bytes32(journal[8:40]);
        parsed.agentCodeHash = bytes32(journal[40:72]);
        parsed.constraintSetHash = bytes32(journal[72:104]);
        parsed.inputRoot = bytes32(journal[104:136]);

        // Parse little-endian u64
        parsed.executionNonce = _readU64LE(journal, 136);

        // Parse commitments
        parsed.inputCommitment = bytes32(journal[144:176]);
        parsed.actionCommitment = bytes32(journal[176:208]);

        // Parse status
        parsed.executionStatus = uint8(journal[208]);
    }

    function _readU32LE(bytes calldata data, uint256 offset)
        private
        pure
        returns (uint32)
    {
        return uint32(uint8(data[offset]))
            | (uint32(uint8(data[offset + 1])) << 8)
            | (uint32(uint8(data[offset + 2])) << 16)
            | (uint32(uint8(data[offset + 3])) << 24);
    }

    function _readU64LE(bytes calldata data, uint256 offset)
        private
        pure
        returns (uint64)
    {
        return uint64(_readU32LE(data, offset))
            | (uint64(_readU32LE(data, offset + 4)) << 32);
    }
}
```

## Parsing Agent Output

```solidity
library AgentOutputParser {
    struct ActionV1 {
        uint32 actionType;
        bytes32 target;
        bytes payload;
    }

    uint32 constant ACTION_TYPE_CALL = 0x00000002;
    uint32 constant ACTION_TYPE_TRANSFER_ERC20 = 0x00000003;
    uint32 constant ACTION_TYPE_NO_OP = 0x00000004;

    function parseActions(bytes calldata agentOutput)
        internal
        pure
        returns (ActionV1[] memory actions)
    {
        uint256 offset = 0;

        // Read action count (u32 LE)
        uint32 actionCount = _readU32LE(agentOutput, offset);
        offset += 4;

        actions = new ActionV1[](actionCount);

        for (uint256 i = 0; i < actionCount; i++) {
            // Read action length (u32 LE)
            uint32 actionLen = _readU32LE(agentOutput, offset);
            offset += 4;

            // Read action type (u32 LE)
            actions[i].actionType = _readU32LE(agentOutput, offset);
            offset += 4;

            // Read target (32 bytes)
            actions[i].target = bytes32(agentOutput[offset:offset+32]);
            offset += 32;

            // Read payload length (u32 LE)
            uint32 payloadLen = _readU32LE(agentOutput, offset);
            offset += 4;

            // Read payload
            actions[i].payload = agentOutput[offset:offset+payloadLen];
            offset += payloadLen;
        }
    }

    // ... _readU32LE helper
}
```

## Using the Permissionless System

### Registering an Agent

```solidity
// agentId is deterministic: keccak256(abi.encodePacked(msg.sender, salt))
bytes32 agentId = registry.register(salt, imageId, codeHash, "ipfs://metadata");

// Pre-compute the ID before registration
bytes32 expectedId = registry.computeAgentId(msg.sender, salt);
```

### Deploying a Vault

```solidity
// Only the agent author can deploy vaults for their agent
address vault = factory.deployVault(agentId, asset, bytes32(0));

// Pre-compute the vault address before deployment
(address predicted, ) = factory.computeVaultAddress(msg.sender, agentId, asset, userSalt);
```

## Implementing a Custom Vault

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./IKernelExecutionVerifier.sol";
import "./KernelOutputParser.sol";
import "./AgentOutputParser.sol";

contract MyVault {
    using KernelOutputParser for bytes;
    using AgentOutputParser for bytes;

    IKernelExecutionVerifier public immutable verifier;
    bytes32 public immutable agentId;
    bytes32 public immutable trustedImageId;
    uint64 public lastExecutionNonce;

    constructor(
        address _verifier,
        bytes32 _agentId,
        bytes32 _trustedImageId
    ) {
        require(_trustedImageId != bytes32(0), "Invalid imageId");
        verifier = IKernelExecutionVerifier(_verifier);
        agentId = _agentId;
        trustedImageId = _trustedImageId;
    }

    function execute(
        bytes calldata journal,
        bytes calldata seal,
        bytes calldata agentOutput
    ) external {
        // Verify proof with pinned imageId
        IKernelExecutionVerifier.ParsedJournal memory parsed =
            verifier.verifyAndParseWithImageId(trustedImageId, journal, seal);

        // Validate versions
        require(parsed.protocolVersion == 1, "Unsupported protocol");
        require(parsed.kernelVersion == 1, "Unsupported kernel");

        // Validate agent
        require(parsed.agentId == agentId, "Wrong agent");

        // Validate nonce (with gap support)
        require(parsed.executionNonce > lastExecutionNonce, "Invalid nonce");
        require(parsed.executionNonce <= lastExecutionNonce + 100, "Nonce gap too large");

        // Validate status
        require(
            parsed.executionStatus == KernelOutputParser.EXECUTION_STATUS_SUCCESS,
            "Execution failed"
        );

        // Verify action commitment
        require(
            sha256(agentOutput) == parsed.actionCommitment,
            "Action commitment mismatch"
        );

        // Update nonce before execution (reentrancy protection)
        lastExecutionNonce = parsed.executionNonce;

        // Parse and execute actions
        AgentOutputParser.ActionV1[] memory actions = agentOutput.parseActions();
        for (uint256 i = 0; i < actions.length; i++) {
            _executeAction(actions[i]);
        }
    }

    function _executeAction(AgentOutputParser.ActionV1 memory action) internal {
        if (action.actionType == AgentOutputParser.ACTION_TYPE_CALL) {
            address target = address(uint160(uint256(action.target)));
            uint64 value = _readU64LE(action.payload, 0);
            bytes memory callData = action.payload[8:];

            (bool success, ) = target.call{value: value}(callData);
            require(success, "Call failed");
        }
        // Handle other action types...
    }

    receive() external payable {}
}
```

## Testing Integration

### Using Foundry

Standard Foundry testing patterns apply. The key assertions for an integration test:

```solidity
// Register → Deploy → Verify
vm.prank(author);
bytes32 agentId = registry.register(bytes32(uint256(1)), imageId, codeHash, "ipfs://test");

vm.prank(author);
address vault = factory.deployVault(agentId, address(0), bytes32(0));

assertEq(KernelVault(payable(vault)).agentId(), agentId);
assertEq(KernelVault(payable(vault)).trustedImageId(), imageId);
```

### Using Cast

```bash
# Register agent
cast send $AGENT_REGISTRY \
    "register(bytes32,bytes32,bytes32,string)" \
    0x0000000000000000000000000000000000000000000000000000000000000001 \
    $IMAGE_ID $CODE_HASH "ipfs://metadata" \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL

# Deploy vault
cast send $VAULT_FACTORY \
    "deployVault(bytes32,address,bytes32)" \
    $AGENT_ID $ASSET_ADDRESS 0x0 \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL

# Read vault state
cast call $VAULT "agentId()(bytes32)" --rpc-url $RPC_URL
cast call $VAULT "trustedImageId()(bytes32)" --rpc-url $RPC_URL
cast call $VAULT "lastExecutionNonce()(uint64)" --rpc-url $RPC_URL
```

## Related

- [Verifier Overview](/onchain/verifier-overview) - Contract architecture
- [Permissionless System](/onchain/permissionless-system) - Detailed design
- [Security Considerations](/onchain/security-considerations) - Trust model
- [Journal Format](/kernel/journal-format) - Journal structure

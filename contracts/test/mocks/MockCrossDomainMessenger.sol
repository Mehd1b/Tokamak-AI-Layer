// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockCrossDomainMessenger
 * @notice Mock for Optimism's CrossDomainMessenger for testing cross-layer messages
 * @dev Simulates L1↔L2 message passing for deterministic testing
 */
contract MockCrossDomainMessenger {
    address public xDomainMessageSenderAddr;

    struct Message {
        address target;
        bytes data;
        uint32 gasLimit;
        address sender;
    }

    Message[] public sentMessages;
    uint256 public messageCount;

    event MessageSent(address indexed target, bytes data, uint32 gasLimit, address sender);
    event MessageRelayed(address indexed target, bytes data);

    /// @notice Set the xDomainMessageSender for testing
    function setXDomainMessageSender(address sender) external {
        xDomainMessageSenderAddr = sender;
    }

    /// @notice Get the cross-domain message sender (called by bridge contracts)
    function xDomainMessageSender() external view returns (address) {
        return xDomainMessageSenderAddr;
    }

    /// @notice Send a cross-domain message (records it for testing)
    function sendMessage(
        address target,
        bytes calldata data,
        uint32 gasLimit
    ) external {
        sentMessages.push(Message({
            target: target,
            data: data,
            gasLimit: gasLimit,
            sender: msg.sender
        }));
        messageCount++;
        emit MessageSent(target, data, gasLimit, msg.sender);
    }

    /// @notice Relay a message to the target (simulates message arrival)
    /// @dev Call this to simulate a cross-domain message being received
    function relayMessage(
        address target,
        bytes calldata data
    ) external returns (bool success, bytes memory returnData) {
        (success, returnData) = target.call(data);
        emit MessageRelayed(target, data);
    }

    // ============ Test Helpers ============

    /// @notice Get a specific sent message
    function getSentMessage(uint256 index) external view returns (
        address target,
        bytes memory data,
        uint32 gasLimit,
        address sender
    ) {
        Message storage msg_ = sentMessages[index];
        return (msg_.target, msg_.data, msg_.gasLimit, msg_.sender);
    }

    /// @notice Get total count of sent messages
    function getSentMessageCount() external view returns (uint256) {
        return sentMessages.length;
    }

    /// @notice Clear all sent messages
    function clearMessages() external {
        delete sentMessages;
        messageCount = 0;
    }
}

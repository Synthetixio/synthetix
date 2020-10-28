pragma solidity ^0.5.16;

import "../interfaces/ISynthetixBridgeToOptimism.sol";
import "../interfaces/ISynthetixBridgeToBase.sol";


contract MockCrossDomainMessenger {
    address public sendMessageCallTarget;
    bytes public sendMessageCallMessage;
    uint public sendMessageCallGasLimit;

    function mintSecondaryFromDeposit(
        address target,
        address account,
        uint amount
    ) external {
        ISynthetixBridgeToBase(target).mintSecondaryFromDeposit(account, amount);
    }

    function mintSecondaryFromDepositForRewards(address target, uint amount) external {
        ISynthetixBridgeToBase(target).mintSecondaryFromDepositForRewards(amount);
    }

    function completeWithdrawal(
        address target,
        address account,
        uint amount
    ) external {
        ISynthetixBridgeToOptimism(target).completeWithdrawal(account, amount);
    }

    // mock sendMessage()
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external {
        sendMessageCallTarget = _target;
        sendMessageCallMessage = _message;
        sendMessageCallGasLimit = _gasLimit;
    }

    // mock xDomainMessageSender()
    function xDomainMessageSender() external view returns (address) {
        return address(0);
    }
}

pragma solidity ^0.5.16;

import "../interfaces/ISynthetixL1ToL2Bridge.sol";
import "../interfaces/ISynthetixL2ToL1Bridge.sol";


contract MockCrossDomainMessenger {
    address public xDomainMsgSender;

    address public sendMessageCallTarget;
    bytes public sendMessageCallMessage;
    uint public sendMessageCallGasLimit;

    constructor(address _xDomainMsgSender) public {
        xDomainMsgSender = _xDomainMsgSender;
    }

    function mintSecondaryFromDeposit(
        address target,
        address account,
        uint amount
    ) external {
        ISynthetixL2ToL1Bridge(target).mintSecondaryFromDeposit(account, amount);
    }

    function completeWithdrawal(
        address target,
        address account,
        uint amount
    ) external {
        ISynthetixL1ToL2Bridge(target).completeWithdrawal(account, amount);
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
        return xDomainMsgSender;
    }

    // Events
    event MintedSecondary(address indexed account, uint amount);
    event WithdrawalCompleted(address indexed account, uint amount);
}

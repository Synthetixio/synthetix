pragma solidity ^0.5.16;

import "../interfaces/ISecondaryWithdrawal.sol";



contract CrossDomainMessengerMock {
    address public xDomainMsgSender;

    address public sendMessageCallTarget;
    bytes public sendMessageCallMessage;
    uint32 public sendMessageCallGasLimit;

    constructor(address _xDomainMsgSender) public {
        xDomainMsgSender = _xDomainMsgSender;
    }

    function mintSecondaryFromDeposit(
        address target,
        address account,
        uint amount
    ) external {
        ISecondaryWithdrawal(target).mintSecondaryFromDeposit(account, amount);
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

    event MintedSecondary(address indexed account, uint amount);
}
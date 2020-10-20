pragma solidity ^0.5.16;


contract MintableSynthetixMock {
    address public mintSecondaryCall_account;
    uint public mintSecondaryCall_amount;

    function mintSecondary(address account, uint amount) external {
        mintSecondaryCall_account = account;
        mintSecondaryCall_amount = amount;
    }
}

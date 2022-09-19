pragma solidity ^0.5.16;

contract MockMintableSynthetix {
    address public mintSecondaryCallAccount;
    uint public mintSecondaryCallAmount;

    address public burnSecondaryCallAccount;
    uint public burnSecondaryCallAmount;

    function mintSecondary(address account, uint amount) external {
        mintSecondaryCallAccount = account;
        mintSecondaryCallAmount = amount;
    }

    function burnSecondary(address account, uint amount) external {
        burnSecondaryCallAccount = account;
        burnSecondaryCallAmount = amount;
    }
}

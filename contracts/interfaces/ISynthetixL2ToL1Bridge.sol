pragma solidity >=0.4.24;


interface ISynthetixL2ToL1Bridge {
    // invoked by users on the secondary (L2)
    function initiateWithdrawal(uint amount) external;

    // invoked by the xDomain messenger on the secondary (L2)
    function mintSecondaryFromDeposit(address account, uint amount) external;
}

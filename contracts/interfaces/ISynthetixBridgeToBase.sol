pragma solidity >=0.4.24;


interface ISynthetixBridgeToBase {
    // invoked by users on L2
    function initiateWithdrawal(uint amount) external;

    // invoked by the xDomain messenger on L2
    function completeDeposit(address account, uint amount) external;

    // invoked by the xDomain messenger on L2
    function completeRewardDeposit(uint amount) external;
}

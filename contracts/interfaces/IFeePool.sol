pragma solidity ^0.5.16;


interface IFeePool {
    // Views

    // solhint-disable func-name-mixedcase
    function FEE_ADDRESS() external view returns (address);

    function exchangeFeeRate() external view returns (uint);

    function amountReceivedFromExchange(uint value) external view returns (uint);

    // Mutative Functions
    function recordFeePaid(uint sUSDAmount) external;

    function appendAccountIssuanceRecord(
        address account,
        uint lockedAmount,
        uint debtEntryIndex
    ) external;

    function setRewardsToDistribute(uint amount) external;
}

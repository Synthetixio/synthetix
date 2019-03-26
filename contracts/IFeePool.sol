pragma solidity 0.4.25;

contract IFeePool {
    address public FEE_ADDRESS;
    function amountReceivedFromExchange(uint value) external view returns (uint);
    function feePaid(bytes4 currencyKey, uint amount) external;
    function appendAccountIssuanceRecord(address account, uint lockedAmount, uint debtEntryIndex) external;
    function rewardsMinted(uint amount) external;
}

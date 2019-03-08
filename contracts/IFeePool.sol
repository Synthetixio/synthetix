pragma solidity 0.4.25;

contract IFeePool {
    address public FEE_ADDRESS;
    function feePaid(bytes4 currencyKey, uint amount) external;
    function amountReceivedFromExchange(uint value) external view returns (uint);
}

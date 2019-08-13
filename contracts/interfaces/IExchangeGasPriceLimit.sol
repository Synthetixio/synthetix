pragma solidity 0.4.25;

/*
* @title Exchange Gas Price Limit interface
*/
contract IExchangeGasPriceLimit {
    function gasPrice() public view returns (uint) {}
    function validateGasPrice(uint) public view;
}

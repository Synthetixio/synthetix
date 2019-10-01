pragma solidity 0.4.25;

/*
* @title Gas Price Oracle interface
*/
contract IGasPriceOracle {
    uint public fastGasPrice;
    uint public fastestGasPrice;
}

/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       ExchangeGasPriceLimit.sol
version:    1.0
author:     Jackson Chan
checked:    Clinton Ennis
date:       2019-07-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------



-----------------------------------------------------------------
*/
pragma solidity 0.4.25;


import "./Owned.sol";
import "./interfaces/IExchangeGasPriceLimit.sol";

contract ExchangeGasPriceLimit is IExchangeGasPriceLimit, Owned {
    uint public gasPrice = 0 wei;    // maximum gas price for exchange transactions in wei

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     */
    constructor(address _owner, uint _gasPrice)
    public
    Owned(_owner)
    greaterThanZero(_gasPrice)
    {
        gasPrice = _gasPrice;
    }

    /*
        @dev allows the owner to update the gas price limit
        @param _gasPrice new gas price limit
    */
    function setGasPrice(uint _gasPrice)
    public
    onlyOwner
    greaterThanZero(_gasPrice)
    {
        gasPrice = _gasPrice;
    }

    /*
        @dev validate that the given gas price is equal to the gas price limit
        @param _gasPrice tested gas price
    */
    function validateGasPrice(uint _gasPrice)
    public
    view
    greaterThanZero(_gasPrice)
    {
        require(_gasPrice <= gasPrice, "Gas price above limit");
    }

    // verifies that an amount is greater than zero
    modifier greaterThanZero(uint _amount) {
        require(_amount > 0, "Amount needs to be greater than 0");
        _;
    }
}

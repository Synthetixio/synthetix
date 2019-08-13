/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       ExchangeGasPriceLimit.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis
date:       2019-07-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Exchange Gas Price limit contract allows a gas price oracle to set
the upper limit on the gwei a user can pay for a synthetix exchange
transaction. This ensures that exchange transactions cannot front
run the updateRates transaction which reveals the next set of synth
prices.

The synthetix contract will validate each exchange transaction using
the validateGasPrice function to ensure that they are less than the
cap otherwise reverting the transaction.

The exchange rates oracle can use this limit and ensure it pushes
updateRates above the gwei limit.
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
        @dev validate that the given gas price is less than or equal to the gas price limit
        @param _gasPrice tested gas price
    */
    function validateGasPrice(uint _givenGasPrice)
        public
        view
    greaterThanZero(_givenGasPrice)
    {
        require(_givenGasPrice <= gasPrice, "Gas price above limit");
    }

    // verifies that an amount is greater than zero
    modifier greaterThanZero(uint _amount) {
        require(_amount > 0, "Amount needs to be greater than 0");
        _;
    }
}

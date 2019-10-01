pragma solidity 0.4.25;

import "../interfaces/IGasPriceOracle.sol";

contract GasPriceOracle is IGasPriceOracle {
    uint public fastGasPrice = 0 wei;
    uint public fastestGasPrice = 0 wei;

    /**
     * @dev Constructor
     */
    constructor(uint _fast, uint _fastest)
		public
		greaterThanZero(_fast)
		greaterThanZero(_fastest)
	{
        fastGasPrice = _fast;
        fastestGasPrice = _fastest;
    }

	// verifies that an amount is greater than zero
    modifier greaterThanZero(uint _amount) {
        require(_amount > 0, "Needs to be greater than 0");
        _;
    }
}

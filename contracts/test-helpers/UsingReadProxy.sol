pragma solidity ^0.5.16;

import "../interfaces/IAddressResolver.sol";
import "../interfaces/IExchangeRates.sol";


contract UsingReadProxy {
    IAddressResolver public resolver;

    constructor(IAddressResolver _resolver) public {
        resolver = _resolver;
    }

    function run(bytes32 currencyKey) external view returns (uint) {
        IExchangeRates exRates = IExchangeRates(resolver.getAddress("ExchangeRates"));
        require(address(exRates) != address(0), "Missing ExchangeRates");
        return exRates.rateForCurrency(currencyKey);
    }
}

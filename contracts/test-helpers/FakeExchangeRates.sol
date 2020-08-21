pragma solidity ^0.5.16;

import "../ExchangeRates.sol";


contract FakeExchangeRates is ExchangeRates {
    address private flags;
    uint private stalePeriod;

    constructor(address _owner, address _resolver) public ExchangeRates(_owner, _resolver) {}

    // test-helpers
    function setAggregatorWarningFlags(address _flags) external {
        flags = _flags;
    }

    function setRateStalePeriod(uint _period) external {
        stalePeriod = _period;
    }

    // overrides
    function getAggregatorWarningFlags() internal view returns (address) {
        return flags;
    }

    function getRateStalePeriod() internal view returns (uint) {
        return stalePeriod;
    }

    function appendToAddressCache(bytes32 name) internal {}
}

pragma solidity ^0.5.16;

import "./BaseSingleNetworkAggregator.sol";

contract SingleNetworkAggregatorIssuedSynths is BaseSingleNetworkAggregator {
    constructor(AddressResolver _resolver) public BaseSingleNetworkAggregator(_resolver) {}

    function getRoundData(uint80)
        public
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        uint totalIssuedSynths =
            IIssuer(resolver.requireAndGetAddress("Issuer", "aggregate debt info")).totalIssuedSynths("sUSD", true);

        uint dataTimestamp = now;

        if (overrideTimestamp != 0) {
            dataTimestamp = overrideTimestamp;
        }

        return (1, int256(totalIssuedSynths), dataTimestamp, dataTimestamp, 1);
    }
}

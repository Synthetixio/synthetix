pragma solidity ^0.5.16;

import "../BaseOneNetAggregator.sol";

contract OneNetAggregatorsDEFI is BaseOneNetAggregator {
    bytes32 public constant CONTRACT_NAME = "OneNetAggregatorsDEFI";

    constructor(AddressResolver _resolver) public BaseOneNetAggregator(_resolver) {}

    function decimals() external view returns (uint8) {
        return 8;
    }

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
        // Fixed price of $3195 as defined in SIP-243: Deprecate sDEFI
        uint fixedPrice = 319500000000;
        uint dataTimestamp = now;

        return (1, int256(fixedPrice), dataTimestamp, dataTimestamp, 1);
    }
}

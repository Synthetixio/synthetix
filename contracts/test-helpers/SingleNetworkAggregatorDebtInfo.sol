pragma solidity ^0.5.16;

//import "@chainlink/contracts-0.0.10/src/v0.5/interfaces/AggregatorV2V3Interface.sol";

import "../AddressResolver.sol";
import "../interfaces/IDebtCache.sol";
import "../interfaces/ISynthetixDebtShare.sol";

interface AggregatorV2V3Interface {
    function latestRound() external view returns (uint256);

    function decimals() external view returns (uint8);

    function getAnswer(uint256 roundId) external view returns (int256);

    function getTimestamp(uint256 roundId) external view returns (uint256);

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

// aggregator which reports the data from `Issuer` for `totalIssuedSynths` and `totalDebtShares`
// useful for testing
contract SingleNetworkAggregatorDebtInfo is AggregatorV2V3Interface {
    AddressResolver public resolver;

    struct Entry {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    mapping(uint => Entry) public entries;

    constructor(AddressResolver _resolver) public {
        resolver = _resolver;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return getRoundData(uint80(latestRound()));
    }

    function latestRound() public view returns (uint256) {
        return 1;
    }

    function decimals() external view returns (uint8) {
        return 0;
    }

    function getAnswer(uint256 _roundId) external view returns (int256) {
        Entry memory entry = entries[_roundId];
        return entry.answer;
    }

    function getTimestamp(uint256 _roundId) external view returns (uint256) {
        Entry memory entry = entries[_roundId];
        return entry.updatedAt;
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

        uint totalIssuedSynths = IIssuer(resolver.requireAndGetAddress("Issuer", "aggregate debt info")).totalIssuedSynths("sUSD", true);
        uint totalDebtShares = ISynthetixDebtShare(resolver.requireAndGetAddress("SynthetixDebtShare", "aggregate debt info")).totalSupply();

        uint result = (totalIssuedSynths << 128) | totalDebtShares;

        return (1, int256(result), now, now, 1);
    }
}

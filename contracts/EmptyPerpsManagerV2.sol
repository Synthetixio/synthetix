pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Empty contract for futures manager to use as perps manager if perps aren't deployed
// https://docs.synthetix.io/contracts/source/contracts/emptyethercollateral

import "./interfaces/IPerpsInterfacesV2.sol";

contract EmptyPerpsManagerV2 is IPerpsManagerV2 {
    bytes32 public constant CONTRACT_NAME = "EmptyPerpsManagerV2";

    function markets(uint index, uint pageSize) external view returns (bytes32[] memory _markets) {
        index;
        pageSize;
        return _markets;
    }

    function numMarkets() external view returns (uint) {
        return 0;
    }

    function allMarkets() external view returns (bytes32[] memory _markets) {
        return _markets;
    }

    function totalDebt() external view returns (uint debt, bool isInvalid) {
        return (0, false);
    }

    function isMarket(bytes32 marketKey) external view returns (bool) {
        marketKey;
        return false;
    }

    function allMarketSummaries() external view returns (IPerpsTypesV2.MarketSummary[] memory summaries) {
        return summaries;
    }

    function marketSummaries(bytes32[] calldata marketKeys)
        external
        view
        returns (IPerpsTypesV2.MarketSummary[] memory summaries)
    {
        marketKeys;
        return summaries;
    }
}

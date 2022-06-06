pragma solidity ^0.5.16;

// Inheritance
import "./PerpsV2MarketBase.sol";
import "./PerpsV2NextPriceMixin.sol";
import "./PerpsV2ViewsMixin.sol";
import "./interfaces/IPerpsV2Market.sol";

/*
 * Perps markets v2
 * TODO: docs
 */

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2Market
contract PerpsV2Market is IPerpsV2Market, PerpsV2MarketBase, PerpsV2NextPriceMixin, PerpsV2ViewsMixin {
    constructor(
        address _resolver,
        bytes32 _baseAsset,
        bytes32 _marketKey
    ) public PerpsV2MarketBase(_resolver, _baseAsset, _marketKey) {}
}

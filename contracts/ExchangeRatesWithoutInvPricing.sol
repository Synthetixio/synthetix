pragma solidity ^0.8.9;

// Internal references
import "./ExchangeRates.sol";

// https://docs.synthetix.io/contracts/source/contracts/exchangerateswithoutinvpricing
contract ExchangeRatesWithoutInvPricing is ExchangeRates {
    constructor(
        address _owner,
        address _oracle,
        address _resolver,
        bytes32[] memory _currencyKeys,
        uint[] memory _newRates
    ) ExchangeRates(_owner, _oracle, _resolver, _currencyKeys, _newRates) {}

    function setInversePricing(
        bytes32,
        uint,
        uint,
        uint,
        bool,
        bool
    ) external override onlyOwner {
        _notImplemented();
    }

    function removeInversePricing(bytes32) external override onlyOwner {
        _notImplemented();
    }

    function freezeRate(bytes32) external override {
        _notImplemented();
    }

    function canFreezeRate(bytes32) external view override returns (bool) {
        return false;
    }

    function rateIsFrozen(bytes32) external view override returns (bool) {
        return false;
    }

    function _rateIsFrozen(bytes32) internal view override returns (bool) {
        return false;
    }

    function _notImplemented() internal pure {
        revert("Cannot be run on this layer");
    }
}

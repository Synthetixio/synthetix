pragma solidity ^0.5.16;

// Inheritance
import "./BaseDebtCache.sol";

// https://docs.synthetix.io/contracts/source/contracts/RealtimeDebtCache
contract RealtimeDebtCache is BaseDebtCache {
    constructor(address _owner, address _resolver) public BaseDebtCache(_owner, _resolver) {}

    // Report the current debt values from all cached debt functions, including public variables

    function debtSnapshotStaleTime() external view returns (uint) {
        return uint(-1);
    }

    function cachedDebt() external view returns (uint) {
        (uint currentDebt, ) = _currentDebt();
        return currentDebt;
    }

    function cachedSynthDebt(bytes32 currencyKey) external view returns (uint) {
        bytes32[] memory keyArray = new bytes32[](1);
        keyArray[0] = currencyKey;
        (uint[] memory debts, ) = _currentSynthDebts(keyArray);
        return debts[0];
    }

    function cacheTimestamp() external view returns (uint) {
        return block.timestamp;
    }

    function cacheStale() external view returns (bool) {
        return false;
    }

    function cacheInvalid() external view returns (bool) {
        (, bool invalid) = _currentDebt();
        return invalid;
    }

    function cachedSynthDebts(bytes32[] calldata currencyKeys) external view returns (uint[] memory debtValues) {
        (uint[] memory debts, ) = _currentSynthDebts(currencyKeys);
        return debts;
    }

    function cacheInfo()
        external
        view
        returns (
            uint debt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        )
    {
        (uint currentDebt, bool invalid) = _currentDebt();
        return (currentDebt, block.timestamp, invalid, false);
    }

    // Stub out all mutative functions as no-ops;
    // since they do nothing, their access restrictions have been dropped

    function purgeCachedSynthDebt(bytes32 currencyKey) external {}

    function takeDebtSnapshot() external {}

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external {}

    function updateCachedSynthDebtWithRate(bytes32 currencyKey, uint currencyRate) external {}

    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates) external {}

    function updateDebtCacheValidity(bool currentlyInvalid) external {}
}

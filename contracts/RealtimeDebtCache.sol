pragma solidity ^0.5.16;

// Inheritance
import "./DebtCache.sol";


// https://docs.synthetix.io/contracts/source/contracts/realtimedebtcache
contract RealtimeDebtCache is DebtCache {
    constructor(address _owner, address _resolver) public DebtCache(_owner, _resolver) {}

    // Report the current debt values from all cached debt functions

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

    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates)
        external
    {}

    function updateDebtCacheValidity(bool currentlyInvalid) external {}
}

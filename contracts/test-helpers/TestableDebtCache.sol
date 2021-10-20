pragma solidity ^0.8.8;

// Inheritance
import "../DebtCache.sol";

contract TestableDebtCache is DebtCache {
    constructor(address _owner, address _resolver) DebtCache(_owner, _resolver) {}

    function setCachedSynthDebt(bytes32 currencyKey, uint debt) public {
        _cachedSynthDebt[currencyKey] = debt;
    }
}

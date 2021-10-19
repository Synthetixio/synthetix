pragma solidity ^0.8.8;

import "../MinimalProxyFactory.sol";

contract TestableMinimalProxyFactory is MinimalProxyFactory {
    function cloneAsMinimalProxy(address _base, string calldata _revertMsg) external returns (address clone) {
        clone = _cloneAsMinimalProxy(_base, _revertMsg);
        emit CloneDeployed(clone, _base);

        return clone;
    }

    function generateMinimalProxyCreateData(address _base) external pure returns (bytes memory) {
        return _generateMinimalProxyCreateData(_base);
    }

    event CloneDeployed(address clone, address base);
}

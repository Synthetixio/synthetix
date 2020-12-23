pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

import "./CollateralErc20.sol";


// Note: Only used for testing.
contract CollateralErc20Settable is CollateralErc20 {
    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral,
        address _underlyingContract,
        uint _underlyingDecimals
    )
        public
        CollateralErc20(
            _state,
            _owner,
            _manager,
            _resolver,
            _collateralKey,
            _minCratio,
            _minCollateral,
            _underlyingContract,
            _underlyingDecimals
        )
    {}

    function setUnderlyingContract(address _underlyingContract) public onlyOwner {
        underlyingContract = _underlyingContract;
    }
}

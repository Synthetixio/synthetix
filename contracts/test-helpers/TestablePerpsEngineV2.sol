pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../PerpsEngineV2.sol";

contract TestablePerpsEngineV2 is PerpsEngineV2 {
    constructor(address _resolver) public PerpsEngineV2(_resolver) {}

    function proportionalSkew(bytes32 marketKey) external view returns (int) {
        (uint price, ) = assetPrice(marketKey);
        return _proportionalSkew(marketKey, price);
    }

    function liquidationMargin(bytes32 marketKey, address account) external view returns (uint lMargin) {
        Position memory position = _stateViews().positions(marketKey, account);
        require(position.size != 0, "0 size position"); // reverts because otherwise minKeeperFee is returned
        (uint price, ) = assetPrice(marketKey);
        return _liquidationMargin(_notionalValue(position.size, price));
    }
}

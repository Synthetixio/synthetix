pragma solidity ^0.5.16;

interface IFuturesMarket {
    function marketDebt() external view returns (uint debt, bool isInvalid);

    function baseAsset() external view returns (bytes32 key);

    function canConfirmOrder(address account) external view returns (bool);

    function confirmOrder(address account) external;

    function canLiquidate(address account) external view returns (bool);

    function liquidatePosition(address account) external;
}

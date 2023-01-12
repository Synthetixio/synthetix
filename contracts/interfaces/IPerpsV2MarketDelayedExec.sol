pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2MarketDelayedExec {
    function cancelDelayedOrder(address account) external;

    function cancelOffchainDelayedOrder(address account) external;

    function executeDelayedOrder(address account) external;

    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;
}

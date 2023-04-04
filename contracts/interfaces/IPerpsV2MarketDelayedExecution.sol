pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2MarketDelayedExecution {
    function executeDelayedOrder(address account) external;

    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;

    function cancelDelayedOrder(address account) external;

    function cancelOffchainDelayedOrder(address account) external;
}

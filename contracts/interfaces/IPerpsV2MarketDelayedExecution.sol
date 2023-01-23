pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2MarketDelayedExecution {
    function executeOrder(address account, bytes[] calldata priceUpdateData) external payable;

    function cancelOrder(address account) external;

    // Legacy. Attention integrators: This function will be removed soon
    function executeDelayedOrder(address account) external;

    // Legacy. Attention integrators: This function will be removed soon
    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;

    // Legacy. Attention integrators: This function will be removed soon
    function cancelDelayedOrder(address account) external;

    // Legacy. Attention integrators: This function will be removed soon
    function cancelOffchainDelayedOrder(address account) external;
}

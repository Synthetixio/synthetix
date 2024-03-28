pragma solidity >=0.4.24;

import "./IERC20.sol";

interface IDynamicSynthRedeemer {
    // Rate applied to chainlink price for redemptions
    function getDiscountRate() external view returns (uint);

    function redeem(IERC20 synthProxy, bytes32 currencyKey) external;

    function redeemAll(IERC20[] calldata synthProxies, bytes32[] calldata currencyKeys) external;

    function redeemPartial(
        IERC20 synthProxy,
        uint amountOfSynth,
        bytes32 currencyKey
    ) external;
}

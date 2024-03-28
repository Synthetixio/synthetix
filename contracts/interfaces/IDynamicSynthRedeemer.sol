pragma solidity >=0.4.24;

import "./IERC20.sol";

interface IDynamicSynthRedeemer {
    // Rate applied to chainlink price for redemptions
    function discountRate() external view returns (uint);

    function redeem(IERC20 synthProxy) external;

    function redeemAll(IERC20[] calldata synthProxies, bytes32[] calldata currencyKeys) external;

    function redeemPartial(
        IERC20 synthProxy,
        uint amountOfSynth,
        bytes32 currencyKey
    ) external;
}

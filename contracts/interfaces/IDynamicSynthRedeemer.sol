pragma solidity >=0.4.24;

import "./IERC20.sol";

interface IDynamicSynthRedeemer {
    function suspendRedemption() external;

    function resumeRedemption() external;

    // Rate applied to chainlink price for redemptions
    function getDiscountRate() external view returns (uint);

    function redeem(bytes32 currencyKey) external;

    function redeemAll(bytes32[] calldata currencyKeys) external;

    function redeemPartial(bytes32 currencyKey, uint amountOfSynth) external;
}

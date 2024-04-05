pragma solidity >=0.4.24;

import "./IERC20.sol";

interface IDynamicSynthRedeemer {
    function suspendRedemption() external;

    function resumeRedemption() external;

    // Rate applied to chainlink price for redemptions
    function getDiscountRate() external view returns (uint);

    function redeem(address synthProxy) external;

    function redeemAll(address[] calldata synthProxies) external;

    function redeemPartial(address synthProxy, uint amountOfSynth) external;
}

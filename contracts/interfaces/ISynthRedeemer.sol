pragma solidity >=0.4.24;

import "./IERC20.sol";
import "./ISynth.sol";

interface ISynthRedeemer {
    // Rate of redemption - 0 for none
    function redemptions(address synthProxy) external view returns (uint redeemRate);

    // sUSD balance of deprecated token holder
    function balanceOf(IERC20 synthProxy, address account) external view returns (uint balanceOfInsUSD);

    // Full sUSD supply of token
    function totalSupply(IERC20 synthProxy) external view returns (uint totalSupplyInsUSD);

    function redeem(IERC20 synthProxy) external;

    function redeemPartial(IERC20 synthProxy, uint amountOfSynth) external;

    // Restricted to Issuer
    function deprecate(
        ISynth synthProxy,
        uint rateToRedeem,
        uint totalSynthSupply
    ) external;
}

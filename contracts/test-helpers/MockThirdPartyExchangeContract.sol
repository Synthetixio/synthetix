pragma solidity ^0.5.16;

import "../interfaces/IAddressResolver.sol";
import "../interfaces/ISynthetix.sol";

contract MockThirdPartyExchangeContract {
    IAddressResolver public resolver;

    constructor(IAddressResolver _resolver) public {
        resolver = _resolver;
    }

    function exchange(uint amount) external {
        ISynthetix synthetix = ISynthetix(resolver.getAddress("Synthetix"));

        synthetix.exchangeWithTrackingForInitiator("sUSD", amount, "sETH", address(this), "TRACKING_CODE");
    }
}

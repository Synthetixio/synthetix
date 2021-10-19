pragma solidity ^0.8.8;

import "../interfaces/IAddressResolver.sol";
import "../interfaces/ISynthetix.sol";

contract MockThirdPartyExchangeContract {
    IAddressResolver public resolver;

    constructor(IAddressResolver _resolver) public {
        resolver = _resolver;
    }

    function exchange(
        bytes32 src,
        uint amount,
        bytes32 dest
    ) external {
        ISynthetix synthetix = ISynthetix(resolver.getAddress("Synthetix"));

        synthetix.exchangeWithTrackingForInitiator(src, amount, dest, address(this), "TRACKING_CODE");
    }
}

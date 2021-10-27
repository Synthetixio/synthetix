pragma solidity ^0.5.16;

import "../FuturesMarket.sol";
import "../open-zeppelin/proxy/utils/Initializable.sol";
import "./TestableFuturesMarket.sol";

contract TestableUpgradeableFuturesMarket is TestableFuturesMarket {
    int internal _privateInteger;

    function initialize() internal initializer {
        _privateInteger = 1009;
    }

    function getPrivateInteger() public view returns (int) {
        return _privateInteger;
    }
}

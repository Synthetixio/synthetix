pragma solidity ^0.5.16;

import "../FuturesMarket.sol";
import "../open-zeppelin/proxy/utils/Initializable.sol";
import "./TestableFuturesMarket.sol";

contract TestableUpgradeableFuturesMarket is TestableFuturesMarket {
    int internal _privateInteger;

    function setPrivateInteger(int newValue) public {
        _privateInteger = newValue;
    }

    function getPrivateInteger() public view returns (int) {
        return _privateInteger;
    }
}

pragma solidity ^0.5.16;

import "../SafeDecimalMath.sol";

contract MockEtherWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(bytes32 => uint) private _totalIssuedSynths;

    constructor() public {}

    function totalIssuedSynths(bytes32 currencyKey) external view returns (uint) {
        return _totalIssuedSynths[currencyKey];
    }

    function setTotalIssuedSynths(bytes32 currencyKey, uint value) external {
        _totalIssuedSynths[currencyKey] = value;
    }
}

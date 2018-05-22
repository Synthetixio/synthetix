pragma solidity 0.4.24; // Which version?

contract IssuanceController {

    uint public someValue = 900;

    constructor()
        public
    {}

    function getSomeValue() external returns (uint) {
        return someValue;
    }

    function setSomeValue(uint _someValue) external {
        someValue = _someValue;
    }

}

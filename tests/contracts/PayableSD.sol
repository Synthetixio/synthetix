pragma solidity 0.4.23;


import "contracts/SelfDestructible.sol";


contract PayableSD is SelfDestructible {

    constructor(address _owner, address _beneficiary, uint _duration)
        SelfDestructible(_owner, _beneficiary, _duration) public {}

    function () public payable {}
}

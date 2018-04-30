pragma solidity 0.4.23;


import "contracts/SelfDestructible.sol";


contract PayableSD is SelfDestructible {

    constructor(address _owner, address _beneficiary)
        SelfDestructible(_owner, _beneficiary) public {}

    function () public payable {}
}

pragma solidity 0.4.23;


import "contracts/SelfDestructible.sol";


contract PayableSD is SelfDestructible {

    function PayableSD(address _owner, address _beneficiary)
        SelfDestructible(_owner, _beneficiary) public {}

    function () public payable {}
}

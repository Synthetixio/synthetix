pragma solidity ^0.4.19;


import "contracts/ERC20State.sol";


contract ERC20FeeState is ERC20State {

    // Collected fees sit here until they are distributed.
    uint public feePool = 0;

    mapping(address => bool) public isFrozen;

    function ERC20FeeState(address _owner,
                           uint initialSupply, address initialBeneficiary,
                           address _associatedContract)
        ERC20State(_owner, initialSupply, initialBeneficiary, _associatedContract)
        public
    {
    }

    function setFeePool(uint _val)
        onlyAssociatedContract
        public
    {
        feePool = _val;
    }

    function setFrozen(address _account, bool _val)
        onlyAssociatedContract
        public
    {
        isFrozen[_account] = _val;
    }
}

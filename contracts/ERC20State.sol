pragma solidity ^0.4.19;


import "contracts/Owned.sol";


contract ERC20State is Owned {

    address public associatedContract;

    uint public totalSupply;
    mapping(address => uint) public balanceOf;
    mapping(address => mapping (address => uint256)) public allowance;

    function ERC20State(
        address _owner, uint initialSupply,
        address initialBeneficiary, address _associatedContract
    )
        Owned(_owner)
        public
    {
        totalSupply = initialSupply;
        balanceOf[initialBeneficiary] = initialSupply;
        associatedContract = _associatedContract;
    }

    function setAssociatedContract(address _associatedContract)
        onlyOwner
        public
    {
        associatedContract = _associatedContract;
    }

    function setAllowance(address _from, address _to, uint _value)
        onlyAssociatedContract
        public
    {
        allowance[_from][_to] = _value;
    }

    function setBalance(address account, uint _value)
        onlyAssociatedContract
        public
    {
        balanceOf[account] = _value;
    }

    function setTotalSupply(uint _value)
        onlyAssociatedContract
        public
    {
        totalSupply = _value;
    }

    modifier onlyAssociatedContract
    {
        require(msg.sender == associatedContract);
        _;
    }
}

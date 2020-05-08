pragma solidity 0.4.25;

import "../common/State.sol";


contract TokenState is State {
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    constructor(address _owner, address _associatedContract) public State(_owner, _associatedContract) {}

    function setAllowance(
        address tokenOwner,
        address spender,
        uint value
    ) external onlyAssociatedContract {
        allowance[tokenOwner][spender] = value;
    }

    function setBalanceOf(address account, uint value) external onlyAssociatedContract {
        balanceOf[account] = value;
    }
}

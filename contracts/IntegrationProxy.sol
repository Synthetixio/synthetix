/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       IntegrationProxy.sol
version:    1.0
author:     Jackson Chan, Clinton Ennis

date:       2019-06-19

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A proxy contract that is ERC20 compliant for the Synthetix Network

This is not the main token address but for ERC20 Contract Integration

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Owned.sol";
import "./Proxyable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";


contract IntegrationProxy is IERC20, Owned {

    Proxyable public target;

    constructor(address _owner)
        Owned(_owner)
        public
    {}

    function setTarget(Proxyable _target)
        external
        onlyOwner
    {
        target = _target;
        emit TargetUpdated(_target);
    }

    // ------------- ERC20 Interface ------------- //

    /**
    * @dev Total number of tokens in existence
    */
    function totalSupply() public view returns (uint256) {
        return target.totalSupply();
    }

    /**
    * @dev Gets the balance of the specified address.
    * @param owner The address to query the balance of.
    * @return An uint256 representing the amount owned by the passed address.
    */
    function balanceOf(address owner) public view returns (uint256) {
        return target.balanceOf(owner);
    }

    /**
    * @dev Function to check the amount of tokens that an owner allowed to a spender.
    * @param owner address The address which owns the funds.
    * @param spender address The address which will spend the funds.
    * @return A uint256 specifying the amount of tokens still available for the spender.
    */
    function allowance(
        address owner,
        address spender
    )
        public
        view
        returns (uint256)
    {
        return target.allowance(owner, spender);
    }

    /**
    * @dev Transfer token for a specified address
    * @param to The address to transfer to.
    * @param value The amount to be transferred.
    */
    function transfer(address to, uint256 value) public returns (bool) {
        target.setMessageSender(msg.sender);
        target.transfer(to, value);
        emit Transfer(from, to, value);
        return true;
    }

    /**
    * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
    * Beware that changing an allowance with this method brings the risk that someone may use both the old
    * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
    * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
    * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
    * @param spender The address which will spend the funds.
    * @param value The amount of tokens to be spent.
    */
    function approve(address spender, uint256 value) public returns (bool) {
        require(spender != address(0), "Can't be 0 address");

        target.setMessageSender(msg.sender);
        target.approve(spender, value);
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /**
    * @dev Transfer tokens from one address to another
    * @param from address The address which you want to send tokens from
    * @param to address The address which you want to transfer to
    * @param value uint256 the amount of tokens to be transferred
    */
    function transferFrom(
        address from,
        address to,
        uint256 value
    )
        public
        returns (bool)
    {
        target.setMessageSender(msg.sender);
        target.transferFrom(from, to, value);
        return true;
    }

    // Catch all for any non ERC20 functions
    function()
        external
        payable
    {
        target.setMessageSender(msg.sender);
        assembly {
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* We must explicitly forward ether to the underlying contract as well. */
            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            if iszero(result) { revert(free_ptr, returndatasize) }
            return(free_ptr, returndatasize)
        }
    }



    modifier onlyTarget {
        require(Proxyable(msg.sender) == target, "Must be proxy target");
        _;
    }

    event TargetUpdated(Proxyable newTarget);
}

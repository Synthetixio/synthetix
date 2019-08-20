/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       ProxyERC20.sol
version:    1.0
author:     Jackson Chan, Clinton Ennis

date:       2019-06-19

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A proxy contract that is ERC20 compliant for the Synthetix Network.

If it does not recognise a function being called on it, passes all
value and call data to an underlying target contract.

The ERC20 standard has been explicitly implemented to ensure
contract to contract calls are compatable on MAINNET

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Owned.sol";
import "./Proxyable.sol";
import "./Proxy.sol";
import "./interfaces/IERC20.sol";

contract ProxyERC20 is Proxy, IERC20 {

    constructor(address _owner)
        Proxy(_owner)
        public
    {}

    // ------------- ERC20 Details ------------- //

    function name() public view returns (string){
        // Immutable static call from target contract
        return IERC20(target).name();
    }

    function symbol() public view returns (string){
         // Immutable static call from target contract
        return IERC20(target).symbol();
    }

    function decimals() public view returns (uint8){
         // Immutable static call from target contract
        return IERC20(target).decimals();
    }

    // ------------- ERC20 Interface ------------- //

    /**
    * @dev Total number of tokens in existence
    */
    function totalSupply() public view returns (uint256) {
        // Immutable static call from target contract
        return IERC20(target).totalSupply();
    }

    /**
    * @dev Gets the balance of the specified address.
    * @param owner The address to query the balance of.
    * @return An uint256 representing the amount owned by the passed address.
    */
    function balanceOf(address owner) public view returns (uint256) {
        // Immutable static call from target contract
        return IERC20(target).balanceOf(owner);
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
        // Immutable static call from target contract
        return IERC20(target).allowance(owner, spender);
    }

    /**
    * @dev Transfer token for a specified address
    * @param to The address to transfer to.
    * @param value The amount to be transferred.
    */
    function transfer(address to, uint256 value) public returns (bool) {
        // Mutable state call requires the proxy to tell the target who the msg.sender is.
        target.setMessageSender(msg.sender);

        // Forward the ERC20 call to the target contract
        IERC20(target).transfer(to, value);

        // Event emitting will occur via Synthetix.Proxy._emit()
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
        // Mutable state call requires the proxy to tell the target who the msg.sender is.
        target.setMessageSender(msg.sender);

        // Forward the ERC20 call to the target contract
        IERC20(target).approve(spender, value);

        // Event emitting will occur via Synthetix.Proxy._emit()
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
        // Mutable state call requires the proxy to tell the target who the msg.sender is.
        target.setMessageSender(msg.sender);

        // Forward the ERC20 call to the target contract
        IERC20(target).transferFrom(from, to, value);

        // Event emitting will occur via Synthetix.Proxy._emit()
        return true;
    }
}

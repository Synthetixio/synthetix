/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SelfDestructible.sol
version:    1.2
author:     Anton Jurisevic

date:       2018-05-22

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract allows an inheriting contract to be destroyed after
its owner indicates an intention and then waits for a period
without changing their mind. All ether contained in the contract
is forwarded to a nominated beneficiary upon destruction.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;


import "contracts/Owned.sol";


/**
 * @title A contract that can be destroyed by its owner after a delay elapses.
 */
contract SelfDestructible is Owned {
	
	uint public initiationTime;
	bool public selfDestructInitiated;
	address public selfDestructBeneficiary;
	uint public constant SELFDESTRUCT_DELAY = 4 weeks;

	/**
	 * @dev Constructor
	 * @param _owner The account which controls this contract.
	 */
	constructor(address _owner)
	    Owned(_owner)
	    public
	{
		require(_owner != address(0));
		selfDestructBeneficiary = _owner;
		emit SelfDestructBeneficiaryUpdated(_owner);
	}

	/**
	 * @notice Set the beneficiary address of this contract.
	 * @dev Only the contract owner may call this. The provided beneficiary must be non-null.
	 * @param _beneficiary The address to pay any eth contained in this contract to upon self-destruction.
	 */
	function setSelfDestructBeneficiary(address _beneficiary)
		external
		onlyOwner
	{
		require(_beneficiary != address(0));
		selfDestructBeneficiary = _beneficiary;
		emit SelfDestructBeneficiaryUpdated(_beneficiary);
	}

	/**
	 * @notice Begin the self-destruction counter of this contract.
	 * Once the delay has elapsed, the contract may be self-destructed.
	 * @dev Only the contract owner may call this.
	 */
	function initiateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = now;
		selfDestructInitiated = true;
		emit SelfDestructInitiated(SELFDESTRUCT_DELAY);
	}

	/**
	 * @notice Terminate and reset the self-destruction timer.
	 * @dev Only the contract owner may call this.
	 */
	function terminateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = 0;
		selfDestructInitiated = false;
		emit SelfDestructTerminated();
	}

	/**
	 * @notice If the self-destruction delay has elapsed, destroy this contract and
	 * remit any ether it owns to the beneficiary address.
	 * @dev Only the contract owner may call this.
	 */
	function selfDestruct()
		external
		onlyOwner
	{
		require(selfDestructInitiated && initiationTime + SELFDESTRUCT_DELAY < now);
		address beneficiary = selfDestructBeneficiary;
		emit SelfDestructed(beneficiary);
		selfdestruct(beneficiary);
	}

	event SelfDestructTerminated();
	event SelfDestructed(address beneficiary);
	event SelfDestructInitiated(uint selfDestructDelay);
	event SelfDestructBeneficiaryUpdated(address newBeneficiary);
}

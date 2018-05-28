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
	uint public selfDestructDelay;
	bool public selfDestructInitiated;
	address public selfDestructBeneficiary;
	uint constant MAX_SELFDESTRUCT_DELAY = 52 weeks;

	/**
	 * @dev Constructor
	 * @param _owner The account which controls this contract.
	 * @param _beneficiary The account to forward all ether in this contract upon self-destruction
	 * @param _delay The time to wait after initiating self-destruction before it can be triggered.
	 */
	constructor(address _owner, address _beneficiary, uint _delay)
	    Owned(_owner)
	    public
	{
		require(_beneficiary != address(0));
		require(_delay <= MAX_SELFDESTRUCT_DELAY);
		selfDestructDelay = _delay;
		selfDestructBeneficiary = _beneficiary;
		emit SelfDestructBeneficiaryUpdated(_beneficiary);
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
		emit SelfDestructInitiated(selfDestructDelay);
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
		require(selfDestructInitiated && initiationTime + selfDestructDelay < now);
		address beneficiary = selfDestructBeneficiary;
		emit SelfDestructed(beneficiary);
		selfdestruct(beneficiary);
	}

	event SelfDestructTerminated();
	event SelfDestructed(address beneficiary);
	event SelfDestructInitiated(uint selfDestructDelay);
	event SelfDestructBeneficiaryUpdated(address newBeneficiary);
}

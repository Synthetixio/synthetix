/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       SelfDestructible.sol
version:    1.0
author:     Anton Jurisevic

date:       2018-2-28

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract allows an inheriting contract to be destroyed after
its owner indicates an intention and then waits for a period
without changing their mind.

-----------------------------------------------------------------
*/

pragma solidity 0.4.23;


import "contracts/Emittor.sol";

/**
 * @title A contract that can be destroyed by its owner after a delay elapses.
 */
contract SelfDestructible is Emittor {
	
	// Initialise to half uint max to be far in the future (without allowing overflows)
	uint constant NULL_INITIATION = ~uint(0) / 2;
	uint public initiationTime = NULL_INITIATION;
	uint public selfDestructDelay;
	address public selfDestructBeneficiary;

	/**
	 * @dev Constructor
	 * @param _owner The account which controls this contract.
	 * @param _beneficiary The account to forward all ether in this contract upon self-destruction
	 * @param _delay The time to wait after initiating self-destruction before it can be triggered.
	 */
	constructor(address _owner, address _beneficiary, uint _delay)
		public
		Proxyable(_owner)
	{
		selfDestructBeneficiary = _beneficiary;
		selfDestructDelay = _delay;
		emit SelfDestructBeneficiaryUpdated(_beneficiary);
	}

	/**
	 * @notice Set the beneficiary address of this contract.
	 * @dev Only the contract owner may call this.
	 * @param _beneficiary The address to pay any eth contained in this contract to upon self-destruction.
	 */
	function setBeneficiary(address _beneficiary)
		external
		onlyOwner
	{
		selfDestructBeneficiary = _beneficiary;
		emitSelfDestructBeneficiaryUpdated(_beneficiary);
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
		emitSelfDestructInitiated(selfDestructDelay);
	}

	/**
	 * @notice Terminate and reset the self-destruction timer.
	 * @dev Only the contract owner may call this.
	 */
	function terminateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = NULL_INITIATION;
		emitSelfDestructTerminated();
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
		require(initiationTime + selfDestructDelay < now);
		address beneficiary = selfDestructBeneficiary;
		emitSelfDestructed(beneficiary);
		selfdestruct(beneficiary);
	}
}

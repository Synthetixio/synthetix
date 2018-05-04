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
import "contracts/Owned.sol";

/**
 * @title A contract that can be destroyed by its owner after a timer elapses.
 */
contract SelfDestructible is Emittor, Owned {

	uint public initiationTime = ~uint(0);
	uint constant SD_DURATION = 4 weeks;
	address public beneficiary;

	/**
	 * @dev Constructor
	 * @param _owner The account which controls this contract.
	 * @param _beneficiary The account to forward all ether in this contract upon self-destruction
	 */
	constructor(address _owner, address _beneficiary)
		public
		Owned(_owner)
	{
		beneficiary = _beneficiary;
	}

	/**
	 * @notice Set the beneficiary address of this contract.
	 * @dev Only the contract owner may call this.
	 */
	function setBeneficiary(address _beneficiary)
		external
		onlyOwner
	{
		beneficiary = _beneficiary;
		emitSelfDestructBeneficiaryUpdated(_beneficiary);
	}

	/**
	 * @notice Begin the self-destruction counter of this contract.
	 * Once the three-day timer has elapsed, the contract may be self-destructed.
	 * @dev Only the contract owner may call this.
	 */
	function initiateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = now;
		emitSelfDestructInitiated(SD_DURATION);
	}

	/**
	 * @notice Terminate and reset the self-destruction timer.
	 * @dev Only the contract owner may call this.
	 */
	function terminateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = ~uint(0);
		emitSelfDestructTerminated();
	}

	/**
	 * @notice If the self-destruction timer has elapsed, destroy this contract and
	 * remit any ether it owns to the beneficiary address.
	 * @dev Only the contract owner may call this.
	 */
	function selfDestruct()
		external
		onlyOwner
	{
		require(initiationTime + SD_DURATION < now);
		emitSelfDestructed(beneficiary);
		selfdestruct(beneficiary);
	}
}

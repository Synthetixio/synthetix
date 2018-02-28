/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       SelfDestructible.sol
version:    0.2
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

pragma solidity ^0.4.20;


import "contracts/Owned.sol";


contract SelfDestructible is Owned {
	
	uint public initiationTime = ~uint(0);
	uint constant SD_DURATION = 3 days;
	address public beneficiary;

	function SelfDestructible(address _owner, address _beneficiary)
		public
		Owned(_owner)
	{
		beneficiary = _beneficiary;
	}

	function setBeneficiary(address _beneficiary)
		external
		onlyOwner
	{
		beneficiary = _beneficiary;
		SelfDestructBeneficiaryUpdated(_beneficiary);
	}

	function initiateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = now;
		SelfDestructInitiated(SD_DURATION);
	}

	function terminateSelfDestruct()
		external
		onlyOwner
	{
		initiationTime = ~uint(0);
		SelfDestructTerminated();
	}

	function selfDestruct()
		external
		onlyOwner
	{
		require(initiationTime + SD_DURATION < now);
		SelfDestructed(beneficiary);
		selfdestruct(beneficiary);
	}

	event SelfDestructBeneficiaryUpdated(address newBeneficiary);

	event SelfDestructInitiated(uint duration);

	event SelfDestructTerminated();

	event SelfDestructed(address beneficiary);
}
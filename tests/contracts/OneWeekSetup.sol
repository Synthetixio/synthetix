pragma solidity ^0.4.23;


import "contracts/LimitedSetup.sol";


contract OneWeekSetup is LimitedSetup(1 weeks) {
	function testFunc() 
		public
		onlyDuringSetup
		returns (bool)
	{
		return true;
	}

	function publicSetupExpiryTime()
		public
		returns (uint)
	{
		return setupExpiryTime;
	}
}

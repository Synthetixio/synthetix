pragma solidity 0.4.21;


import "contracts/LimitedSetup.sol";


contract OneWeekSetup is LimitedSetup(1 weeks) {
	function testFunc() 
		public
		setupFunction
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

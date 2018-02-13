pragma solidity ^0.4.19;


import "contracts/LimitedSetup.sol";


contract OneWeekSetup is LimitedSetup(1 weeks) {
	function OneWeekSetup() public {}

	function testFunc() 
		public
		setupFunction
		returns (bool)
	{
		return true;
	}
}

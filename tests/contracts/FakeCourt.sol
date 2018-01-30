pragma solidity ^0.4.19;

contract FakeCourt {
		mapping(address => bool) public confirming;
		mapping(address => bool) public votePasses;

		function setConfirming(address target, bool status)
			public
		{
			confirming[target] = status;
		}

		function setVotePasses(address target, bool status)
			public
		{
			votePasses[target] = status;
		}
}

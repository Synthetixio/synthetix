pragma solidity ^0.4.19;

import "contracts/EtherNomin.sol";

contract FakeCourt {
		EtherNomin public nomin;

		mapping(address => bool) public confirming;
		mapping(address => bool) public votePasses;

		function setNomin(EtherNomin newNomin)
			public
		{
			nomin = newNomin;
		}

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

		function confiscateBalance(address target)
			public
		{
			nomin.confiscateBalance(target);
		}
}

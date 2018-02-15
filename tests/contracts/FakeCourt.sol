pragma solidity ^0.4.19;

import "contracts/EtherNomin.sol";

contract FakeCourt {
		EtherNomin public nomin;

		mapping(uint => bool) public confirming;
		mapping(uint => bool) public votePasses;
		mapping(address => uint) public addressVoteIndex;

		function setNomin(EtherNomin newNomin)
			public
		{
			nomin = newNomin;
		}

		function setConfirming(uint index, bool status)
			public
		{
			confirming[index] = status;
		}

		function setVotePasses(uint index, bool status)
			public
		{
			votePasses[index] = status;
		}

		function setAddressVoteIndex(address target, uint voteIndex)
			public
		{
			addressVoteIndex[target] = voteIndex;
		}

		function confiscateBalance(address target)
			public
		{
			nomin.confiscateBalance(target);
		}
}

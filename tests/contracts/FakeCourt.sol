pragma solidity ^0.4.19;

import "contracts/EtherNomin.sol";

contract FakeCourt {
		EtherNomin public nomin;

		mapping(uint => bool) public motionConfirming;
		mapping(uint => bool) public motionPasses;
		mapping(address => uint) public addressMotionID;

		function setNomin(EtherNomin newNomin)
			public
		{
			nomin = newNomin;
		}

		function setConfirming(uint motionID, bool status)
			public
		{
			motionConfirming[motionID] = status;
		}

		function setVotePasses(uint motionID, bool status)
			public
		{
			motionPasses[motionID] = status;
		}

		function setAddressMotionID(address target, uint motionID)
			public
		{
			addressMotionID[target] = motionID;
		}

		function confiscateBalance(address target)
			public
		{
			nomin.confiscateBalance(target);
		}
}

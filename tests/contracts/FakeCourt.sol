pragma solidity 0.4.23;

import "contracts/Nomin.sol";

contract FakeCourt {
    Nomin public nomin;

    mapping(uint => bool) public motionConfirming;
    mapping(uint => bool) public motionPasses;
    mapping(address => uint) public targetMotionID;

    function setNomin(Nomin newNomin)
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

    function setTargetMotionID(address target, uint motionID)
        public
    {
        targetMotionID[target] = motionID;
    }

    function confiscateBalance(address target)
        public
    {
        nomin.confiscateBalance(target);
    }
}

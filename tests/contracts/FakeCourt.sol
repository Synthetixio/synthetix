pragma solidity ^0.4.20;

import "contracts/EtherNomin.sol";

contract FakeCourt {
    EtherNomin public nomin;

    mapping(uint => bool) public motionConfirming;
    mapping(uint => bool) public motionPasses;
    mapping(address => uint) public targetMotionID;

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

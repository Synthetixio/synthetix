pragma solidity ^0.4.20;


import "contracts/Court.sol";


contract PublicCourt is Court {

    function PublicCourt(Havven _havven, EtherNomin _nomin, address _owner)
        Court(_havven, _nomin, _owner)
        public
    {}

    function _havven()
        public 
        view
        returns (address)
    {
        return havven;
    }

    function _nomin()
        public 
        view
        returns (address)
    {
        return nomin;
    }

    function _nextMotionID()
        public
        view
        returns (uint)
    {
        return nextMotionID;
    }

    function _MIN_VOTING_PERIOD()
        public
        view
        returns (uint)
    {
        return MIN_VOTING_PERIOD;
    }

    function _MAX_VOTING_PERIOD()
        public
        view
        returns (uint)
    {
        return MAX_VOTING_PERIOD;
    }

    function _MIN_CONFIRMATION_PERIOD()
        public
        view
        returns (uint)
    {
        return MIN_CONFIRMATION_PERIOD;
    }

    function _MAX_CONFIRMATION_PERIOD()
        public
        view
        returns (uint)
    {
        return MAX_CONFIRMATION_PERIOD;
    }

    function _MIN_REQUIRED_PARTICIPATION()
        public
        view
        returns (uint)
    {
        return MIN_REQUIRED_PARTICIPATION;
    }

    function _MIN_REQUIRED_MAJORITY()
        public
        view
        returns (uint)
    {
        return MIN_REQUIRED_MAJORITY;
    }

    function _voteWeight(address account, uint motionID)
        public
        view
        returns (uint)
    {
        return voteWeight[account][motionID];
    }

    function publicSetupVote(uint voteIndex)
        public
        returns (uint)
    {
        uint weight = setupVote(voteIndex);
        SetupVoteReturnValue(weight);
        return weight;
    }

    event SetupVoteReturnValue(uint value);
}

/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Court.sol
version:    0.2
author:     Anton Jurisevic
            Mike Spain

date:       2018-2-6

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This provides the nomin contract with a confiscation
facility, if enough havven owners vote to confiscate a target
account's nomins.

This is designed to provide a mechanism to respond to abusive
contracts such as nomin wrappers, which would allow users to
trade wrapped nomins without accruing fees on those transactions.

In order to prevent tyranny, an account may only be frozen if
users controlling at least 30% of the value of havvens participate,
and a two thirds majority is attained in that vote.
In order to prevent tyranny of the majority or mob justice,
confiscation motions are only approved if the havven foundation
approves the result.
This latter requirement may be lifted in future versions.

The foundation, or any user with a sufficient havven balance may bring a
confiscation motion.
A motion lasts for a default period of one week, with a further confirmation
period in which the foundation approves the result.
The latter period may conclude early upon the foundation's decision to either
veto or approve the mooted confiscation motion.
If the confirmation period elapses without the foundation making a decision,
the motion fails.

The weight of a havven holder's vote is determined by examining their
average balance over the last completed fee period prior to the
beginning of a given motion.
Thus, since a fee period can roll over in the middle of a motion, we must
also track a user's average balance of the last two periods.
This system is designed such that it cannot be attacked by users transferring
funds between themselves, while also not requiring them to lock their havvens
for the duration of the vote. This is possible since any transfer that increases
the average balance in one account will be reflected by an equivalent reduction
in the voting weight in the other.
At present a user may cast a vote only for one motion at a time,
but may cancel their vote at any time except during the confirmation period,
when the vote tallies must remain static until the matter has been settled.

A motion to confiscate the balance of a given address composes
a state machine built of the following states:


Waiting:
  - A user with standing brings a motion:
    If the target address is not frozen;
    initialise vote tallies to 0;
    transition to the Voting state.

  - An account cancels a previous residual vote:
    remain in the Waiting state.

Voting:
  - The foundation vetoes the in-progress motion:
    transition to the Waiting state.

  - The voting period elapses:
    transition to the Confirmation state.

  - An account votes (for or against the motion):
    its weight is added to the appropriate tally;
    remain in the Voting state.

  - An account cancels its previous vote:
    its weight is deducted from the appropriate tally (if any);
    remain in the Voting state.

Confirmation:
  - The foundation vetoes the completed motion:
    transition to the Waiting state.

  - The foundation approves confiscation of the target account:
    freeze the target account, transfer its nomin balance to the fee pool;
    transition to the Waiting state.

  - The confirmation period elapses:
    transition to the Waiting state.


User votes are not automatically cancelled upon the conclusion of a motion.
Therefore, after a motion comes to a conclusion, if a user wishes to vote 
in another motion, they must manually cancel their vote in order to do so.

This procedure is designed to be relatively simple.
There are some things that can be added to enhance the functionality
at the expense of simplicity and efficiency:
  
  - Democratic unfreezing of nomin accounts (induces multiple categories of vote)
  - Configurable per-vote durations;
  - Vote standing denominated in a fiat quantity rather than a quantity of havvens;
  - Confiscate from multiple addresses in a single vote;

We might consider updating the contract with any of these features at a later date if necessary.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


import "contracts/Owned.sol";
import "contracts/SafeDecimalMath.sol";
import "contracts/EtherNomin.sol";
import "contracts/Havven.sol";


contract Court is Owned, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    // The addresses of the token contracts this confiscation court interacts with.
    Havven public havven;
    EtherNomin public nomin;

    // The minimum havven balance required to be considered to have standing
    // to begin confiscation proceedings.
    uint public minStandingBalance = 100 * UNIT;

    // The voting period lasts for this duration,
    // and if set, must fall within the given bounds.
    uint public votingPeriod = 1 weeks;
    uint constant MIN_VOTING_PERIOD = 3 days;
    uint constant MAX_VOTING_PERIOD = 4 weeks;

    // Duration of the period during which the foundation may confirm
    // or veto a motion that has concluded.
    // If set, the confirmation duration must fall within the given bounds.
    uint public confirmationPeriod = 1 weeks;
    uint constant MIN_CONFIRMATION_PERIOD = 1 days;
    uint constant MAX_CONFIRMATION_PERIOD = 2 weeks;

    // No fewer than this fraction of havvens must participate in a motion
    // in order for a quorum to be reached.
    // The participation fraction required may be set no lower than 10%.
    uint public requiredParticipation = 3 * UNIT / 10;
    uint constant MIN_REQUIRED_PARTICIPATION = UNIT / 10;

    // At least this fraction of participating votes must be in favour of
    // confiscation for the motion to pass.
    // The required majority may be no lower than 50%.
    uint public requiredMajority = (2 * UNIT) / 3;
    uint constant MIN_REQUIRED_MAJORITY = UNIT / 2;

    // The next ID to use for opening a motion.
    uint nextMotionID = 1;

    // Mapping from motion IDs to target addresses.
    mapping(uint => address) public motionTarget;

    // The ID a motion on an address is currently operating at.
    // Zero if no such motion is running.
    mapping(address => uint) public targetMotionID;

    // The timestamp at which a motion began. This is used to determine
    // whether a motion is: running, in the confirmation period,
    // or has concluded.
    // A motion runs from its start time t until (t + votingPeriod),
    // and then the confirmation period terminates no later than
    // (t + votingPeriod + confirmationPeriod).
    mapping(uint => uint) public motionStartTime;

    // The tallies for and against confiscation of a given balance.
    // These are set to zero at the start of a motion, and also on conclusion,
    // just to keep the state clean.
    mapping(uint => uint) public votesFor;
    mapping(uint => uint) public votesAgainst;

    // The last/penultimate average balance of a user at the time they voted
    // in a particular motion.
    // If we did not save this information then we would have to
    // disallow transfers into an account lest it cancel a vote
    // with greater weight than that with which it originally voted,
    // and the fee period rolled over in between.
    mapping(address => mapping(uint => uint)) voteWeight;

    // The possible vote types.
    // Abstention: not participating in a motion; This is the default value.
    // Yea: voting in favour of a motion.
    // Nay: voting against a motion.
    enum Vote {Abstention, Yea, Nay}

    // A given account's vote in some confiscation motion.
    // This requires the default value of the Vote enum to correspond to an abstention.
    mapping(address => mapping(uint => Vote)) public vote;

    /* ========== CONSTRUCTOR ========== */

    function Court(Havven _havven, EtherNomin _nomin, address _owner)
        Owned(_owner)
        public
    {
        havven = _havven;
        nomin = _nomin;
    }


    /* ========== SETTERS ========== */

    function setMinStandingBalance(uint balance)
        public
        onlyOwner
    {
        // No requirement on the standing threshold here;
        // the foundation can set this value such that
        // anyone or no one can actually start a motion.
        minStandingBalance = balance;
    }

    function setVotingPeriod(uint duration)
        public
        onlyOwner
    {
        require(MIN_VOTING_PERIOD <= duration &&
                duration <= MAX_VOTING_PERIOD);
        // Require that the voting period is no longer than a single fee period,
        // So that a single vote can span at most two fee periods.
        require(duration <= havven.targetFeePeriodDurationSeconds());
        votingPeriod = duration;
    }

    function setConfirmationPeriod(uint duration)
        public
        onlyOwner
    {
        require(MIN_CONFIRMATION_PERIOD <= duration &&
                duration <= MAX_CONFIRMATION_PERIOD);
        confirmationPeriod = duration;
    }

    function setRequiredParticipation(uint fraction)
        public
        onlyOwner
    {
        require(MIN_REQUIRED_PARTICIPATION <= fraction);
        requiredParticipation = fraction;
    }

    function setRequiredMajority(uint fraction)
        public
        onlyOwner
    {
        require(MIN_REQUIRED_MAJORITY <= fraction);
        requiredMajority = fraction;
    }


    /* ========== VIEW FUNCTIONS ========== */

    /* There is a motion in progress on the specified
     * account, and votes are being accepted in that motion. */
    function motionVoting(uint motionID)
        public
        view
        returns (bool)
    {
        // No need to check (startTime < now) as there is no way
        // to set future start times for votes.
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        return now < motionStartTime[motionID] + votingPeriod;
    }

    /* A vote on the target account has concluded, but the motion
     * has not yet been approved, vetoed, or closed. */
    function motionConfirming(uint motionID)
        public
        view
        returns (bool)
    {
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        uint startTime = motionStartTime[motionID];
        return startTime + votingPeriod <= now &&
               now < startTime + votingPeriod + confirmationPeriod;
    }

    /* A vote motion either not begun, or it has completely terminated. */
    function motionWaiting(uint motionID)
        public
        view
        returns (bool)
    {
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        return motionStartTime[motionID] + votingPeriod + confirmationPeriod <= now;
    }

    /* If the motion was to terminate at this instant, it would pass.
     * That is: there was sufficient participation and a sizeable enough majority. */
    function motionPasses(uint motionID)
        public
        view
        returns (bool)
    {
        uint yeas = votesFor[motionID];
        uint nays = votesAgainst[motionID];
        uint totalVotes = safeAdd(yeas, nays);

        if (totalVotes == 0) {
            return false;
        }

        uint participation = safeDecDiv(totalVotes, havven.totalSupply());
        uint fractionInFavour = safeDecDiv(yeas, totalVotes);

        // We require the result to be strictly greater than the requirement
        // to enforce a majority being "50% + 1", and so on.
        return participation > requiredParticipation &&
               fractionInFavour > requiredMajority;
    }

    function hasVoted(address account, uint motionID)
        public
        view
        returns (bool)
    {
        return vote[account][motionID] != Vote.Abstention;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Begin a motion to confiscate the funds in a given nomin account.
     * Only the foundation, or accounts with sufficient havven balances
     * may elect to start such a motion.
     * Returns the ID of the motion that was begun. */
    function beginConfiscationMotion(address target)
        public
        returns (uint)
    {
        // A confiscation motion must be mooted by someone with standing.
        require((havven.balanceOf(msg.sender) >= minStandingBalance) ||
                msg.sender == owner);

        // Require that the voting period is longer than a single fee period,
        // So that a single vote can span at most two fee periods.
        require(votingPeriod <= havven.targetFeePeriodDurationSeconds());

        // There must be no confiscation motion already running for this account.
        require(targetMotionID[target] == 0);

        // Disallow votes on accounts that have previously been frozen.
        require(!nomin.isFrozen(target));

        uint motionID = nextMotionID++;
        motionTarget[motionID] = target;
        targetMotionID[target] = motionID;

        motionStartTime[motionID] = now;
        votesFor[motionID] = 0;
        votesAgainst[motionID] = 0;
        MotionBegun(msg.sender, msg.sender, target, target, motionID, motionID);

        return motionID;
    }

    /* Shared vote setup function between voteFor and voteAgainst.
     * Returns the voter's vote weight. */
    function setupVote(uint motionID)
        internal
        returns (uint)
    {
        // There must be an active vote for this target running.
        // Vote totals must only change during the voting phase.
        require(motionVoting(motionID));

        // The voter must not have an active vote this motion.
        require(!hasVoted(msg.sender, motionID));

        // The voter may not cast votes on themselves.
        require(msg.sender != motionTarget[motionID]);

        // Ensure the voter's vote weight is current.
        havven.recomputeAccountLastAverageBalance(msg.sender);

        uint weight;
        // We use a fee period guaranteed to have terminated before
        // the start of the vote. Select the right period if
        // a fee period rolls over in the middle of the vote.
        if (motionStartTime[motionID] < havven.feePeriodStartTime()) {
            weight = havven.penultimateAverageBalance(msg.sender);
        } else {
            weight = havven.lastAverageBalance(msg.sender);
        }

        // Users must have a nonzero voting weight to vote.
        require(weight > 0);

        voteWeight[msg.sender][motionID] = weight;

        return weight;
    }

    /* The sender casts a vote in favour of confiscation of the
     * target account's nomin balance. */
    function voteFor(uint motionID)
        public
    {
        uint weight = setupVote(motionID);
        vote[msg.sender][motionID] = Vote.Yea;
        votesFor[motionID] = safeAdd(votesFor[motionID], weight);
        VoteFor(msg.sender, msg.sender, motionID, motionID, weight);
    }

    /* The sender casts a vote against confiscation of the
     * target account's nomin balance. */
    function voteAgainst(uint motionID)
        public
    {
        uint weight = setupVote(motionID);
        vote[msg.sender][motionID] = Vote.Nay;
        votesAgainst[motionID] = safeAdd(votesAgainst[motionID], weight);
        VoteAgainst(msg.sender, msg.sender, motionID, motionID, weight);
    }

    /* Cancel an existing vote by the sender on a motion
     * to confiscate the target balance. */
    function cancelVote(uint motionID)
        public
    {
        // An account may cancel its vote either before the confirmation phase
        // when the motion is still open, or after the confirmation phase,
        // when the motion has concluded.
        // But the totals must not change during the confirmation phase itself.
        require(!motionConfirming(motionID));

        Vote senderVote = vote[msg.sender][motionID];

        // If the sender has not voted then there is no need to update anything.
        require(senderVote != Vote.Abstention);

        // If we are not voting, there is no reason to update the vote totals.
        if (motionVoting(motionID)) {
            if (senderVote == Vote.Yea) {
                votesFor[motionID] = safeSub(votesFor[motionID], voteWeight[msg.sender][motionID]);
            } else {
                // Since we already ensured that the vote is not an abstention,
                // the only option remaining is Vote.Nay.
                votesAgainst[motionID] = safeSub(votesAgainst[motionID], voteWeight[msg.sender][motionID]);
            }
            // A cancelled vote is only meaningful if a vote is running
            VoteCancelled(msg.sender, msg.sender, motionID, motionID);
        }

        voteWeight[msg.sender][motionID] = 0;
        vote[msg.sender][motionID] = Vote.Abstention;
    }

    function _closeMotion(uint motionID)
        internal
    {
        targetMotionID[motionTarget[motionID]] = 0;
        motionTarget[motionID] = 0;
        motionStartTime[motionID] = 0;
        votesFor[motionID] = 0;
        votesAgainst[motionID] = 0;
        MotionClosed(motionID, motionID);       
    }

    /* If a motion has concluded, or if it lasted its full duration but not passed,
     * then anyone may close it. */
    function closeMotion(uint motionID)
        public
    {
        require((motionConfirming(motionID) && !motionPasses(motionID)) || motionWaiting(motionID));
        _closeMotion(motionID);
    }

    /* The foundation may only confiscate a balance during the confirmation
     * period after a motion has passed. */
    function approveMotion(uint motionID)
        public
        onlyOwner
    {
        require(motionConfirming(motionID) && motionPasses(motionID));
        address target = motionTarget[motionID];
        nomin.confiscateBalance(target);
        _closeMotion(motionID);
        MotionApproved(motionID, motionID);
    }

    /* The foundation may veto a motion at any time. */
    function vetoMotion(uint motionID)
        public
        onlyOwner
    {
        require(!motionWaiting(motionID));
        _closeMotion(motionID);
        MotionVetoed(motionID, motionID);
    }


    /* ========== EVENTS ========== */

    event MotionBegun(address initiator, address indexed initiatorIndex, address target, address indexed targetIndex, uint motionID, uint indexed motionIDIndex);

    event VoteFor(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex, uint weight);

    event VoteAgainst(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex, uint weight);

    event VoteCancelled(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex);

    event MotionClosed(uint motionID, uint indexed motionIDIndex);

    event MotionVetoed(uint motionID, uint indexed motionIDIndex);

    event MotionApproved(uint motionID, uint indexed motionIDIndex);
}

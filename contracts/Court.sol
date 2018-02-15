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
A vote lasts for a default period of one week, with a further confirmation
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
when the votes tallies must remain static until the matter has been settled.

A motion to confiscate the balance of a given address composes
a state machine built of the following states:


Waiting:
  - A user with standing brings a vote:
    If the target address is not frozen;
    initialise vote tallies to 0;
    transition to the Voting state.

  - An account cancels a previous residual vote:
    remain in the Waiting state.

Voting:
  - The foundation vetoes the in-progress vote:
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
  - The foundation vetoes the completed vote:
    transition to the Waiting state.

  - The foundation approves confiscation of the target account:
    freeze the target account, transfer its nomin balance to the fee pool;
    transition to the Waiting state.

  - The confirmation period elapses:
    transition to the Waiting state.


User votes are not automatically cancelled upon the conclusion of a vote.
Therefore, after a vote comes to a conclusion, if a user wishes to vote 
in another motion, they must manually cancel their vote in order to do so.

This procedure is designed to be relatively simple.
There are some things that can be added to enhance the functionality
at the expense of simplicity and efficiency:
  
  - Allow users to vote in multiple motions at once;
  - Unique motion IDs for clearer logging if multiple motions are mooted for a given account;
  - Democratic unfreezing of nomin accounts (induces multiple categories of vote)
  - Configurable per-vote durations;
  - Vote standing denominated in a fiat quantity rather than a quantity of havvens;
  - Confiscate from multiple addresses in a single vote;

We might consider updating the contract with any of these features at a later date if necessary.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/Owned.sol";
import "contracts/SafeDecimalMath.sol";
import "contracts/EtherNomin.sol";
import "contracts/Havven.sol";


contract Court is Owned, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    // The addresses of the token contracts this confiscation court interacts with.
    Havven havven;
    EtherNomin nomin;

    // The minimum havven balance required to be considered to have standing
    // to begin confiscation proceedings.
    uint public minStandingBalance = 100 * UNIT;

    // The voting period lasts for this duration,
    // and if set, must fall within the given bounds.
    uint public votingPeriod = 1 weeks;
    uint constant MIN_VOTING_PERIOD = 3 days;
    uint constant MAX_VOTING_PERIOD = 4 weeks;

    // Duration of the period during which the foundation may confirm
    // or veto a vote that has concluded.
    // If set, the confirmation duration must fall within the given bounds.
    uint public confirmationPeriod = 1 weeks;
    uint constant MIN_CONFIRMATION_PERIOD = 1 days;
    uint constant MAX_CONFIRMATION_PERIOD = 2 weeks;

    // No fewer than this fraction of havvens must participate in the vote
    // in order for a quorum to be reached.
    // The participation fraction required may be set no lower than 10%.
    uint public requiredParticipation = 3 * UNIT / 10;
    uint constant MIN_REQUIRED_PARTICIPATION = UNIT / 10;

    // At least this fraction of participating votes must be in favour of
    // confiscation for the proposal to pass.
    // The required majority may be no lower than 50%.
    uint public requiredMajority = (2 * UNIT) / 3;
    uint constant MIN_REQUIRED_MAJORITY = UNIT / 2;

    // The next index to use for a vote.
    uint nextVoteIndex = 1;

    // Mapping from vote indexes to addresses.
    mapping(uint => address) public voteIndexAddresses;

    // The index a vote on an address is currently operating at. Zero if no vote is running.
    mapping(address => uint) public addressVoteIndex;

    // The timestamp at which a vote began. This is used to determine
    // Whether a vote is running, is in the confirmation period,
    // or has concluded.
    // A vote runs from its start time t until (t + votingPeriod),
    // and then the confirmation period terminates no later than
    // (t + votingPeriod + confirmationPeriod).
    mapping(uint => uint) public voteStartTime;

    // The tallies for and against confiscation of a given balance.
    // These are set to zero at the start of a vote, and also on conclusion,
    // just to keep the blockchain clean.
    mapping(uint => uint) public votesFor;
    mapping(uint => uint) public votesAgainst;

    // The last/penultimate average balance of a user at the time they voted.
    // If we did not save this information then we would have to
    // disallow transfers into an account lest it cancel a vote
    // with greater weight than that with which it originally voted,
    // and the fee period rolled over in between.
    mapping(address => uint) voteWeight;

    // The possible vote types.
    // Absention: not participating in a vote; This is the default value.
    // Yea: voting in favour of a motion.
    // Nay: voting against a motion.
    enum Vote {Abstention, Yea, Nay}

    // A given account's vote in some confiscation motion.
    // This requires the default value of the Vote enum to correspond to an abstention.
    mapping(address => Vote) public userVote;
    // The vote a user last participated in.
    mapping(address => uint) public userParticipatingVote;

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
    function voting(uint voteIndex)
        public
        view
        returns (bool)
    {
        // No need to check (startTime < now) as there is no way
        // to set future start times for votes.
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        return now < voteStartTime[voteIndex] + votingPeriod;
    }

    /* A vote on the target account has concluded, but the motion
     * has not yet been approved, vetoed, or closed. */
    function confirming(uint voteIndex)
        public
        view
        returns (bool)
    {
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        uint startTime = voteStartTime[voteIndex];
        return startTime + votingPeriod <= now &&
               now < startTime + votingPeriod + confirmationPeriod;
    }

    /* A vote has either not begun, or it has completely terminated. */
    function waiting(uint voteIndex)
        public
        view
        returns (bool)
    {
        // These values are timestamps, they will not overflow
        // as they can only ever be initialised to relatively small values.
        return voteStartTime[voteIndex] + votingPeriod + confirmationPeriod <= now;
    }

    function hasVoted(address account)
        public
        view
        returns (bool)
    {
        return userVote[account] != Court.Vote.Abstention;
    }

    /* If the vote was to terminate at this instant, it would pass.
     * That is: there was sufficient participation and a sizeable enough majority. */
    function votePasses(uint voteIndex)
        public
        view
        returns (bool)
    {
        uint yeas = votesFor[voteIndex];
        uint nays = votesAgainst[voteIndex];
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


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Begin a vote to confiscate the funds in a given nomin account.
     * Only the foundation, or accounts with sufficient havven balances
     * may elect to start such a vote.
     * Returns the index of the vote that was begun. */
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

        // There must be no confiscation vote already running for this account.
        require(addressVoteIndex[target] == 0);

        // Disallow votes on accounts that have previously been frozen.
        require(!nomin.isFrozen(target));

        uint voteIndex = nextVoteIndex++;
        voteIndexAddresses[voteIndex] = target;
        addressVoteIndex[target] = voteIndex;


        voteStartTime[voteIndex] = now;
        votesFor[voteIndex] = 0;
        votesAgainst[voteIndex] = 0;
        ConfiscationVote(msg.sender, msg.sender, target, target, voteIndex, voteIndex);

        return voteIndex;
    }

    /* Shared vote setup function between voteFor and voteAgainst.
     * Returns the voter's vote weight. */
    function setupVote(uint voteIndex)
        internal
        returns (uint)
    {
        // There must be an active vote for this target running.
        // Vote totals must only change during the voting phase.
        require(voting(voteIndex));

        // The voter must not have an active vote in any motion.
        require(!hasVoted(msg.sender));

        uint weight;
        // We use a fee period guaranteed to have terminated before
        // the start of the vote. Select the right period if
        // a fee period rolls over in the middle of the vote.
        if (voteStartTime[voteIndex] < havven.feePeriodStartTime()) {
            weight = havven.penultimateAverageBalance(msg.sender);
        } else {
            weight = havven.lastAverageBalance(msg.sender);
        }

        // Users must have a nonzero voting weight to vote.
        require(weight > 0);

        userParticipatingVote[msg.sender] = voteIndex;
        voteWeight[msg.sender] = weight;

        return weight;
    }

    /* The sender casts a vote in favour of confiscation of the
     * target account's nomin balance. */
    function voteFor(uint voteIndex)
        public
    {
        uint weight = setupVote(voteIndex);
        userVote[msg.sender] = Court.Vote.Yea;
        votesFor[voteIndex] = safeAdd(votesFor[voteIndex], weight);
        VoteFor(msg.sender, msg.sender, voteIndex, voteIndex, weight);
    }

    /* The sender casts a vote against confiscation of the
     * target account's nomin balance. */
    function voteAgainst(uint voteIndex)
        public
    {
        uint weight = setupVote(voteIndex);
        userVote[msg.sender] = Court.Vote.Nay;
        votesAgainst[voteIndex] = safeAdd(votesAgainst[voteIndex], weight);
        VoteAgainst(msg.sender, msg.sender, voteIndex, voteIndex, weight);
    }

    /* Cancel an existing vote by the sender on a motion
     * to confiscate the target balance. */
    function cancelVote(uint voteIndex)
        public
    {
        // An account may cancel its vote either before the confirmation phase
        // when the vote is still open, or after the confirmation phase,
        // when the vote has concluded.
        // But the totals must not change during the confirmation phase itself.
        require(!confirming(voteIndex));
        // Disallow users from cancelling a vote for a different target
        // than the one they have previously voted for.
        require(userParticipatingVote[msg.sender] == voteIndex);

        // If we are not voting, there is no reason to update the vote totals.
        if (voting(voteIndex)) {
            // This call to getVote() must come before the later call to cancelVote(), obviously.
            Vote vote = userVote[msg.sender];

            if (vote == Vote.Yea) {
                votesFor[voteIndex] = safeSub(votesFor[voteIndex], voteWeight[msg.sender]);
            }
            else if (vote == Vote.Nay) {
                votesAgainst[voteIndex] = safeSub(votesAgainst[voteIndex], voteWeight[msg.sender]);
            } else {
                // The sender has not voted.
                return;
            }

            // A cancelled vote is only meaningful if a vote is running
            voteWeight[msg.sender] = 0;
            CancelledVote(msg.sender, msg.sender, voteIndex, voteIndex);
        }

        userVote[msg.sender] = Court.Vote.Abstention;
        userParticipatingVote[msg.sender] = 0;
    }

    /* If a vote has concluded, or if it lasted its full duration but not passed,
     * then anyone may close it. */
    function closeVote(uint voteIndex)
        public
    {
        require((confirming(voteIndex) && !votePasses(voteIndex)) || waiting(voteIndex));

        addressVoteIndex[voteIndexAddresses[voteIndex]] = 0;
        voteIndexAddresses[voteIndex] = 0;
        voteStartTime[voteIndex] = 0;
        votesFor[voteIndex] = 0;
        votesAgainst[voteIndex] = 0;
        VoteClosed(voteIndex, voteIndex);
    }

    /* The foundation may only confiscate a balance during the confirmation
     * period after a vote has passed. */
    function approve(uint voteIndex)
        public
        onlyOwner
    {
        require(confirming(voteIndex));
        require(votePasses(voteIndex));

        address target = voteIndexAddresses[voteIndex];
        nomin.confiscateBalance(target);

        addressVoteIndex[voteIndexAddresses[voteIndex]] = 0;
        voteIndexAddresses[voteIndex] = 0;
        voteStartTime[voteIndex] = 0;
        votesFor[voteIndex] = 0;
        votesAgainst[voteIndex] = 0;
        VoteClosed(voteIndex, voteIndex);
        ConfiscationApproval(voteIndex, voteIndex);
    }

    /* The foundation may veto a motion at any time. */
    function veto(uint voteIndex)
        public
        onlyOwner
    {
        require(!waiting(voteIndex));
        addressVoteIndex[voteIndexAddresses[voteIndex]] = 0;
        voteIndexAddresses[voteIndex] = 0;
        voteStartTime[voteIndex] = 0;
        votesFor[voteIndex] = 0;
        votesAgainst[voteIndex] = 0;
        VoteClosed(voteIndex, voteIndex);
        Veto(voteIndex, voteIndex);
    }


    /* ========== EVENTS ========== */

    event ConfiscationVote(address initator, address indexed initiatorIndex, address target, address indexed targetIndex, uint voteIndex, uint indexed voteIndexIndex);

    event VoteFor(address voter, address indexed voterIndex, uint voteIndex, uint indexed voteIndexIndex, uint weight);

    event VoteAgainst(address voter, address indexed voterIndex, uint voteIndex, uint indexed voteIndexIndex, uint weight);

    event CancelledVote(address voter, address indexed voterIndex, uint voteIndex, uint indexed voteIndexIndex);

    event VoteClosed(uint voteIndex, uint indexed voteIndexIndex);

    event Veto(uint voteIndex, uint indexed voteIndexIndex);

    event ConfiscationApproval(uint voteIndex, uint indexed voteIndexIndex);
}

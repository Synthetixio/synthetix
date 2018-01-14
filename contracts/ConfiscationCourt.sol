/* This contract provides the nomin contract with a confiscation
 * facility, if enough havven owners vote to confiscate a target
 * account's nomins.
 * 
 * This is designed to provide a mechanism to respond to abusive
 * contracts such as nomin wrappers, which would allow users to
 * trade wrapped nomins without accruing fees on those transactions.
 * 
 * In order to prevent tyranny, an account may only be frozen if
 * users controlling at least 30% of the value of havvens participate,
 * and a two thirds majority is attained in that vote.
 * In order to prevent tyranny of the majority or mob justice,
 * confiscation actions are only approved if the havven foundation
 * approves the result.
 * This latter requirement may be lifted in future versions.
 * 
 * The foundation, or any user with a sufficient havven balance may bring a
 * confiscation action.
 * A vote lasts for a default period of one week, with a further confirmation
 * period in which the foundation approves the result.
 * The latter period may conclude early upon the foundation's decision to either
 * veto or approve the mooted confiscation action.
 * If the confirmation period elapses without the foundation making a decision,
 * the action fails.
 *
 * In order to vote, a havven holder must lock their havvens. They may cast
 * a vote for only one action at a time, but may cancel their vote
 * at any time except during the confirmation period, in order to unlock
 * their havven balance.
 * The weight of their vote will be proportional with their locked balance.
 *
 * Hence an action to confiscate the balance of a given address composes
 * a state machine built of the following states:
 *
 *
 * Waiting:
 *   - A user with standing brings a vote:
 *     If the target address is not frozen;
 *     initialise vote tallies to 0;
 *     transition to the Voting state.
 *
 * Voting:
 *   - The foundation vetoes the in-progress vote:
 *     transition to the Waiting state.
 * 
 *   - The voting period elapses:
 *     transition to the Confirmation state.
 *
 *   - An account votes (for or against the motion):
 *     the account is locked, its balance is added to the appropriate tally;
 *     remain in the Voting state.
 * 
 *   - An account cancels its previous vote: 
 *     the account is unlocked, its balance is deducted from the appropriate tally (if any);
 *     remain in the Voting state.
 *
 * Confirmation:
 *   - The foundation vetoes the completed vote:
 *     transition to the Waiting state.
 *
 *   - The foundation approves confiscation of the target account:
 *     freeze the target account, transfer its balance to the nomin fee pool;
 *     transition to the Waiting state.
 *
 *   - The confirmation period elapses:
 *     transition to the Waiting state.
 *
 *
 * User votes are not automatically cancelled upon the conclusion of a vote.
 * Therefore, after a vote comes to a conclusion, if a user wishes to free
 * their havven balance, they must manually cancel their vote in order to do so.
 * 
 * This procedure is designed to be relatively simple.
 * There are some things that can be added to enhance the functionality
 * at the expense of simplicity and efficiency:
 * 
 *   - Unique action IDs for clearer logging if multiple actions are mooted for a given account;
 *   - Democratic unfreezing of nomin accounts (induces multiple categories of vote)
 *   - Configurable per-vote durations;
 *   - Vote standing denominated in a fiat quantity rather than a quantity of havvens;
 *   - Confiscate from multiple addresses in a single vote;
 *   - Allow users to vote in multiple actions at once (up to a limit).
 * 
 * We might consider updating the contract with any of these features at a later date if necessary.
 */

import "Owned.sol";

contract ConfiscationCourt is Owned {

    /* ========== STATE VARIABLES ========== */

    // The minimum havven balance required to be considered to have standing
    // to begin confiscation proceedings.
    uint public minStandingBalance = 100 * UNIT;

    // The voting period lasts for this duration,
    // and if set, must fall within the given bounds.
    uint public votingPeriod = 1 weeks;
    uint public constant minVotingPeriod = 3 days;
    uint public constant maxVotingPeriod = 1 months;

    // Duration of the period during which the foundation may confirm
    // or veto a vote that has concluded.
    // If set, the confirmation duration must fall within the given bounds.
    uint public confirmationPeriod = 1 weeks;
    uint public constant minConfirmationPeriod = 1 days;
    uint public constant maxConfirmationPeriod = 2 weeks;

    // No fewer than this fraction of havvens must participate in the vote
    // in order for a quorum to be reached.
    // The participation fraction required may be set no lower than 20%.
    uint public requiredParticipation = 3 * UNIT / 10;
    uint public constant minRequiredParticipation = 2 * UNIT / 10;

    // At least this fraction of participating votes must be in favour of
    // confiscation for the proposal to pass.
    // The required majority may be no lower than 50%.
    uint public requiredMajority = (2 * UNIT) / 3;
    uint public constant minRequiredMajority = UNIT / 2;

    // The timestamp at which a vote began. This is used to determine
    // Whether a vote is running, is in the confirmation period,
    // or has concluded.
    // A vote runs from its start time t until (t + votingPeriod),
    // and then the confirmation period terminates no later than
    // (t + votingPeriod + confirmationPeriod).
    mapping(address => uint) public voteStartTimes;

    // The tallies for and against confiscation of a given balance.
    // These are set to zero at the start of a vote, and also on conclusion,
    // just to keep the blockchain clean.
    mapping(address => uint) public votesFor;
    mapping(address => uint) public votesAgainst;

    // The addresses of the havven and nomin contracts.
    address public havven;
    address public nomin;


    /* ========== CONSTRUCTOR ========== */

    function ConfiscationCourt(address _havven, address _nomin, address _owner)
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
        minStandingBalance = balance;
    }


    function setVotingPeriod(uint duration)
        public
        onlyOwner
    {
        require(minVotingPeriod <= duration &&
                duration <= maxVotingPeriod);
        votingPeriod = duration;
    }

    function setConfirmationPeriod(uint duration)
        public
        onlyOwner
    {
        require(minConfirmationPeriod <= duration &&
                duration <= maxConfirmationPeriod);
        votingPeriod = duration;
    }

    function setRequiredParticipation(uint fraction)
        public
        onlyOwner
    {
        require(minRequiredParticipation <= fraction);
        requiredParticipation = fraction;
    }

    function setRequiredMajority(uint fraction)
        public
        onlyOwner
    {
        require(minRequiredMajority <= fraction);
        requiredMajority = fraction;
    }


    /* ========== VIEW FUNCTIONS ========== */

    /* There is an action in progress on the specified
     * account, and votes are being accepted in that action.
     */
    function voting(address target)
        public
        view
    {
        // No need to check (startTime < now) as there is no way
        // to set future start times for votes.
        return now < voteStartTimes[target] + votingPeriod;
    }

    /* A vote on the target account has concluded, but the action
     * has not yet been approved, vetoed, or closed.
     */
    function confirming(address target)
        public
        view
    {
        uint startTime = voteStartTimes[target];
        return startTime + votingPeriod <= now &&
               now < startTime + votingPeriod + confirmationPeriod;
    }

    /* A vote has either not begun, or it has completely terminated. */
    function waiting(address target)
        public
        view
    {
        return voteStartTimes[target] + votingPeriod + confirmationPeriod <= now;
    }

    /* If the vote was to terminate at this instant, it would pass.
     * That is: there was sufficient participation and a sizeable enough majority.
     */
    function votePasses(address target) 
        public
        view
    {
        uint yeas = votesFor[target];
        uint nays = votesAgainst[target];
        uint totalVotes = yeas + nays;

        if (totalVotes == 0) {
            return false;
        }

        uint participation = safeDiv(totalVotes, havven.totalSuppy());
        uint fractionInFavour = safeDiv(yeas, totalVotes);

        // We require the result to be strictly greater than the requirement
        // to enforce a majority being "50% + 1", and so on.
        return participation > requiredParticipation &&
               fractionInFavour > requiredMajority;
    }
    

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Begin a vote to confiscate the funds in a given nomin account.
     * Only the foundation, or accounts with sufficient havven balances
     * may elect to start such a vote.
     */
    function beginConfiscationAction(address target)
        public
    {
        // A confiscation action must be mooted by someone with standing.
        require((havven.balanceOf(msg.sender) > minStandingBalance) || 
                msg.sender == owner);

        // There must be no confiscation vote already running for this account.
        require(!voting(target));

        // Disallow votes on accounts that have previously been frozen.
        require(!nomin.frozenAccounts[target]);

        voteStartTimes[target] = now;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
        ConfiscationVote(msg.sender, target);
    }

    /* The sender casts a vote in favour of confiscation of the
     * target account's nomin balance. */
    function voteFor(address target)
        public
    {
        // There must be an active vote for this target running.
        // Vote totals must only change during the voting phase.
        require(voting(target));

        // This user can't already have voted in anything.
        require(!havven.hasVoted(msg.sender));

        // The user should not have voted previously without cancelling
        // that vote; the check inside havven.setVotedFor() ensures this.
        havven.setVotedFor(msg.sender, target);
        uint balance = havven.balanceOf(msg.sender);
        votesFor[msg.sender] += balance;
        VoteFor(msg.sender, target, balance);
    }

    /* The sender casts a vote against confiscation of the
     * target account's nomin balance. */
    function voteAgainst(address target)
        public
    {
        // There must be an active vote for this target running.
        // Vote totals must only change during the voting phase.
        require(voting(target));

        // This user can't already have voted in anything.
        require(!havven.hasVoted(msg.sender));

        // The user should not have voted previously without cancelling
        // that vote; the check inside havven.setVotedAgainst() ensures this.
        havven.setVotedAgainst(msg.sender, target);
        uint balance = havven.balanceOf(msg.sender);
        votesAgainst[msg.sender] += balance;
        VoteAgainst(msg.sender, target, balance);
    }

    /* Cancel an existing vote by the sender on an action
     * to confiscate the target balance. */
    function cancelVote(address target) 
        public
    {
        // An account may cancel its vote either before the confirmation phase
        // when the vote is still open, or after the confirmation phase,
        // when the vote has concluded.
        // But the totals must not change during the confirmation phase itself.
        require(!confirming(target));

        // If we are not voting, there is no reason to update the vote totals.
        if (voting(target)) {
            // This call to getVote() must come before the later call to cancelVote(), obviously.
            int vote = havven.getVote(msg.sender);
            if (vote == 1) {
                votesFor[msg.sender] -= havven.balanceOf(msg.sender);
            }
            else if (vote == -1) {
                votesAgainst[msg.sender] -= havven.balanceOf(msg.sender);
            }
        }

        // If the user is trying to cancel a vote for a different target
        // than the one they have previously voted for, an exception is thrown
        // inside havven.cancelVote, and the state is rolled back.
        havven.cancelVote(msg.sender, target);
        CancelledVote(msg.sender, target); 
    }

    /* If a vote has concluded, or if it lasted its full duration but not passed,
     * then anyone may close it (for example in order to unlock their havven account).
     */
    function closeVote(address target) 
        public
    {
        require((confirming(target) && !votePasses(target)) ||
                waiting(target));
        voteStartTimes[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
        VoteClosed(target);
    }

    /* The foundation may only confiscate a balance during the confirmation
     * period after a vote has passed.
     */
    function approve(address target)
        public
        onlyOwner
    {

        require(confirming(target));
        require(votePasses(target));

        nomin.confiscateBalance(target);
        voteStartTimes[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
        ConfiscationApproval(target);
    }

    /* The foundation may veto an action at any time. */
    function veto(address target) 
        public
        onlyOwner
    {
        voteStartTimes[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
        Veto(target);
    }


    /* ========== EVENTS ========== */

    event ConfiscationVote(address indexed initiator, address target);

    event VoteFor(address indexed account, address indexed target, uint balance);

    event VoteAgainst(address indexed account, address indexed target, uint balance);

    event CancelledVote(address indexed account, address indexed target);

    event VoteClosed(address indexed target);

    event Veto(address indexed target);

    event ConfiscationApproval(address indexed target);
}

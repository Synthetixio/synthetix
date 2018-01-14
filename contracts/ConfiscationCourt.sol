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
 * a state machine that proceeds in the following way:
 * 
 * Waiting:
 *   - A user with standing brings a vote:
 *     If the target address is not frozen,
 *     initialise vote tallies to 0 and transition to the Voting state.
 *
 * Voting:
 *   - The foundation vetoes the in-progress vote:
 *     transition to the Waiting state.
 * 
 *   - The voting period elapses:
 *     transition to the Confirmation state.
 *
 *   - An account votes (for or against the motion):
 *     the account is locked, its balance is added to the appropriate tally,
 *     remain in the Voting state.
 * 
 *   - An account cancels its previous vote: 
 *     the account is unlocked, its balance is deducted from the appropriate tally (if any), 
 *     remain in the Voting state.
 *
 * Confirmation:
 *   - The foundation vetoes the completed vote:
 *     transition to the Waiting state.
 *
 *   - The foundation approves confiscation of the target account:
 *     freeze the target account and transfer its balance to the nomin fee pool,
 *     transition to the Waiting state.
 *
 *   - The confirmation period elapses:
 *     transition to the Waiting state.
 *
 * For the sake of correctness, this procedure is designed to be relatively simple.
 * There are some things that can be added to enhance the functionality
 * at the expense of simplicity and efficiency:
 * 
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

    /* ========== CONTRACT MEMBERS ========== */

	// The minimum havven balance required to be considered to have standing
    // to begin confiscation proceedings.
    uint public minStandingBalance = 100 * UNIT;

    // The voting period lasts for this length of time.
    uint public votingPeriod = 1 weeks;
    // The voting duration must fall within the following range.
    uint public constant minVotingPeriod = 3 days;
    uint public constant maxVotingPeriod = 1 months;

    // Period during which the foundation may confirm or veto a vote that has concluded.
    uint public confirmationPeriod = 1 weeks;
    // Confirmation duration must fall within the following range.
    uint public constant minConfirmationPeriod = 1 days;
    uint public constant maxConfirmationPeriod = 2 weeks;

    // No fewer than this fraction of havvens must participate in the vote
    // in order for it to have standing.
    uint public requiredParticipation = 3 * UNIT / 10;
    // The participation fraction required may be set no lower than 20%.
    uint public constant minRequiredParticipation = 2 * UNIT / 10;

    // At least this fraction of participating votes must be in favour of
    // confiscation for the proposal to pass.
    uint public requiredMajority = (2 * UNIT) / 3;
    // The required majority may be no lower than 50%.
    uint public constant minRequiredMajority = UNIT / 2;

    // The timestamp at which a vote began. This is used to determine
    // Whether a vote is running, is in the confirmation period,
    // or has concluded.
    // A vote runs from its start time t until (t + votingPeriod),
    // and then the confirmation period terminates no later than
    // (t + votingPeriod + confirmationPeriod).
    mapping(address => uint) voteStartTime;

    // The tallies for and against confiscation of a given balance.
    // These are set to zero at the start of a vote, and also on conclusion,
    // just to keep the blockchain clean.
    mapping(address => uint) votesFor;
    mapping(address => uint) votesAgainst;

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


    /* ========== QUERY FUNCTIONS ========== */

    function voteIsOpen(address target)
        public
        view
    {
        // No need to check (startTime < now) as there is no way
        // to set future start times for votes.
        return now < voteStartTime[target] + votingPeriod;
    }

    function inConfirmationPeriod(address target)
    	public
    	view
    {
    	uint startTime = voteStartTime[target];
    	return startTime + votingPeriod <= now &&
               now < startTime + votingPeriod + confirmationPeriod;
    }

    function voteHasTerminated(address target)
    	public
    	view
    {
    	return voteStartTime[target] + votingPeriod + confirmationPeriod <= now;
    }

    /* If the vote was to terminate at this instant, would it pass? */
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
    

    /* ========== MUTATORS ========== */

    /* Begin a vote to confiscate the funds in a given nomin account.
     * Only people with sufficient havven balances may elect to start such a vote.
     */
    function mootConfiscation(address target)
        public
    {
        // A confiscation action must be mooted by someone with standing;
        // That is, they must have a sufficient havven balance or be
        // the contract's owner.
        require((havven.balanceOf(msg.sender) > minStandingBalance) || 
                msg.sender == owner);
        // Disallow votes on accounts that have previously been frozen.
        require(!nomin.frozenAccounts[target]);

        // There must be no confiscation vote already running.
        require(!voteIsOpen(target));

        voteStartTime[target] = now;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
    }

    function voteForConfiscation(address target)
        public
    {
        require(voteIsOpen(target));
        require(!havven.hasVoted(msg.sender));
        havven.setVotedFor(msg.sender);
        votesFor[msg.sender] += havven.balanceOf(msg.sender);
    }

    function voteAgainstConfiscation(address target)
        public
    {
        require(voteIsOpen(target));
        require(!havven.hasVoted(msg.sender));
        havven.setVotedAgainst(msg.sender);
        votesAgainst[msg.sender] += havven.balanceOf(msg.sender);
    }

    function cancelVote(address target) 
        public
    {
    	require(!inConfirmationPeriod(target));
        if (voteIsOpen(target)) {
	        int vote = havven.getVote(msg.sender);
	        if (vote == 1) {
	        	votesFor[msg.sender] -= havven.balanceOf(msg.sender);
	        }
	        else if (vote == -1) {
	        	votesAgainst[msg.sender] -= havven.balanceOf(msg.sender);
	        }
    	}
        havven.cancelVote(msg.sender);
    }

    /* If a vote has concluded, or if it lasted its full duration but not passed,
     * then anyone may cancel it.
     */
    function closeVote(address target) 
    	public
    {
    	require((inConfirmationPeriod(target) && !votePasses(target)) ||
    			voteHasTerminated(target));
    	voteStartTime[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
    }

    /* The foundation may only confiscate a balance during the confirmation
     * period after a vote has passed.
     */
    function confiscate(address target)
    	public
    	onlyOwner
    {

    	require(inConfirmationPeriod(target));
    	require(votePasses(target));

    	nomin.confiscateBalance(target);
    	voteStartTime[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
    }

    /* The foundation may veto an action at any time. */
    function veto(address target) 
    	public
    	onlyOwner
    {
    	voteStartTime[target] = 0;
        votesFor[target] = 0;
        votesAgainst[target] = 0;
    }


}

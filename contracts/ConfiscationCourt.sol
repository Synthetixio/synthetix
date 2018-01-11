/* Structure of a confiscation:
 * 
 * State: Waiting
 *        Parameters: None
 *  	  Actions: Start Vote 
 *   	     	   Parameters: target address
 *  			   Conditions: initiator of vote must have standing
 *  			   Result:     transition to state Voting
 *  State: Voting
 *		   Parameters: target address
 *                     initiation date
 *         Actions: Vote For
 *                  Vote Against
 *                  Cancel Vote
 *         Triggers: End Vote
 */


contract ConfiscationCourt {
	// The minimum havven balance required to be considered to have standing
    // to begin confiscation proceedings.
    uint public minStandingBalance = 100 * UNIT;

    // Confiscation votes last for this length of time.
    uint public confiscationPeriod = 1 week;

    // No fewer than this fraction of havvens must participate in the vote
    // in order for it to have standing. (30%)
    uint public minConfiscationParticipationFraction = 3 * UNIT / 10;

    // At least this fraction of participating votes must be in favour of
    // confiscation for the proposal to pass.
    uint public confiscationVoteThreshold = 2 * UNIT / 3;

    mapping(address => uint) confiscationStartTime;
    mapping(address => uint) votesForConfiscation;
    mapping(address => uint) votesAgainstConfiscation;

    address public havven;
    address public nomin;

    function ConfiscationCourt(address _havven, address _nomin)
    	public
    {
    	havven = _havven;    	
    	nomin = _nomin;
    }

    function voteIsRunning(address target)
        public
    {
        // No need to check (startTime < now) as there is no way
        // to set future start times for votes.
        return now < confiscationStartTime[target] + confiscationPeriod;
    }

    /* Begin a vote to confiscate the funds in a given nomin account.
     * Only people with sufficient havven balances may elect to start such a vote.
     */
    function mootConfiscation(address target)
        public
    {
        // A confiscation must be mooted by someone with standing;
        // That is, they must have a sufficient havven balance or be
        // the contract's owner.
        require((havven.balanceOf(msg.sender) > minStandingBalance) || 
                msg.sender == owner);

        // There must be no confiscation vote already running.
        require(!voteIsRunning(target));

        confiscationStartTime[target] = now;
        votesForConfiscation[target] = 0;
        votesAgainstConfiscation[target] = 0;
    }

    function voteForConfiscation(address target)
        public
    {
        require(voteIsRunning(target));
        require(!havven.hasVoted(msg.sender));
        havven.setVoted(msg.sender);
        votesForConfiscation[msg.sender] += havven.balanceOf(msg.sender);
    }

    function voteAgainstConfiscation(address target)
        public
    {
        require(voteIsRunning(target));
        require(!havven.hasVoted(msg.sender));
        havven.setVoted(msg.sender);
        votesForConfiscation[msg.sender] += havven.balanceOf(msg.sender);
    }

    function cancelVote(address target) 
        public
    {
        
    }
}

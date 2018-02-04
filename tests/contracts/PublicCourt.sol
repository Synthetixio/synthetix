pragma solidity ^0.4.19;

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

	function _minStandingBalance()
		public
		view
		returns (uint)
	{
		return minStandingBalance;
	}

	function _votingPeriod()
		public
		view
		returns (uint)
	{
		return votingPeriod;
	}

	function _minVotingPeriod()
		public
		view
		returns (uint)
	{
		return minVotingPeriod;
	}

	function _maxVotingPeriod()
		public
		view
		returns (uint)
	{
		return maxVotingPeriod;
	}

	function _confirmationPeriod()
		public
		view
		returns (uint)
	{
		return confirmationPeriod;
	}

	function _minConfirmationPeriod()
		public
		view
		returns (uint)
	{
		return minConfirmationPeriod;
	}

	function _maxConfirmationPeriod()
		public
		view
		returns (uint)
	{
		return maxConfirmationPeriod;
	}

	function _requiredParticipation()
		public
		view
		returns (uint)
	{
		return requiredParticipation;
	}

	function _minRequiredParticipation()
		public
		view
		returns (uint)
	{
		return minRequiredParticipation;
	}

	function _requiredMajority()
		public
		view
		returns (uint)
	{
		return requiredMajority;
	}

	function _minRequiredMajority()
		public
		view
		returns (uint)
	{
		return minRequiredMajority;
	}

	function _voteWeight(address account)
		public
		view
		returns (uint)
	{
		return voteWeight[account];
	}

	function publicSetVotedYea(address account, address target)
		public
	{
		setVotedYea(account, target);
	}

	function publicSetVotedNay(address account, address target)
		public
	{
		setVotedNay(account, target);
	}
}
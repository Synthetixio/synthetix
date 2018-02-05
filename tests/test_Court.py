import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, fast_forward, force_mine_block, DUMMY, take_snapshot, restore_snapshot, fresh_account, fresh_accounts
from utils.testutils import assertReverts
from utils.testutils import generate_topic_event_map, get_event_data_from_log

SOLIDITY_SOURCES =  ["tests/contracts/PublicCourt.sol", "contracts/EtherNomin.sol", "tests/contracts/PublicHavven.sol"]

def deploy_public_court():
	print("Deployment Initiated. \n")

	compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")
	court_abi = compiled['PublicCourt']['abi']

	havven_contract, havven_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [MASTER])
	nomin_contract, nomin_txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [havven_contract.address, MASTER, MASTER, 1000*UNIT, MASTER])
	court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt', MASTER, [havven_contract.address, nomin_contract.address, MASTER])

	txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}), nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
	attempt(mine_txs, [txs], "Linking contracts... ")

	print("\nDeployment complete.\n")
	return havven_contract, nomin_contract, court_contract, court_abi

def setUpModule():
    print("Testing Court...")

def tearDownModule():
    print()

class TestCourt(unittest.TestCase):
	def setUp(self):
		self.snapshot = take_snapshot()

	def tearDown(self):
		restore_snapshot(self.snapshot)
	"""
	Test the Court contract
	"""
	@classmethod
	def setUpClass(cls):
		cls.assertReverts = assertReverts

		cls.havven, cls.nomin, cls.court, cls.court_abi = deploy_public_court()

		# Event stuff
		cls.court_event_dict = generate_topic_event_map(cls.court_abi)

		# Inherited
		cls.owner = lambda self: self.court.functions.owner().call()

		# Non-public variables
		cls.getHavven = lambda self: self.court.functions._havven().call()
		cls.getNomin = lambda self: self.court.functions._nomin().call()
		cls.minStandingBalance = lambda self: self.court.functions.minStandingBalance().call()
		cls.votingPeriod = lambda self: self.court.functions.votingPeriod().call()
		cls.minVotingPeriod = lambda self: self.court.functions._minVotingPeriod().call()
		cls.maxVotingPeriod = lambda self: self.court.functions._maxVotingPeriod().call()
		cls.confirmationPeriod = lambda self: self.court.functions.confirmationPeriod().call()
		cls.minConfirmationPeriod = lambda self: self.court.functions._minConfirmationPeriod().call()
		cls.maxConfirmationPeriod = lambda self: self.court.functions._maxConfirmationPeriod().call()
		cls.requiredParticipation = lambda self: self.court.functions.requiredParticipation().call()
		cls.minRequiredParticipation = lambda self: self.court.functions._minRequiredParticipation().call()
		cls.requiredMajority = lambda self: self.court.functions.requiredMajority().call()
		cls.minRequiredMajority = lambda self: self.court.functions._minRequiredMajority().call()
		cls.voteWeight = lambda self: self.court.functions.voteWeight().call()

		# Public variables
		cls.voteStartTimes = lambda self, account: self.court.functions.voteStartTimes(account).call()
		cls.votesFor = lambda self, account: self.court.functions.votesFor(account).call()
		cls.votesAgainst = lambda self, account: self.court.functions.votesAgainst(account).call()
		cls.userVote = lambda self, account: self.court.functions.userVote(account).call()
		cls.voteTarget = lambda self, account: self.court.functions.voteTarget(account).call()

		# Inherited setter
		cls.setOwner = lambda self, sender, address: mine_tx(self.court.functions.setOwner(address).transact({'from': sender}))

		# Setters
		cls.setMinStandingBalance = lambda self, sender, balance: mine_tx(self.court.functions.setMinStandingBalance(balance).transact({'from' : sender}))
		cls.setVotingPeriod = lambda self, sender, duration: mine_tx(self.court.functions.setVotingPeriod(duration).transact({'from' : sender}))
		cls.setConfirmationPeriod = lambda self, sender, duration: mine_tx(self.court.functions.setConfirmationPeriod(duration).transact({'from' : sender}))
		cls.setRequiredParticipation = lambda self, sender, fraction: mine_tx(self.court.functions.setRequiredParticipation(fraction).transact({'from' : sender}))
		cls.setRequiredMajority = lambda self, sender, fraction: mine_tx(self.court.functions.setRequiredMajority(fraction).transact({'from' : sender}))

		# Views
		cls.hasVoted = lambda self, sender: self.court.functions.hasVoted(sender).call()
		cls.voting = lambda self, target: self.court.functions.voting(target).call()
		cls.confirming = lambda self, target: self.court.functions.confirming(target).call()
		cls.waiting = lambda self, target: self.court.functions.waiting(target).call()
		cls.votePasses = lambda self, target: self.court.functions.votePasses(target).call()

		# Mutators
		cls.beginConfiscationAction = lambda self, sender, target: mine_tx(self.court.functions.beginConfiscationAction(target).transact({'from' : sender}))
		cls.voteFor = lambda self, sender, target: mine_tx(self.court.functions.voteFor(target).transact({'from' : sender}))
		cls.voteAgainst = lambda self, sender, target: mine_tx(self.court.functions.voteAgainst(target).transact({'from' : sender}))
		cls.cancelVote = lambda self, sender, target: mine_tx(self.court.functions.cancelVote(target).transact({'from' : sender}))
		cls.closeVote = lambda self, sender, target: mine_tx(self.court.functions.closeVote(target).transact({'from' : sender}))

		# Owner only
		cls.approve = lambda self, sender, target: mine_tx(self.court.functions.approve(target).transact({'from' : sender}))
		cls.veto = lambda self, sender, target: mine_tx(self.court.functions.veto(target).transact({'from' : sender}))

		# Internal
		cls.setVotedYea = lambda self, sender, account, target: self.court.functions.publicSetVotedYea(account, target).transact({'from' : sender})
		cls.setVotedNay = lambda self, sender, account, target: self.court.functions.publicSetVotedNay(account, target).transact({'from' : sender})

		# Havven getters
		cls.havvenSupply = lambda self: self.havven.functions.totalSupply().call()
		cls.havvenBalance = lambda self, account: self.havven.functions.balanceOf(account).call()
		cls.havvenHasVoted = lambda self, account: self.havven.functions.hasVoted(account).call()
		cls.havvenTargetFeePeriodDurationSeconds = lambda self : self.havven.functions.targetFeePeriodDurationSeconds().call()
		cls.havvenPenultimateAverageBalance = lambda self, addr: self.havven.functions.penultimateAverageBalance(addr).call()
		cls.havvenLastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()

		# Havven mutators
		cls.havvenEndow = lambda self, sender, account, value: mine_tx(self.havven.functions.endow(account, value).transact({'from' : sender}))
		cls.havvenTransfer = lambda self, sender, to, value: mine_tx(self.havven.functions.transfer(to, value).transact({'from' : sender}))
		cls.havvenCheckFeePeriodRollover = lambda self, sender: mine_tx(self.havven.functions._checkFeePeriodRollover().transact({'from': sender}))
		cls.havvenAdjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
		cls.havvenSetTargetFeePeriodDuration = lambda self, sender, duration: mine_tx(self.havven.functions.setTargetFeePeriodDuration(duration).transact({'from' : sender}))

		# Nomin getter
		cls.nominIsFrozen = lambda self, account: self.nomin.functions.isFrozen(account).call()

		# Solidity convenience
		cls.days = 86400
		cls.weeks = 604800
		cls.months = 2628000


	def test_constructor(self):
		self.assertEqual(self.owner(), MASTER)
		self.assertEqual(self.havven.address, self.getHavven())
		self.assertEqual(self.nomin.address, self.getNomin())
		self.assertEqual(self.minStandingBalance(), 100 * UNIT)
		self.assertEqual(self.votingPeriod(), 1 * self.weeks)
		self.assertEqual(self.minVotingPeriod(), 3 * self.days)
		self.assertEqual(self.maxVotingPeriod(), 4 * self.weeks)
		self.assertEqual(self.confirmationPeriod(), 1 * self.weeks)
		self.assertEqual(self.minConfirmationPeriod(), 1 * self.days)
		self.assertEqual(self.maxConfirmationPeriod(), 2 * self.weeks)
		self.assertEqual(self.requiredParticipation(), 3 * UNIT / 10)
		self.assertEqual(self.minRequiredParticipation(), UNIT / 10)
		self.assertEqual(self.requiredMajority(), (2 * UNIT) // 3)
		self.assertEqual(self.minRequiredMajority(), UNIT / 2)


	def test_setOwner(self):
		owner = self.owner()
		# Only owner can setOwner.
		self.assertReverts(self.setOwner, DUMMY, DUMMY)
		self.setOwner(owner, DUMMY)
		self.assertEqual(self.owner(), DUMMY)


	def test_setMinStandingBalance(self):
		owner = self.owner()
		new_min_standing_balance = 200 * UNIT
		# Only owner can set minStandingBalance.
		self.assertReverts(self.setMinStandingBalance, DUMMY, new_min_standing_balance)
		tx_receipt = self.setMinStandingBalance(owner, new_min_standing_balance)
		self.assertEqual(self.minStandingBalance(), new_min_standing_balance)


	def test_setVotingPeriod(self):
		owner = self.owner()
		new_voting_period = 2 * self.weeks
		# Only owner can set votingPeriod.
		self.assertReverts(self.setVotingPeriod, DUMMY, new_voting_period)
		tx_receipt = self.setVotingPeriod(owner, new_voting_period)
		self.assertEqual(self.votingPeriod(), new_voting_period)
		# Voting period must be > than minVotingPeriod (~ currently 3 days).
		bad_voting_period = 3 * self.days - 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)
		# Voting period must be < than maxVotingPeriod (~ currently 4 weeks).
		bad_voting_period = 4 * self.weeks + 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)
		# Voting period must be <= the havven target fee period duration.
		fee_period_duration = 2 * self.weeks
		self.havvenSetTargetFeePeriodDuration(owner, fee_period_duration)
		self.assertEqual(self.havvenTargetFeePeriodDurationSeconds(), fee_period_duration)
		# Voting period must be <= fee period duration.
		bad_voting_period = 2 * self.weeks + 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)


	def test_setConfirmationPeriod(self):
		owner = self.owner()
		new_confirmation_period = 2 * self.weeks
		# Only owner can set confirmationPeriod.
		self.assertReverts(self.setConfirmationPeriod, DUMMY, new_confirmation_period)
		tx_receipt = self.setConfirmationPeriod(owner, new_confirmation_period)
		self.assertEqual(self.confirmationPeriod(), new_confirmation_period)
		# Confirmation period must be > than minConfirmationPeriod (~ currently 1 days).
		bad_confirmation_period = 1 * self.days - 1
		self.assertReverts(self.setConfirmationPeriod, owner, bad_confirmation_period)
		# Confirmation period must be < than maxConfirmationPeriod (~ 3 weeks).
		bad_confirmation_period = 3 * self.weeks + 1
		self.assertReverts(self.setConfirmationPeriod, owner, bad_confirmation_period)


	def test_setRequiredParticipation(self):
		owner = self.owner()
		new_required_participation = 5 * UNIT // 10
		# Only owner can set requiredParticipation.
		self.assertReverts(self.setRequiredParticipation, DUMMY, new_required_participation)
		tx_receipt = self.setRequiredParticipation(owner, new_required_participation)
		self.assertEqual(self.requiredParticipation(), new_required_participation)
		# Required participation must be >= than 10%.
		bad_required_participation = UNIT // 10 - 1
		self.assertReverts(self.setRequiredParticipation, owner, bad_required_participation)


	def test_setRequiredMajority(self):
		owner = self.owner()
		new_required_majority = (3 * UNIT) // 4 
		# Only owner can set requiredMajority.
		self.assertReverts(self.setRequiredMajority, DUMMY, new_required_majority)
		tx_receipt = self.setRequiredMajority(owner, new_required_majority) 
		self.assertEqual(self.requiredMajority(), new_required_majority)
		# Required majority must be >= than 50%.
		bad_required_majority = UNIT // 2 - 1
		self.assertReverts(self.setRequiredMajority, owner, bad_required_majority)


	def test_hasVoted(self):
		owner = self.owner()
		voter, suspect = fresh_accounts(2)
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give 1000 havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Fast forward to update the vote weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# This should fail because no confiscation action has begun.
		self.assertFalse(self.hasVoted(voter))
		self.beginConfiscationAction(owner, suspect)
		# This should return false because the voter has not voted yet.
		self.assertFalse(self.hasVoted(voter))
		self.voteFor(voter, suspect)	
		# This should return true because the voter has voted.
		self.assertTrue(self.hasVoted(voter))
		# And false when they cancel their vote.
		self.cancelVote(voter, suspect)	
		self.assertFalse(self.hasVoted(voter))
		# And true again if they vote against.
		self.voteFor(voter, suspect)	
		self.assertTrue(self.hasVoted(voter))

	def test_waiting_voting_confirming_state_transitions(self):
		owner = self.owner()
		suspect = fresh_account()
		voting_period = self.votingPeriod()
		confirmation_period = self.confirmationPeriod()
		# Before a confisaction action begins, should be in the waiting state.
		self.assertTrue(self.waiting(suspect))
		self.assertFalse(self.voting(suspect))
		self.assertFalse(self.confirming(suspect))
		# Begin a confiscation action against the suspect, should move to the voting state.
		self.beginConfiscationAction(owner, suspect)
		self.assertFalse(self.waiting(suspect))
		self.assertTrue(self.voting(suspect))
		self.assertFalse(self.confirming(suspect))
		# Fast forward to the middle of the voting period, should still be in the voting state.
		fast_forward(voting_period / 2)
		self.assertFalse(self.waiting(suspect))
		self.assertTrue(self.voting(suspect))
		self.assertFalse(self.confirming(suspect))
		# When the voting period finishes, should move to confirming state.
		fast_forward(voting_period / 2)
		self.assertFalse(self.waiting(suspect))
		self.assertFalse(self.voting(suspect))
		self.assertTrue(self.confirming(suspect))
		# Fast forward to the middle of the confrimation period, should still be in the confirming state.
		fast_forward(confirmation_period / 2)
		self.assertFalse(self.waiting(suspect))
		self.assertFalse(self.voting(suspect))
		self.assertTrue(self.confirming(suspect))
		# When the voting confirmation period finishes, should move to waiting state.
		fast_forward(confirmation_period / 2)
		self.assertTrue(self.waiting(suspect))
		self.assertFalse(self.voting(suspect))
		self.assertFalse(self.confirming(suspect))

	def test_votePasses(self):
		owner = self.owner()
		accounts = fresh_accounts(11)
		suspect = accounts[0]
		voters = accounts[1:]
		required_participation = self.requiredParticipation()
		required_majority = self.requiredMajority()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		tokens = self.havvenSupply() // 20
		# Give 1/20th of the token supply to each of our 10 voters. In total 50% of tokens distributed.
		for voter in voters:
			self.havvenEndow(owner, voter, tokens)
			self.assertEqual(self.havvenBalance(voter), tokens)
		# Fast forward to update the vote weights.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		# Begin a confiscation action against the suspect.
		self.beginConfiscationAction(owner, suspect)
		self.assertFalse(self.votePasses(suspect))
		# 100% in favour and 0% against (50% participation).
		for voter in voters:
			self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
			self.voteFor(voter, suspect)
		self.assertTrue(self.votePasses(suspect))
		self.assertEqual(self.votesFor(suspect), self.havvenSupply() // 2)
		# All cancel votes.
		for voter in voters:
			self.cancelVote(voter, suspect)
		self.assertFalse(self.votePasses(suspect))
		self.assertEqual(self.votesFor(suspect), 0)
		# 100% against and 0% in favour (50% participation).
		for voter in voters:
			self.voteAgainst(voter, suspect)
		self.assertFalse(self.votePasses(suspect))
		self.assertEqual(self.votesAgainst(suspect), self.havvenSupply() // 2)
		# All cancel votes.
		for voter in voters:
			self.cancelVote(voter, suspect)
		self.assertEqual(self.votesAgainst(suspect), 0)
		# 60% in favour and 0% against (30% participation)
		for voter in voters[:6]:
			self.voteFor(voter, suspect)
		# Required participation must be > than 30%.
		self.assertFalse(self.votePasses(suspect))
		# But if another user votes in favour, participation = 35% which is sufficient for a vote to pass.
		self.voteFor(voters[7], suspect)
		self.assertTrue(self.votePasses(suspect))
		# The last 3 vote against, 70% in favour and 30% against (required majority is 2/3).
		for voter in voters[8:]:
			self.voteAgainst(voter, suspect)
		self.assertTrue(self.votePasses(suspect))
		# If one changes their vote for to against, should not pass since 60% in favour 40% against (less than the min required majority of 2/3).
		self.cancelVote(voters[7], suspect)
		self.voteAgainst(voters[7], suspect)
		self.assertFalse(self.votePasses(suspect))

	def test_beginConfiscationAction(self):
		owner = self.owner()
		accounts = fresh_accounts(5)
		insufficient_standing = accounts[0]
		sufficient_standing =  accounts[1]
		voter = accounts[2]
		suspects = accounts[3:]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2
		# Give 50% of the havven tokens to voter, enough to pass a confiscation action on their own.
		self.havvenEndow(owner, voter, controlling_share)
		self.assertEqual(self.havvenBalance(voter), controlling_share)
		# Fast forward to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		self.havvenEndow(owner, insufficient_standing, 99 * UNIT)
		self.havvenEndow(owner, sufficient_standing, 100 * UNIT)
		# Must have at least 100 havvens to begin a confiscsation action.
		self.assertReverts(self.beginConfiscationAction, insufficient_standing, suspects[0])
		tx_receipt = self.beginConfiscationAction(sufficient_standing, suspects[0])
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "ConfiscationVote")
		self.assertTrue(self.voting(suspects[0]))
		# The contract owner can also begin an action, regardless of the token requirement.
		self.beginConfiscationAction(owner, suspects[1])
		# Cannot open multiple confiscation actions on one suspect.
		self.assertReverts(self.beginConfiscationAction, owner, suspects[0])
		self.voteFor(voter, suspects[0])
		fast_forward(voting_period)
		self.approve(owner, suspects[0])
		self.assertTrue(self.nominIsFrozen(suspects[0]))
		# Cannot open a vote on an account that has already been frozen.
		self.assertReverts(self.beginConfiscationAction, owner, suspects[0])


	def test_voteFor(self):
		owner = self.owner()
		accounts = fresh_accounts(4)
		voter = accounts[0]
		no_tokens = accounts[1]
		suspects = accounts[2:]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Cannot vote unless there is a confiscation action.
		self.assertReverts(self.voteFor, voter, suspects[0])
		# Fast forward to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect.
		self.beginConfiscationAction(owner, suspects[0])
		self.assertTrue(self.voting(suspects[0]))
		# Cast a vote in favour of confiscation.
		tx_receipt = self.voteFor(voter, suspects[0])
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteFor")
		self.assertEqual(self.votesFor(suspects[0]), 1000)
		# Our voter should not be able to vote in more than one action at a time.
		self.beginConfiscationAction(owner, suspects[1])
		self.assertReverts(self.voteFor, voter, suspects[1])
		# It should not be possible to vote without any tokens.
		self.assertReverts(self.voteFor, no_tokens, suspects[0])


	def test_voteAgainst(self):
		owner = self.owner()
		accounts = fresh_accounts(4)
		voter = accounts[0]
		no_tokens = accounts[1]
		suspects = accounts[2:]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Cannot vote unless there is a confiscation action.
		self.assertReverts(self.voteAgainst, voter, suspects[0])
		# Fast forward two fee periods to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect.
		self.beginConfiscationAction(owner, suspects[0])
		self.assertTrue(self.voting(suspects[0]))
		# Cast a vote against confiscation.
		tx_receipt = self.voteAgainst(voter, suspects[0])
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteAgainst")
		self.assertEqual(self.votesAgainst(suspects[0]), 1000)
		# Another confiscation action is opened, our voter should not be able to vote in more than one action at a time.
		self.beginConfiscationAction(owner, suspects[1])
		self.assertReverts(self.voteAgainst, voter, suspects[1])
		# It should not be possible to vote without any tokens.
		self.assertReverts(self.voteAgainst, no_tokens, suspects[0])


	def test_cancelVote(self):
		owner = self.owner()
		voter, suspect = fresh_accounts(2)
		voting_period = self.votingPeriod()
		confirmation_period = self.confirmationPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		fast_forward(fee_period + 1)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect.
		self.beginConfiscationAction(owner, suspect)
		# Cast a vote in favour of confiscation.
		self.voteFor(voter, suspect)
		self.assertEqual(self.votesFor(suspect), 1000)
		tx_receipt  = self.cancelVote(voter, suspect)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "CancelledVote")
		self.assertEqual(self.votesFor(suspect), 0)
		self.assertEqual(self.userVote(voter), 0)
		# Cast a vote against confiscation.
		self.voteAgainst(voter, suspect)
		self.assertEqual(self.votesAgainst(suspect), 1000)
		self.cancelVote(voter, suspect)
		self.assertEqual(self.votesAgainst(suspect), 0)
		self.assertEqual(self.userVote(voter), 0)
		# Cannot cancel a vote during the confirmation period.
		self.voteFor(voter, suspect)
		fast_forward(voting_period)
		self.assertReverts(self.cancelVote, voter, suspect)
		self.assertEqual(self.userVote(voter), 1)
		# Can cancel it after the confirmation period.
		fast_forward(confirmation_period)
		self.cancelVote(voter,suspect)
		self.assertEqual(self.userVote(voter), 0)


	def test_closeVote(self):
		owner = self.owner()
		voter, suspect = fresh_accounts(2)
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		# Fast forward two fee periods to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		self.beginConfiscationAction(owner, suspect)
		# Should not be able to close vote in the voting period.
		self.assertReverts(self.closeVote, voter, suspect)
		fast_forward(voting_period)
		self.assertTrue(self.confirming(suspect))
		tx_receipt = self.closeVote(voter, suspect)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteClosed")
		# Start another confisaction action.
		self.beginConfiscationAction(owner, suspect)
		self.voteFor(voter, suspect)
		fast_forward(voting_period)
		# After vote has closed, voteStarTimes and votesFor/votesAgainst should be 0 and suspect should be waiting.
		self.closeVote(voter, suspect)	
		self.assertEqual(self.votesFor(suspect), 0)
		self.assertEqual(self.voteStartTimes(suspect), 0)
		self.assertTrue(self.waiting(suspect))


	def test_approve(self):
		owner = self.owner()
		voter, guilty = fresh_accounts(2)
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2
		# Give 50% of all havven tokens to our voter.
		self.havvenEndow(owner, voter, controlling_share)
		# Fast forward two fee periods to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		self.beginConfiscationAction(owner, guilty)
		# Cast a vote in favour of confiscation.
		tx_receipt = self.voteFor(voter, guilty)
		# It should not be possible to approve in the voting state.
		self.assertReverts(self.approve, owner, guilty)
		fast_forward(voting_period)
		self.assertTrue(self.confirming(guilty))
		# Only the owner can approve the confiscation of a balance.
		self.assertReverts(self.approve, voter, guilty)
		tx_receipt = self.approve(owner, guilty)
		# Check that event is emitted properly.
		# self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteClosed")
		# self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "ConfiscationApproval")
		self.assertEqual(self.voteStartTimes(guilty), 0)
		self.assertEqual(self.votesFor(guilty), 0)
		# After confiscation, their nomin balance should be frozen.
		self.assertTrue(self.nominIsFrozen(guilty))


	def test_veto(self):
		owner = self.owner()
		voter, acquitted = fresh_accounts(2)
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2
		self.havvenEndow(owner, voter, controlling_share)
		# Fast forward two fee periods to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Cannot veto when there is no vote in progress.
		self.assertReverts(self.veto, owner, acquitted)
		self.beginConfiscationAction(owner, acquitted)
		# Only owner can veto.
		self.assertReverts(self.veto, DUMMY, acquitted)
		self.veto(owner, acquitted)
		# After veto action, suspect should be back in the waiting stage.
		self.assertTrue(self.waiting(acquitted))
		self.beginConfiscationAction(owner, acquitted)
		self.voteFor(voter, acquitted)
		self.assertTrue(self.votePasses(acquitted))
		fast_forward(voting_period)
		self.assertTrue(self.confirming(acquitted))
		# Once a vote has been passed, the owner can veto it.
		tx_receipt = self.veto(owner, acquitted)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteClosed")
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "Veto")
		# After veto action, suspect should be back in the waiting stage.
		self.assertTrue(self.waiting(acquitted))
		# Votes should be reset.
		self.assertEqual(self.voteStartTimes(acquitted), 0)
		self.assertEqual(self.votesFor(acquitted), 0)
		self.assertEqual(self.votesAgainst(acquitted), 0)
		self.assertTrue(self.waiting(acquitted))


	def test_setVotedYea(self):
		owner = self.owner()
		voter, suspect = fresh_accounts(2)
		self.beginConfiscationAction(owner, suspect)
		# Test that internal function properly updates state
		self.setVotedYea(voter, voter, suspect)
		self.assertEqual(self.userVote(voter), 1)
		self.assertEqual(self.voteTarget(voter), suspect)
		# If already voted, cannot set again
		self.assertReverts(self.setVotedYea, voter, voter, suspect)
		self.assertReverts(self.setVotedNay, voter, voter, suspect)


	def test_setVotedNay(self):
		owner = self.owner()
		voter, suspect = fresh_accounts(2)
		self.beginConfiscationAction(owner, suspect)
		# Test that internal function properly updates state
		self.setVotedNay(voter, voter, suspect)
		self.assertEqual(self.userVote(voter), 2)
		self.assertEqual(self.voteTarget(voter), suspect)
		# If already voted, cannot set again
		self.assertReverts(self.setVotedNay, voter, voter, suspect)
		self.assertReverts(self.setVotedYea, voter, voter, suspect)

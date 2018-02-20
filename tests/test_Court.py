import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, fast_forward, force_mine_block, DUMMY, take_snapshot, restore_snapshot, fresh_account, fresh_accounts
from utils.testutils import assertReverts, assertClose
from utils.testutils import generate_topic_event_map, get_event_data_from_log


SOLIDITY_SOURCES =  ["tests/contracts/PublicCourt.sol", "contracts/EtherNomin.sol", "tests/contracts/PublicHavven.sol"]


def deploy_public_court():
	print("Deployment Initiated. \n")

	compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")
	court_abi = compiled['PublicCourt']['abi']
	nomin_abi = compiled['EtherNomin']['abi']

	havven_contract, havven_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [MASTER])
	nomin_contract, nomin_txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [havven_contract.address, MASTER, MASTER, 1000*UNIT, MASTER])
	court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt', MASTER, [havven_contract.address, nomin_contract.address, MASTER])

	txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}), nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
	attempt(mine_txs, [txs], "Linking contracts... ")

	print("\nDeployment complete.\n")
	return havven_contract, nomin_contract, court_contract, nomin_abi, court_abi


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
		cls.assertClose = assertClose

		cls.havven, cls.nomin, cls.court, cls.nomin_abi, cls.court_abi = deploy_public_court()

		# Event stuff
		cls.court_event_dict = generate_topic_event_map(cls.court_abi)
		cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

		# Inherited
		cls.owner = lambda self: self.court.functions.owner().call()

		# Non-public variables
		cls.getHavven = lambda self: self.court.functions._havven().call()
		cls.getNomin = lambda self: self.court.functions._nomin().call()
		cls.minStandingBalance = lambda self: self.court.functions.minStandingBalance().call()
		cls.votingPeriod = lambda self: self.court.functions.votingPeriod().call()
		cls.MIN_VOTING_PERIOD = lambda self: self.court.functions._MIN_VOTING_PERIOD().call()
		cls.MAX_VOTING_PERIOD = lambda self: self.court.functions._MAX_VOTING_PERIOD().call()
		cls.confirmationPeriod = lambda self: self.court.functions.confirmationPeriod().call()
		cls.MIN_CONFIRMATION_PERIOD = lambda self: self.court.functions._MIN_CONFIRMATION_PERIOD().call()
		cls.MAX_CONFIRMATION_PERIOD = lambda self: self.court.functions._MAX_CONFIRMATION_PERIOD().call()
		cls.requiredParticipation = lambda self: self.court.functions.requiredParticipation().call()
		cls.MIN_REQUIRED_PARTICIPATION = lambda self: self.court.functions._MIN_REQUIRED_PARTICIPATION().call()
		cls.requiredMajority = lambda self: self.court.functions.requiredMajority().call()
		cls.MIN_REQUIRED_MAJORITY = lambda self: self.court.functions._MIN_REQUIRED_MAJORITY().call()
		cls.voteWeight = lambda self, account, motionID: self.court.functions._voteWeight(account, motionID).call()
		cls.nextMotionID = lambda self: self.court.functions._nextMotionID().call()

		# Public variables
		cls.motionIDAddress = lambda self, index: self.court.functions.motionIDAddress(index).call()
		cls.addressMotionID = lambda self, address: self.court.functions.addressMotionID(address).call()
		cls.motionStartTime = lambda self, account: self.court.functions.motionStartTime(account).call()
		cls.votesFor = lambda self, account: self.court.functions.votesFor(account).call()
		cls.votesAgainst = lambda self, account: self.court.functions.votesAgainst(account).call()
		cls.vote = lambda self, account, motionID: self.court.functions.vote(account, motionID).call()

		# Inherited setter
		cls.setOwner = lambda self, sender, address: mine_tx(self.court.functions.setOwner(address).transact({'from': sender}))

		# Setters
		cls.setMinStandingBalance = lambda self, sender, balance: mine_tx(self.court.functions.setMinStandingBalance(balance).transact({'from' : sender}))
		cls.setVotingPeriod = lambda self, sender, duration: mine_tx(self.court.functions.setVotingPeriod(duration).transact({'from' : sender}))
		cls.setConfirmationPeriod = lambda self, sender, duration: mine_tx(self.court.functions.setConfirmationPeriod(duration).transact({'from' : sender}))
		cls.setRequiredParticipation = lambda self, sender, fraction: mine_tx(self.court.functions.setRequiredParticipation(fraction).transact({'from' : sender}))
		cls.setRequiredMajority = lambda self, sender, fraction: mine_tx(self.court.functions.setRequiredMajority(fraction).transact({'from' : sender}))

		# Views
		cls.hasVoted = lambda self, sender, motionID: self.court.functions.hasVoted(sender, motionID).call()
		cls.motionVoting = lambda self, target: self.court.functions.motionVoting(target).call()
		cls.motionConfirming = lambda self, target: self.court.functions.motionConfirming(target).call()
		cls.motionWaiting = lambda self, target: self.court.functions.motionWaiting(target).call()
		cls.motionPasses = lambda self, target: self.court.functions.motionPasses(target).call()

		# Mutators
		cls.beginConfiscationMotion = lambda self, sender, target: mine_tx(self.court.functions.beginConfiscationMotion(target).transact({'from' : sender}))
		cls.voteFor = lambda self, sender, target: mine_tx(self.court.functions.voteFor(target).transact({'from' : sender}))
		cls.voteAgainst = lambda self, sender, target: mine_tx(self.court.functions.voteAgainst(target).transact({'from' : sender}))
		cls.cancelVote = lambda self, sender, target: mine_tx(self.court.functions.cancelVote(target).transact({'from' : sender}))
		cls.closeMotion = lambda self, sender, target: mine_tx(self.court.functions.closeMotion(target).transact({'from' : sender}))

		# Owner only
		cls.approve = lambda self, sender, target: mine_tx(self.court.functions.approve(target).transact({'from' : sender}))
		cls.veto = lambda self, sender, target: mine_tx(self.court.functions.veto(target).transact({'from' : sender}))

		# Internal
		cls.setupVote = lambda self, sender, target: mine_tx(self.court.functions.publicSetupVote(target).transact({'from': sender}))

		# Havven getters
		cls.havvenSupply = lambda self: self.havven.functions.totalSupply().call()
		cls.havvenBalance = lambda self, account: self.havven.functions.balanceOf(account).call()
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

	# Extract vote index from a transaction receipt returned by a call to beginConfiscationMotion
	def get_motion_index(self, tx_receipt):
		event_data =  get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])
		self.assertEqual(event_data['event'], "MotionBegun")
		return event_data['args']['motionID']

	def test_constructor(self):
		self.assertEqual(self.owner(), MASTER)
		self.assertEqual(self.havven.address, self.getHavven())
		self.assertEqual(self.nomin.address, self.getNomin())
		self.assertEqual(self.minStandingBalance(), 100 * UNIT)
		self.assertEqual(self.votingPeriod(), 1 * self.weeks)
		self.assertEqual(self.MIN_VOTING_PERIOD(), 3 * self.days)
		self.assertEqual(self.MAX_VOTING_PERIOD(), 4 * self.weeks)
		self.assertEqual(self.confirmationPeriod(), 1 * self.weeks)
		self.assertEqual(self.MIN_CONFIRMATION_PERIOD(), 1 * self.days)
		self.assertEqual(self.MAX_CONFIRMATION_PERIOD(), 2 * self.weeks)
		self.assertEqual(self.requiredParticipation(), 3 * UNIT / 10)
		self.assertEqual(self.MIN_REQUIRED_PARTICIPATION(), UNIT / 10)
		self.assertEqual(self.requiredMajority(), (2 * UNIT) // 3)
		self.assertEqual(self.MIN_REQUIRED_MAJORITY(), UNIT / 2)

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
		# Voting period must be > than MIN_VOTING_PERIOD (~ currently 3 days).
		bad_voting_period = 3 * self.days - 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)
		# Voting period must be < than MAX_VOTING_PERIOD (~ currently 4 weeks).
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
		# Confirmation period must be > than MIN_CONFIRMATION_PERIOD (~ currently 1 days).
		bad_confirmation_period = 1 * self.days - 1
		self.assertReverts(self.setConfirmationPeriod, owner, bad_confirmation_period)
		# Confirmation period must be < than MAX_CONFIRMATION_PERIOD (~ 3 weeks).
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

	def test_waiting_voting_confirming_state_transitions(self):
		owner = self.owner()
		suspect = fresh_account()
		voting_period = self.votingPeriod()
		confirmation_period = self.confirmationPeriod()
		motion_id = self.nextMotionID()
		# Before a confiscation motion begins, should be in the waiting state.
		self.assertTrue(self.motionWaiting(motion_id))
		self.assertFalse(self.motionVoting(motion_id))
		self.assertFalse(self.motionConfirming(motion_id))
		# Begin a confiscation motion against the suspect, should move to the voting state.
		actual_motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))
		self.assertEqual(motion_id, actual_motion_id)
		self.assertFalse(self.motionWaiting(motion_id))
		self.assertTrue(self.motionVoting(motion_id))
		self.assertFalse(self.motionConfirming(motion_id))
		# Fast forward to the middle of the voting period, should still be in the voting state.
		fast_forward(voting_period / 2)
		self.assertFalse(self.motionWaiting(motion_id))
		self.assertTrue(self.motionVoting(motion_id))
		self.assertFalse(self.motionConfirming(motion_id))
		# When the voting period finishes, should move to confirming state.
		fast_forward(voting_period / 2)
		self.assertFalse(self.motionWaiting(motion_id))
		self.assertFalse(self.motionVoting(motion_id))
		self.assertTrue(self.motionConfirming(motion_id))
		# Fast forward to the middle of the confirmation period, should still be in the confirming state.
		fast_forward(confirmation_period / 2)
		self.assertFalse(self.motionWaiting(motion_id))
		self.assertFalse(self.motionVoting(motion_id))
		self.assertTrue(self.motionConfirming(motion_id))
		# When the voting confirmation period finishes, should move to waiting state.
		fast_forward(confirmation_period / 2)
		self.assertTrue(self.motionWaiting(motion_id))
		self.assertFalse(self.motionVoting(motion_id))
		self.assertFalse(self.motionConfirming(motion_id))

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
		# This should fail because no confiscation motion has begun.
		next_motion_id = self.nextMotionID()
		self.assertFalse(self.hasVoted(voter, next_motion_id))
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))
		self.assertEqual(motion_id, next_motion_id)
		# This should return false because the voter has not voted yet.
		self.assertFalse(self.hasVoted(voter, motion_id))
		self.voteFor(voter, motion_id)	
		# This should return true because the voter has voted.
		self.assertTrue(self.hasVoted(voter, motion_id))
		# And false when they cancel their vote.
		self.cancelVote(voter, motion_id)	
		self.assertFalse(self.hasVoted(voter, motion_id))
		# And true again if they vote against.
		self.voteFor(voter, motion_id)	
		self.assertTrue(self.hasVoted(voter, motion_id))

	def test_motionPasses(self):
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
		# Begin a confiscation motion against the suspect.
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))
		self.assertFalse(self.motionPasses(motion_id))
		# 100% in favour and 0% against (50% participation).
		for voter in voters:
			self.voteFor(voter, motion_id)
		self.assertTrue(self.motionPasses(motion_id))
		self.assertEqual(self.votesFor(motion_id), self.havvenSupply() // 2)
		# All cancel votes.
		for voter in voters:
			self.cancelVote(voter, motion_id)
		self.assertFalse(self.motionPasses(motion_id))
		self.assertEqual(self.votesFor(motion_id), 0)
		# 100% against and 0% in favour (50% participation).
		for voter in voters:
			self.voteAgainst(voter, motion_id)
		self.assertFalse(self.motionPasses(motion_id))
		self.assertEqual(self.votesAgainst(motion_id), self.havvenSupply() // 2)
		# All cancel votes.
		for voter in voters:
			self.cancelVote(voter, motion_id)
		self.assertEqual(self.votesAgainst(motion_id), 0)
		# 60% in favour and 0% against (30% participation)
		for voter in voters[:6]:
			self.voteFor(voter, motion_id)
		# Required participation must be > than 30%.
		self.assertFalse(self.motionPasses(motion_id))
		# But if another user votes in favour, participation = 35% which is sufficient for a vote to pass.
		self.voteFor(voters[7], motion_id)
		self.assertTrue(self.motionPasses(motion_id))
		# The last 3 vote against, 70% in favour and 30% against (required majority is 2/3).
		for voter in voters[8:]:
			self.voteAgainst(voter, motion_id)
		self.assertTrue(self.motionPasses(motion_id))
		# If one changes their vote for to against, should not pass since 60% in favour 40% against (less than the min required majority of 2/3).
		self.cancelVote(voters[7], motion_id)
		self.voteAgainst(voters[7], motion_id)
		self.assertFalse(self.motionPasses(motion_id))

	def test_beginConfiscationMotion(self):
		owner = self.owner()
		accounts = fresh_accounts(5)
		insufficient_standing = accounts[0]
		sufficient_standing = accounts[1]
		voter = accounts[2]
		suspects = accounts[3:]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2
		# Give 50% of the havven tokens to voter, enough to pass a confiscation motion on their own.
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
		# Must have at least 100 havvens to begin a confiscation motion.
		self.assertReverts(self.beginConfiscationMotion, insufficient_standing, suspects[0])
		tx_receipt = self.beginConfiscationMotion(sufficient_standing, suspects[0])
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionBegun")
		motion_id_0 = self.get_motion_index(tx_receipt)
		self.assertTrue(self.motionVoting(motion_id_0))
		# The contract owner can also begin a motion, regardless of the token requirement.
		motion_id_1 = self.get_motion_index(self.beginConfiscationMotion(owner, suspects[1]))
		# Cannot open multiple confiscation motions on one suspect.
		self.assertReverts(self.beginConfiscationMotion, owner, suspects[0])
		self.voteFor(voter, motion_id_0)
		fast_forward(voting_period)
		self.approve(owner, motion_id_0)
		self.assertTrue(self.nominIsFrozen(suspects[0]))
		# Cannot open a vote on an account that has already been frozen.
		self.assertReverts(self.beginConfiscationMotion, owner, suspects[0])

	def test_setupVote(self):
		owner = self.owner()
		non_voter, voter, suspect = fresh_accounts(3)
		voter_weight = 50 * UNIT

		# Give the voter some voting weight.
		self.havvenEndow(owner, voter, voter_weight)
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)

		# Start the vote itself
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))

		# Zero-weight voters should not be able to cast votes.
		self.assertEqual(self.voteWeight(non_voter, motion_id), 0)
		self.assertReverts(self.setupVote, non_voter, motion_id)

		# Test that internal function properly updates state
		self.assertEqual(self.voteWeight(voter, motion_id), 0)
		self.assertEqual(self.vote(voter, motion_id), 0)
		self.assertTrue(self.motionVoting(motion_id))
		self.assertFalse(self.hasVoted(voter, motion_id))
		tx_receipt = self.setupVote(voter, motion_id)
		# Additionally ensure that the vote recomputed the voter's fee totals.
		self.assertClose(self.havvenLastAverageBalance(voter), voter_weight)
		self.assertClose(self.havvenPenultimateAverageBalance(voter), voter_weight)
		self.assertClose(self.voteWeight(voter, motion_id), voter_weight)
		self.assertClose(int(tx_receipt.logs[0].data, 16), voter_weight)

		# If already voted, cannot setup again
		self.voteFor(voter, motion_id)
		self.assertReverts(self.setupVote, voter, motion_id)

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

		# Cannot vote unless there is a confiscation motion.
		self.assertReverts(self.voteFor, voter, 10)

		# Fast forward to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)

		# Begin a confiscation motion against the suspect.
		motion_id_0 = self.get_motion_index(self.beginConfiscationMotion(owner, suspects[0]))
		self.assertTrue(self.motionVoting(motion_id_0))

		# Cast a vote in favour of confiscation.
		tx_receipt = self.voteFor(voter, motion_id_0)

		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteFor")

		# And that the totals have been updated properly.
		self.assertEqual(self.votesFor(motion_id_0), 1000)
		self.assertEqual(self.voteWeight(voter, motion_id_0), 1000)
		self.assertEqual(self.vote(voter, motion_id_0), 1)

		# It should not be possible to cast a repeat vote without cancelling first.
		self.assertReverts(self.voteFor, voter, motion_id_0)
		self.assertReverts(self.voteAgainst, voter, motion_id_0)

		# It should not be possible to vote without any vote weight.
		self.assertReverts(self.voteFor, no_tokens, motion_id_0)

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

		# Cannot vote unless there is a confiscation motion.
		self.assertReverts(self.voteAgainst, voter, 10)

		# Fast forward two fee periods to update the voter's weight.
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)

		# Begin a confiscation motion against the suspect.
		motion_id_0 = self.get_motion_index(self.beginConfiscationMotion(owner, suspects[0]))
		self.assertTrue(self.motionVoting(motion_id_0))

		# Cast a vote against confiscation.
		tx_receipt = self.voteAgainst(voter, motion_id_0)

		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteAgainst")

		# And that the totals have been updated properly.
		self.assertEqual(self.votesAgainst(motion_id_0), 1000)
		self.assertEqual(self.voteWeight(voter, motion_id_0), 1000)
		self.assertEqual(self.vote(voter, motion_id_0), 2)

		# It should not be possible to cast a repeat vote without cancelling first.
		self.assertReverts(self.voteFor, voter, motion_id_0)
		self.assertReverts(self.voteAgainst, voter, motion_id_0)

		# It should not be possible to vote without any vote weight.
		self.assertReverts(self.voteAgainst, no_tokens, motion_id_0)	

	def test_cancelVote(self):
		owner = self.owner()
		voter, voter2, suspect = fresh_accounts(3)
		voting_period = self.votingPeriod()
		confirmation_period = self.confirmationPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()

		# Give some havven tokens to our voter.
		self.havvenEndow(owner, voter, 1000)
		self.havvenEndow(owner, voter2, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))

		# Begin a confiscation motion against the suspect.
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))

		# Cast a vote in favour of confiscation.
		self.voteFor(voter, motion_id)
		self.assertEqual(self.votesFor(motion_id), 1000)
		tx_receipt  = self.cancelVote(voter, motion_id)

		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteCancelled")
		self.assertEqual(self.votesFor(motion_id), 0)
		self.assertEqual(self.vote(voter, motion_id), 0)

		# Cast a vote against confiscation.
		self.voteAgainst(voter, motion_id)
		self.assertEqual(self.votesAgainst(motion_id), 1000)
		self.cancelVote(voter, motion_id)
		self.assertEqual(self.votesAgainst(motion_id), 0)
		self.assertEqual(self.vote(voter, motion_id), 0)
		self.assertEqual(self.voteWeight(voter, motion_id), 0)

		# We should be able to re-vote after cancelling, both for and against.
		self.voteFor(voter2, motion_id)
		self.cancelVote(voter2, motion_id)
		self.voteAgainst(voter2, motion_id)
		self.cancelVote(voter2, motion_id)
		self.voteFor(voter2, motion_id)

		# Cannot cancel a vote during the confirmation period.
		self.voteFor(voter, motion_id)
		self.assertEqual(self.vote(voter2, motion_id), 1)
		fast_forward(voting_period)
		self.assertReverts(self.cancelVote, voter, motion_id)
		self.assertEqual(self.vote(voter, motion_id), 1)

		# Can cancel it after the confirmation period.
		fast_forward(confirmation_period)
		self.cancelVote(voter, motion_id)
		self.assertEqual(self.vote(voter, motion_id), 0)
		self.assertEqual(self.voteWeight(voter, motion_id), 0)

		# And after the vote has been closed.
		self.closeMotion(voter2, motion_id)
		self.cancelVote(voter2, motion_id)
		self.assertEqual(self.vote(voter2, motion_id), 0)
		self.assertEqual(self.voteWeight(voter2, motion_id), 0)

	def test_closeMotion(self):
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
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))
		# Should not be able to close vote in the voting period.
		self.assertReverts(self.closeMotion, voter, motion_id)
		fast_forward(voting_period)
		self.assertTrue(self.motionConfirming(motion_id))
		tx_receipt = self.closeMotion(voter, motion_id)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionClosed")
		# Start another confiscation motion.
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, suspect))
		self.voteFor(voter, motion_id)
		fast_forward(voting_period)
		# After vote has closed, voteStarTimes and votesFor/votesAgainst should be 0 and suspect should be waiting.
		self.closeMotion(voter, motion_id)	
		self.assertEqual(self.votesFor(motion_id), 0)
		self.assertEqual(self.motionStartTime(motion_id), 0)
		self.assertTrue(self.motionWaiting(motion_id))

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
		tx_receipt = self.beginConfiscationMotion(owner, guilty)
		motion_id = self.get_motion_index(tx_receipt)
		# Cast a vote in favour of confiscation.
		tx_receipt = self.voteFor(voter, motion_id)
		# It should not be possible to approve in the voting state.
		self.assertReverts(self.approve, owner, motion_id)
		fast_forward(voting_period)
		self.assertTrue(self.motionConfirming(motion_id))
		# Only the owner can approve the confiscation of a balance.
		self.assertReverts(self.approve, voter, motion_id)
		tx_receipt = self.approve(owner, motion_id)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])['event'], "Confiscation")
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "MotionClosed")
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[2])['event'], "MotionApproved")
		self.assertEqual(self.motionStartTime(motion_id), 0)
		self.assertEqual(self.votesFor(motion_id), 0)
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
		self.assertReverts(self.veto, owner, 10)
		motion_id = self.get_motion_index(self.beginConfiscationMotion(owner, acquitted))
		# Only owner can veto.
		self.assertReverts(self.veto, DUMMY, motion_id)
		self.veto(owner, motion_id)
		# After veto motion, suspect should be back in the waiting stage.
		self.assertTrue(self.motionWaiting(motion_id))
		motion_id_2 = self.get_motion_index(self.beginConfiscationMotion(owner, acquitted))
		self.assertNotEqual(motion_id, motion_id_2)
		self.voteFor(voter, motion_id_2)
		self.assertTrue(self.motionPasses(motion_id_2))
		fast_forward(voting_period)
		self.assertTrue(self.motionConfirming(motion_id_2))
		# Once a vote has been passed, the owner can veto it.
		tx_receipt = self.veto(owner, motion_id_2)
		# Check that event is emitted properly.
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionClosed")
		self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "MotionVetoed")
		# After veto motion, suspect should be back in the waiting stage.
		self.assertTrue(self.motionWaiting(motion_id))
		self.assertTrue(self.motionWaiting(motion_id_2))
		# Votes should be reset.
		self.assertEqual(self.motionStartTime(motion_id), 0)
		self.assertEqual(self.votesFor(motion_id), 0)
		self.assertEqual(self.votesAgainst(motion_id), 0)
		self.assertTrue(self.motionWaiting(motion_id))
		self.assertEqual(self.motionStartTime(motion_id_2), 0)
		self.assertEqual(self.votesFor(motion_id_2), 0)
		self.assertEqual(self.votesAgainst(motion_id_2), 0)
		self.assertTrue(self.motionWaiting(motion_id_2))

	def test_multi_vote(self):
		owner = self.owner()
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2

		voter = fresh_account()
		targets = fresh_accounts(10)

		# Vote types to run simultaneously:
		# Generate a bunch of voters
		# pass (unanimous)
		# pass (majority)
		# pass (bare)
		# fail (insufficient participation)
		# fail (zero participation)
		# fail (insufficient majority)
		# fail (zero majority)
		# fail (timeout)
		# fail (veto during proceedings)
		# fail (veto during confirmation)

		self.havvenEndow(owner, voter, controlling_share)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenCheckFeePeriodRollover(DUMMY)
		
		# Open a bunch of confiscation motions...
		motion_ids = [self.get_motion_index(self.beginConfiscationMotion(owner, targets[i])) for i in range(len(targets))]

		# Vote in all...
		for motion_id in motion_ids:
			self.voteFor(voter, motion_id)
			self.assertTrue(self.motionVoting(motion_id))

		# And pass them all...
		fast_forward(voting_period)
		for motion_id in motion_ids:
			self.assertTrue(self.motionConfirming(motion_id))
			self.approve(owner, motion_id)
			self.assertTrue(self.motionWaiting(motion_id))

		for target in targets:
			self.assertTrue(self.nominIsFrozen(target))

	def test_re_open_exploit(self):
		pass



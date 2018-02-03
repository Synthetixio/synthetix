import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, fast_forward, force_mine_block, DUMMY, take_snapshot, restore_snapshot, fresh_account, fresh_accounts
from utils.testutils import assertReverts, assertCallReverts

SOLIDITY_SOURCES =  ["tests/contracts/PublicCourt.sol", "contracts/EtherNomin.sol", "tests/contracts/PublicHavven.sol"]

def deploy_public_court():
	print("Deployment Initiated. \n")

	compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")

	havven_contract, havven_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [MASTER])
	nomin_contract, nomin_txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [havven_contract.address, MASTER, MASTER, 1000*UNIT, MASTER])
	court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt', MASTER, [havven_contract.address, nomin_contract.address, MASTER])

	txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}), nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
	attempt(mine_txs, [txs], "Linking contracts... ")

	print("\nDeployment complete.\n")
	return havven_contract, nomin_contract, court_contract

def setUpModule():
    print("Testing Court...")

def tearDownModule():
    print()

class TestCourt(unittest.TestCase):
	def setUp(self):
		self.snapshot = take_snapshot()
		owner = self.owner()

	def tearDown(self):
		restore_snapshot(self.snapshot)
	"""
	Test the Court contract
	"""
	@classmethod
	def setUpClass(cls):
		cls.assertReverts = assertReverts

		cls.havven, cls.nomin, cls.court = deploy_public_court()

		# Inherited
		cls.owner = lambda self: self.court.functions.owner().call()

		# Non-public variables
		cls.minStandingBalance = lambda self: self.court.functions._minStandingBalance().call()
		cls.votingPeriod = lambda self: self.court.functions._votingPeriod().call()
		cls.minVotingPeriod = lambda self: self.court.functions._minVotingPeriod().call()
		cls.maxVotingPeriod = lambda self: self.court.functions._maxVotingPeriod().call()
		cls.confirmationPeriod = lambda self: self.court.functions._confirmationPeriod().call()
		cls.minConfirmationPeriod = lambda self: self.court.functions._minConfirmationPeriod().call()
		cls.maxConfirmationPeriod = lambda self: self.court.functions._maxConfirmationPeriod().call()
		cls.requiredParticipation = lambda self: self.court.functions._requiredParticipation().call()
		cls.minRequiredParticipation = lambda self: self.court.functions._minRequiredParticipation().call()
		cls.requiredMajority = lambda self: self.court.functions._requiredMajority().call()
		cls.minRequiredMajority = lambda self: self.court.functions._minRequiredMajority().call()
		cls.voteWeight = lambda self: self.court.functions.voteWeight().call()

		# Public variables
		cls.voteStartTimes = lambda self: self.court.functions.voteStartTimes().call()
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

		# Havven getters
		cls.havvenSupply = lambda self: self.havven.functions.totalSupply().call()
		cls.havvenBalance = lambda self, account: self.havven.functions.balanceOf(account).call()
		cls.havvenHasVoted = lambda self, account: self.havven.functions.hasVoted(account).call()
		cls.havvenTargetFeePeriodDurationSeconds = lambda self : self.havven.functions.targetFeePeriodDurationSeconds().call()
		cls.havvenPenultimateAverageBalance = lambda self, addr: self.havven.functions.penultimateAverageBalance(addr).call()
		cls.havvenLastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()

		# Havven txs
		cls.havvenEndow = lambda self, sender, account, value: mine_tx(self.havven.functions.endow(account, value).transact({'from' : sender}))
		cls.havvenTransfer = lambda self, sender, to, value: mine_tx(self.havven.functions.transfer(to, value).transact({'from' : sender}))
		cls.havvenPostCheckFeePeriodRollover = lambda self, sender: mine_tx(self.havven.functions._postCheckFeePeriodRollover().transact({'from': sender}))
		cls.havvenAdjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
		cls.havvenSetTargetFeePeriodDuration = lambda self, sender, duration: mine_tx(self.havven.functions.setTargetFeePeriodDuration(duration).transact({'from' : sender}))

		# Nomin methods
		cls.nominIsFrozen = lambda self, account: self.nomin.functions.isFrozen(account).call()

		# Solidity convenience
		cls.days = 86400
		cls.weeks = 604800
		cls.months = 2628000


	def test_constructor(self):
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


	def test_getSetOwner(self):
		owner = MASTER
		# Only owner can setOwner
		self.assertReverts(self.setOwner, DUMMY, DUMMY)
		self.setOwner(owner, DUMMY)
		self.assertEqual(self.owner(), DUMMY)


	def test_getSetMinStandingBalance(self):
		owner = MASTER
		new_min_standing_balance = 200 * UNIT
		# Only owner can set minStandingBalance
		self.assertReverts(self.setMinStandingBalance, DUMMY, new_min_standing_balance)
		self.setMinStandingBalance(owner, new_min_standing_balance)
		self.assertEqual(self.minStandingBalance(), new_min_standing_balance)


	def test_getSetVotingPeriod(self):
		owner = MASTER
		new_voting_period = 2 * self.weeks
		# Only owner can set votingPeriod
		self.assertReverts(self.setVotingPeriod, DUMMY, new_voting_period)
		self.setVotingPeriod(owner, new_voting_period)
		self.assertEqual(self.votingPeriod(), new_voting_period)
		# Voting period must be > than minVotingPeriod (~ currently 3 days)
		bad_voting_period = 3 * self.days - 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)
		# Voting period must be < than maxVotingPeriod (~ currently 4 weeks)
		bad_voting_period = 4 * self.weeks + 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)
		# Voting period must be <= the havven target fee period duration
		fee_period_duration = 2 * self.weeks
		self.havvenSetTargetFeePeriodDuration(owner, fee_period_duration)
		self.assertEqual(self.havvenTargetFeePeriodDurationSeconds(), fee_period_duration)
		# Voting period must be < fee period duration.
		bad_voting_period = 2 * self.weeks + 1
		self.assertReverts(self.setVotingPeriod, owner, bad_voting_period)


	def test_getSetConfirmationPeriod(self):
		owner = MASTER
		new_confirmation_period = 2 * self.weeks
		# Only owner can set confirmationPeriod
		self.assertReverts(self.setConfirmationPeriod, DUMMY, new_confirmation_period)
		self.setConfirmationPeriod(owner, new_confirmation_period)
		self.assertEqual(self.confirmationPeriod(), new_confirmation_period)
		# Confirmation period must be > than minConfirmationPeriod (~ currently 1 days)
		bad_confirmation_period = 1 * self.days - 1
		self.assertReverts(self.setConfirmationPeriod, owner, bad_confirmation_period)
		# Confirmation period must be < than maxConfirmationPeriod (~ 3 weeks)
		bad_confirmation_period = 3 * self.weeks + 1
		self.assertReverts(self.setConfirmationPeriod, owner, bad_confirmation_period)


	def test_getSetRequiredParticipation(self):
		owner = MASTER
		new_required_participation = 5 * UNIT // 10
		# Only owner can set requiredParticipation
		self.assertReverts(self.setRequiredParticipation, DUMMY, new_required_participation)
		self.setRequiredParticipation(owner, new_required_participation)
		self.assertEqual(self.requiredParticipation(), new_required_participation)
		# Required participation must be >= than 10%
		bad_required_participation = UNIT // 10 - 1
		self.assertReverts(self.setRequiredParticipation, owner, bad_required_participation)


	def test_getSetRequiredMajority(self):
		owner = MASTER
		new_required_majority = (3 * UNIT) // 4 
		# Only owner can set requiredMajority
		self.assertReverts(self.setRequiredMajority, DUMMY, new_required_majority)
		self.setRequiredMajority(owner, new_required_majority)
		self.assertEqual(self.requiredMajority(), new_required_majority)
		# Required majority must be >= than 50%
		bad_required_majority = UNIT // 2 - 1
		self.assertReverts(self.setRequiredMajority, owner, bad_required_majority)


	def test_hasVoted(self):
		owner = MASTER
		voter = fresh_account()
		suspect = fresh_account()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Fast forward to update the vote weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# This should fail because no confiscation action has begun.
		self.assertFalse(self.hasVoted(voter))
		self.beginConfiscationAction(owner, suspect)
		# This should fail because the voter has not voted yet
		self.assertFalse(self.hasVoted(voter))
		self.voteFor(voter, suspect)	
		self.assertTrue(self.hasVoted(voter))


	def test_waiting_voting_confirming_state_transitions(self):
		owner = MASTER
		suspect = fresh_account()
		voting_period = self.votingPeriod()
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


	def test_votePasses(self):
		owner = MASTER
		suspect = fresh_account()
		voters = fresh_accounts(10)
		required_participation = self.requiredParticipation()
		required_majority = self.requiredMajority()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		tokens = self.havvenSupply() // 20
		# Give tokens to our voters
		for voter in voters:
			self.havvenEndow(owner, voter, tokens)
			self.assertEqual(self.havvenBalance(voter), tokens)
		# Fast forward to update the vote weights
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		# Begin a confiscation action against the suspect.
		self.beginConfiscationAction(owner, suspect)
		self.assertFalse(self.votePasses(suspect))
		self.assertTrue(self.voting(suspect))
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		# All vote in favour of confiscation
		for voter in voters:
			self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
			self.voteFor(voter, suspect)
		self.assertTrue(self.votePasses(suspect))
		# Cancel votes
		for voter in voters:
			self.cancelVote(voter, suspect)
		self.assertFalse(self.votePasses(suspect))
		# All vote against confiscation
		for voter in voters:
			self.voteAgainst(voter, suspect)
		self.assertFalse(self.votePasses(suspect))
		# Cancel votes
		for voter in voters:
			self.cancelVote(voter, suspect)
		# 30% of havven tokens vote for confiscation
		for voter in voters[:6]:
			self.voteFor(voter, suspect)
		# Required participation must be > than 30%
		self.assertFalse(self.votePasses(suspect))
		# But if another user votes, participation = 35% which is sufficient.
		self.voteFor(voters[7], suspect)
		self.assertTrue(self.votePasses(suspect))
		# The last 3 vote against, 70% for vs 30% against (required majority is 2/3)
		for voter in voters[8:]:
			self.voteAgainst(voter, suspect)
		self.assertTrue(self.votePasses(suspect))
		# If one changes their vote for to against, should not pass since it will be 60 vs 40
		self.cancelVote(voters[7], suspect)
		self.voteAgainst(voters[7], suspect)
		self.assertFalse(self.votePasses(suspect))

	def test_beginConfiscationAction(self):
		owner = MASTER
		insufficient_standing = fresh_account()
		sufficient_standing =  fresh_account()
		suspect = fresh_account()
		self.havvenEndow(owner, insufficient_standing, 99 * UNIT)
		self.havvenEndow(owner, sufficient_standing, 100 * UNIT)
		# Must have at least 100 havvens to begin a confiscsation action
		self.assertReverts(self.beginConfiscationAction, insufficient_standing, suspect)
		self.beginConfiscationAction(sufficient_standing, suspect)
		self.assertTrue(self.voting(suspect))
		# Cannot open multiple confiscation actions on one suspect.
		self.assertReverts(self.beginConfiscationAction, owner, suspect)
		# Cannot open a vote on an account that has already been frozen.
		# TODO


	def test_voteFor(self):
		owner = MASTER
		voter = fresh_account()
		suspect = fresh_account()
		other_suspect = fresh_account()
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Cannot vote unless there is a confiscation action
		self.assertReverts(self.voteFor, voter, suspect)
		# Fast forward to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect
		self.beginConfiscationAction(owner, suspect)
		self.assertTrue(self.voting(suspect))
		# Cast a vote in favour of confiscation
		self.voteFor(voter, suspect)
		self.assertEqual(self.votesFor(suspect), 1000)
		# Another confiscation action is opened, our voter should not be able to vote in more than one action at a time.
		self.beginConfiscationAction(owner, other_suspect)
		self.assertReverts(self.voteFor, voter, other_suspect)


	def test_voteAgainst(self):
		owner = MASTER
		voter = fresh_account()
		suspect = fresh_account()
		other_suspect = fresh_account()
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		# Cannot vote unless there is a confiscation action
		self.assertReverts(self.voteAgainst, voter, suspect)
		# Fast forward two fee periods to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect
		self.beginConfiscationAction(owner, suspect)
		self.assertTrue(self.voting(suspect))
		# Cast a vote against confiscation
		self.voteAgainst(voter, suspect)
		self.assertEqual(self.votesAgainst(suspect), 1000)
		# Another confiscation action is opened, our voter should not be able to vote in more than one action at a time.
		self.beginConfiscationAction(owner, other_suspect)
		self.assertReverts(self.voteAgainst, voter, other_suspect)


	def test_cancelVote(self):
		owner = MASTER
		voter = fresh_account()
		suspect = fresh_account()
		other_suspect = fresh_account()
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)
		fast_forward(fee_period + 1)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		# Begin a confiscation action against the suspect
		self.beginConfiscationAction(owner, suspect)
		# Cast a vote in favour of confiscation
		self.voteFor(voter, suspect)
		self.assertEqual(self.votesFor(suspect), 1000)
		self.cancelVote(voter, suspect)
		self.assertEqual(self.votesFor(suspect), 0)


	# def test_closeVote(self):
	# TODO


	def test_approve(self):
		owner = MASTER
		voter = fresh_account()
		guilty = fresh_account()
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()
		controlling_share = self.havvenSupply() // 2
		# Give havven tokens to our voter and begin a confiscation action against the suspect
		self.havvenEndow(owner, voter, controlling_share)
		# Fast forward two fee periods to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))
		self.beginConfiscationAction(owner, guilty)
		self.assertTrue(self.voting(guilty))
		# Cast a vote in favour of confiscation
		self.voteFor(voter, guilty)
		self.assertEqual(self.votesFor(guilty), controlling_share)
		fast_forward(voting_period)
		self.assertTrue(self.confirming(guilty))
		self.assertReverts(self.approve, voter, guilty)
		self.approve(owner, guilty)
		self.assertTrue(self.nominIsFrozen(guilty))


	def test_veto(self):
		owner = MASTER
		acquitted = fresh_account()
		# Cannot veto when there is no vote in progress
		self.assertReverts(self.veto, owner, acquitted)
		self.beginConfiscationAction(owner, acquitted)
		# Only owner can veto
		self.assertReverts(self.veto, DUMMY, acquitted)
		self.veto(owner, acquitted)
		# After veto action, suspect should be back in the waiting stage
		self.assertTrue(self.waiting(acquitted))
		# TODO - test veto() after a vote passes.


	# def test_setVotedYea()
	# TODO

	# def test_setVotedNay()
	# TODO
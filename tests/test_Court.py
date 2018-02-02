import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, fast_forward, force_mine_block, DUMMY, take_snapshot, restore_snapshot
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

	def tearDown(self):
		restore_snapshot(self.snapshot)
	"""
	Test the Court contract
	"""
	@classmethod
	def setUpClass(cls):
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

		# Inherited setter
		cls.setOwner = lambda self, sender, address: self.court.functions.setOwner(address).transact({'from': sender})

		# Setters
		cls.setMinStandingBalance = lambda self, sender, balance: self.court.functions.setMinStandingBalance(balance).transact({'from' : sender})
		cls.setVotingPeriod = lambda self, sender, duration: self.court.functions.setVotingPeriod(duration).transact({'from' : sender})
		cls.setConfirmationPeriod = lambda self, sender, duration: self.court.functions.setConfirmationPeriod(duration).transact({'from' : sender})
		cls.setRequiredParticipation = lambda self, sender, fraction: self.court.functions.setRequiredParticipation(fraction).transact({'from' : sender})
		cls.setRequiredMajority = lambda self, sender, fraction: self.court.functions.setRequiredMajority(fraction).transact({'from' : sender})

		# Views
		cls.hasVoted = lambda self, sender: self.court.functions.hasVoted(sender).call()
		cls.voting = lambda self, target: self.court.functions.voting(target).call()
		cls.confirming = lambda self, target: self.court.functions.confirming(target).call()
		cls.waiting = lambda self, target: self.court.functions.waiting(target).call()
		cls.votePasses = lambda self, target: self.court.functions.votePasses(target).call()

		# Mutators
		cls.beginConfiscationAction = lambda self, sender, target: self.court.functions.beginConfiscationAction(target).transact({'from' : sender})
		cls.voteFor = lambda self, sender, target: self.court.functions.voteFor(target).transact({'from' : sender})
		cls.voteAgainst = lambda self, sender, target: self.court.functions.voteAgainst(target).transact({'from' : sender})
		cls.cancelVote = lambda self, sender, target: self.court.functions.cancelVote(target).transact({'from' : sender})
		cls.closeVote = lambda self, sender, target: self.court.functions.closeVote(target).transact({'from' : sender})

		# Owner only
		cls.approve = lambda self, sender, target: self.court.functions.approve(target).transact({'from' : sender})
		cls.veto = lambda self, sender, target: self.court.functions.veto(target).transact({'from' : sender})

		# Havven methods
		cls.havvenSupply = lambda self: self.havven.functions.totalSupply().call()
		cls.havvenBalance = lambda self, account: self.havven.functions.balanceOf(account).call()
		cls.havvenEndow = lambda self, sender, account, value: self.havven.functions.endow(account, value).transact({'from' : sender})
		cls.havvenTransfer = lambda self, sender, to, value: self.havven.functions.transfer(to, value).transact({'from' : sender})
		cls.havvenHasVoted = lambda self, account: self.havven.functions.hasVoted(account).call()
		cls.havvenTargetFeePeriodDurationSeconds = lambda self : self.havven.functions.targetFeePeriodDurationSeconds().call()
		cls.havvenPostCheckFeePeriodRollover = lambda self, sender: mine_tx(self.havven.functions._postCheckFeePeriodRollover().transact({'from': sender}))
		cls.havvenAdjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
		cls.havvenPenultimateAverageBalance = lambda self, addr: self.havven.functions.penultimateAverageBalance(addr).call()
		cls.havvenLastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()
		cls.havvenSetTargetFeePeriodDuration = lambda self, sender, duration: self.havven.functions.setTargetFeePeriodDuration(duration).transact({'from' : sender})

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
		assertReverts(self, self.setOwner, [DUMMY, DUMMY])

		mine_tx(self.setOwner(owner, DUMMY))
		self.assertEqual(self.owner(), DUMMY)

	def test_getSetMinStandingBalance(self):
		owner = MASTER
		new_min_standing_balance = 200 * UNIT
		# Only owner can set minStandingBalance
		assertReverts(self, self.setMinStandingBalance, [DUMMY, new_min_standing_balance])

		mine_tx(self.setMinStandingBalance(owner, new_min_standing_balance))
		self.assertEqual(self.minStandingBalance(), new_min_standing_balance)

	def test_getSetVotingPeriod(self):
		owner = MASTER
		new_voting_period = 2 * self.weeks
		# Only owner can set votingPeriod
		assertReverts(self, self.setVotingPeriod, [DUMMY, new_voting_period])

		mine_tx(self.setVotingPeriod(owner, new_voting_period))
		self.assertEqual(self.votingPeriod(), new_voting_period)

		# Voting period must be > than minVotingPeriod (~ currently 3 days)
		bad_voting_period = 3 * self.days - 1
		assertReverts(self, self.setVotingPeriod, [owner, bad_voting_period])

		# Voting period must be < than maxVotingPeriod (~ currently 4 weeks)
		bad_voting_period = 4 * self.weeks + 1
		assertReverts(self, self.setVotingPeriod, [owner, bad_voting_period])

		# Voting period must be <= the havven target fee period duration
		fee_period_duration = 2 * self.weeks
		mine_tx(self.havvenSetTargetFeePeriodDuration(owner, fee_period_duration))
		self.assertEqual(self.havvenTargetFeePeriodDurationSeconds(), fee_period_duration)

		# This should fail because even though it is within min and max voting periods, it is greater than the fee period duration.
		bad_voting_period = 2 * self.weeks + 1
		assertReverts(self, self.setVotingPeriod, [owner, bad_voting_period])

	def test_getSetConfirmationPeriod(self):
		owner = MASTER
		new_confirmation_period = 2 * self.weeks
		# Only the owner can set confirmationPeriod
		assertReverts(self, self.setConfirmationPeriod, [DUMMY, new_confirmation_period])

		mine_tx(self.setConfirmationPeriod(owner, new_confirmation_period))
		self.assertEqual(self.confirmationPeriod(), new_confirmation_period)

		# Confirmation period must be greater than 1 day
		bad_confirmation_period = 1 * self.days - 1
		assertReverts(self, self.setConfirmationPeriod, [owner, bad_confirmation_period])

		# Confirmation period must be less than 2 weeks
		bad_confirmation_period = 3 * self.weeks + 1
		assertReverts(self, self.setConfirmationPeriod, [owner, bad_confirmation_period])

	def test_getSetRequiredParticipation(self):
		owner = MASTER
		new_required_participation = 5 * UNIT // 10
		# Only owner can set requiredParticipation
		assertReverts(self, self.setRequiredParticipation, [DUMMY, new_required_participation])

		mine_tx(self.setRequiredParticipation(owner, new_required_participation))
		self.assertEqual(self.requiredParticipation(), new_required_participation)

		# Required participation must not be lower than 10%
		bad_required_participation = UNIT // 10 - 1
		assertReverts(self, self.setRequiredParticipation, [owner, bad_required_participation])

	def test_getSetRequiredMajority(self):
		owner = MASTER
		new_required_majority = (3 * UNIT) // 4 
		# Only owner can set requiredMajority
		assertReverts(self, self.setRequiredMajority, [DUMMY, new_required_majority])

		mine_tx(self.setRequiredMajority(owner, new_required_majority))
		self.assertEqual(self.requiredMajority(), new_required_majority)

		# Required majority must be no lower than 50%
		bad_required_majority = UNIT // 2 - 1
		assertReverts(self, self.setRequiredMajority, [owner, bad_required_majority])

	def test_hasVoted(self):
		owner = MASTER
		voter = W3.eth.accounts[1]
		suspect = W3.eth.accounts[2]
		fee_period = self.havvenTargetFeePeriodDurationSeconds()

		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)

		fast_forward(fee_period * 2)
		self.havvenPostCheckFeePeriodRollover(DUMMY)

		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))

		# This should fail because no confiscation action has begun.
		self.assertFalse(self.hasVoted(voter))

		mine_tx(self.beginConfiscationAction(owner, suspect))

		# This should fail because the voter has not voted yet
		self.assertFalse(self.hasVoted(voter))

		mine_tx(self.voteFor(voter, suspect))		
		self.assertTrue(self.hasVoted(voter))

	def test_waiting_voting_confirming_state_transitions(self):
		owner = MASTER
		suspect = W3.eth.accounts[1]
		voting_period = self.votingPeriod()

		# Before a confisaction action begins, should be in the waiting state.
		self.assertTrue(self.waiting(suspect))
		self.assertFalse(self.voting(suspect))
		self.assertFalse(self.confirming(suspect))

		# Begin a confiscation action against the suspect, should move to the voting state.
		mine_tx(self.beginConfiscationAction(owner, suspect))
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
		suspect = W3.eth.accounts[2]
		required_participation = self.requiredParticipation()
		required_majority = self.requiredMajority()
		havven_supply = self.havvenSupply()

		mine_tx(self.beginConfiscationAction(owner, suspect))

		self.assertFalse(self.votePasses(suspect))

	def test_beginConfiscationAction(self):
		owner = MASTER
		insufficient_standing = W3.eth.accounts[1]
		sufficient_standing = W3.eth.accounts[2]
		suspect = W3.eth.accounts[3]

		self.havvenEndow(owner, insufficient_standing, 99 * UNIT)
		self.havvenEndow(owner, sufficient_standing, 100 * UNIT)

		# Must have at least 100 havvens to begin a confiscsation action
		assertReverts(self, self.beginConfiscationAction, [insufficient_standing, suspect])

		mine_tx(self.beginConfiscationAction(sufficient_standing, suspect))

		self.assertTrue(self.voting(suspect))

		# Cannot open multiple confiscation actions on one suspect.
		assertReverts(self, self.beginConfiscationAction, [owner, suspect])

		# Cannot open a vote on an account that has already been frozen.
		# TODO

	def test_voteFor(self):
		owner = MASTER
		voter = W3.eth.accounts[1]
		suspect = W3.eth.accounts[2]
		other_suspect = W3.eth.accounts[3]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()

		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)

		# Cannot vote unless there is a confiscation action
		assertReverts(self, self.voteFor, [voter, suspect])

		# Begin a confiscation action against the suspect
		mine_tx(self.beginConfiscationAction(owner, suspect))
		self.assertTrue(self.voting(suspect))

		# Fast forward two fee periods to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))

		# Cast a vote in favour of confiscation
		mine_tx(self.voteFor(voter, suspect))
		self.assertEqual(self.votesFor(suspect), 1000)

		# Another confiscation action is opened, our voter should not be able to vote in more than one action at a time.
		mine_tx(self.beginConfiscationAction(owner, other_suspect))
		assertReverts(self, self.voteFor, [voter, other_suspect])

	def test_voteAgainst(self):
		owner = MASTER
		voter = W3.eth.accounts[1]
		suspect = W3.eth.accounts[2]
		other_suspect = W3.eth.accounts[3]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()

		# Give some havven tokens to our voter
		self.havvenEndow(owner, voter, 1000)
		self.assertEqual(self.havvenBalance(voter), 1000)

		# Cannot vote unless there is a confiscation action
		assertReverts(self, self.voteAgainst, [voter, suspect])

		# Begin a confiscation action against the suspect
		mine_tx(self.beginConfiscationAction(owner, suspect))
		self.assertTrue(self.voting(suspect))

		# Fast forward two fee periods to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))

		# Cast a vote against confiscation
		mine_tx(self.voteAgainst(voter, suspect))
		self.assertEqual(self.votesAgainst(suspect), 1000)

		# Another confiscation action is opened, our voter should not be able to vote in more than one action at a time.
		mine_tx(self.beginConfiscationAction(owner, other_suspect))
		assertReverts(self, self.voteAgainst, [voter, other_suspect])

	def test_cancelVote(self):
		owner = MASTER
		suspect = W3.eth.accounts[1]
		voter = W3.eth.accounts[3]

	#def test_closeVote(self):

	def test_approve(self):
		owner = MASTER
		voter = W3.eth.accounts[1]
		guilty = W3.eth.accounts[2]
		voting_period = self.votingPeriod()
		fee_period = self.havvenTargetFeePeriodDurationSeconds()

		# Give havven tokens to our voter
		self.havvenEndow(owner, voter, self.havvenSupply() )
		self.assertEqual(self.havvenBalance(voter), 1000)

		# Cannot vote unless there is a confiscation action
		assertReverts(self, self.voteFor, [voter, suspect])

		# Begin a confiscation action against the suspect
		mine_tx(self.beginConfiscationAction(owner, suspect))
		self.assertTrue(self.voting(suspect))

		# Fast forward two fee periods to update the voter's weight
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		fast_forward(fee_period + 1)
		self.havvenPostCheckFeePeriodRollover(DUMMY)
		self.havvenAdjustFeeEntitlement(voter, voter, self.havvenBalance(voter))

		# Cast a vote in favour of confiscation
		mine_tx(self.voteFor(voter, suspect))
		self.assertEqual(self.votesFor(suspect), 1000)


	def test_veto(self):
		owner = MASTER
		not_authorised = W3.eth.accounts[1]
		acquitted = W3.eth.accounts[3]	

		# Cannot veto when there is no vote in progress
		assertReverts(self, self.veto, [owner, acquitted])

		mine_tx(self.beginConfiscationAction(owner, acquitted))
		# Cannot veto unless you are the owner
		assertReverts(self, self.veto, [not_authorised, acquitted])

		mine_tx(self.veto(owner, acquitted))
		# Suspect should be back in the waiting stage
		self.assertTrue(self.waiting(acquitted))

	# def test_setVotedYea()

	# def test_setVotedNay()
import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, fast_forward, force_mine_block, DUMMY, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, assertCallReverts

SOLIDITY_SOURCES =  ["tests/contracts/PublicCourt.sol", "contracts/EtherNomin.sol", "contracts/Havven.sol"]

def deploy_public_court():
	print("Deployment Initiated. \n")

	compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")

	havven_contract, havven_txr = attempt_deploy(compiled, 'Havven', MASTER, [MASTER])
	nomin_contract, nomin_txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [havven_contract.address, MASTER, MASTER, 1000*UNIT, MASTER])
	court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt', MASTER, [havven_contract.address, nomin_contract.address, MASTER])

	txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}), havven_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}), nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
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

		cls.owner = lambda self: self.court.functions.owner().call()

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

		cls.voteStartTimes = lambda self: self.court.functions.voteStartTimes().call()

		cls.votesFor = lambda self: self.court.functions.votesFor().call()
		cls.votesAgainst = lambda self: self.court.functions.votesAgainst().call()

		cls.voteWeight = lambda self: self.court.functions.voteWeight().call()

		cls.setOwner = lambda self, sender, address: self.court.functions.setOwner(address).transact({'from': sender})

		cls.setMinStandingBalance = lambda self, sender, balance: self.court.functions.setMinStandingBalance(balance).transact({'from' : sender})
		cls.setVotingPeriod = lambda self, sender, duration: self.court.functions.setVotingPeriod(duration).transact({'from' : sender})
		cls.setConfirmationPeriod = lambda self, sender, duration: self.court.functions.setConfirmationPeriod(duration).transact({'from' : sender})
		cls.setRequiredParticipation = lambda self, sender, fraction: self.court.functions.setRequiredParticipation(fraction).transact({'from' : sender})
		cls.setRequiredMajority = lambda self, sender, fraction: self.court.functions.setRequiredMajority(fraction).transact({'from' : sender})

		cls.voting = lambda self, sender, target: self.court.functions.voting(target).transact({'from': sender})
		cls.confirming = lambda self, sender, target: self.court.functions.confirming(target).transact({'from' : sender})
		cls.waiting = lambda self, sender, target: self.court.functions.waiting(target).transact({'from' : sender})
		cls.votePasses = lambda self, sender, target: self.court.functions.votePasses(target).transact({'from' : sender})

		cls.beginConfiscationAction = lambda self, sender, target: self.court.functions.beginConfiscationAction(target).transact({'from' : sender})
		cls.voteFor = lambda self, sender, target: self.court.functions.voteFor(target).transact({'from' : sender})
		cls.voteAgainst = lambda self, sender, target: self.court.functions.voteAgainst(target).transact({'from' : sender})
		cls.cancelVote = lambda self, sender, target: self.court.functions.cancelVote(target).transact({'from' : sender})
		cls.closeVote = lambda self, sender, target: self.court.functions.closeVote(target).transact({'from' : sender})
		cls.approve = lambda self, sender, target: self.court.functions.approve(target).transact({'from' : sender})
		cls.veto = lambda self, sender, target: self.court.functions.veto(target).transact({'from' : sender})

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
		#self.assertEqual(self.requiredMajority(), (2 * UNIT) / 3)
		self.assertEqual(self.minRequiredMajority(), UNIT / 2)

	def test_getSetOwner(self):
		owner = self.owner()
		# Only the OWNER can setOwner
		assertReverts(self, self.setOwner, [DUMMY, DUMMY])

		mine_tx(self.setOwner(owner, DUMMY))
		self.assertEqual(self.owner(), DUMMY)

	def test_getSetMinStandingBalance(self):
		owner = self.owner()
		new_min_standing_balance = 200 * UNIT
		# Only the owner can set minStandingBalance
		assertReverts(self, self.setMinStandingBalance, [DUMMY, new_min_standing_balance])

		mine_tx(self.setMinStandingBalance(owner, new_min_standing_balance))
		self.assertEqual(self.minStandingBalance(), new_min_standing_balance)

	def test_getSetVotingPeriod(self):
		owner = self.owner()
		new_voting_period = 2 * self.weeks
		# Only the owner can set votingPeriod
		assertReverts(self, self.setVotingPeriod, [DUMMY, new_voting_period])

		mine_tx(self.setVotingPeriod(owner, new_voting_period))
		self.assertEqual(self.votingPeriod(), new_voting_period)

		# Voting period must be greater than 3 days
		bad_voting_period = 1 * self.days
		assertReverts(self, self.setVotingPeriod, [owner, bad_voting_period])

		# Voting period must be less than 4 weeks
		bad_voting_period = 5 * self.weeks
		assertReverts(self, self.setVotingPeriod, [owner, bad_voting_period])

	def test_getSetConfirmationPeriod(self):
		owner = self.owner()
		new_confirmation_period = 2 * self.weeks
		# Only the owner can set confirmationPeriod
		assertReverts(self, self.setConfirmationPeriod, [DUMMY, new_confirmation_period])

		mine_tx(self.setConfirmationPeriod(owner, new_confirmation_period))
		self.assertEqual(self.confirmationPeriod(), new_confirmation_period)

		# Confirmation period must be greater than 1 day
		bad_confirmation_period = 1 * self.days // 2
		assertReverts(self, self.setConfirmationPeriod, [owner, bad_confirmation_period])

		# Confirmation period must be less than 2 weeks
		bad_confirmation_period = 3 * self.weeks 
		assertReverts(self, self.setConfirmationPeriod, [owner, bad_confirmation_period])

	def test_getSetRequiredParticipation(self):
		owner = self.owner()
		new_required_participation = 5 * UNIT // 10
		# Only the owner can set requiredParticipation
		assertReverts(self, self.setRequiredParticipation, [DUMMY, new_required_participation])

		mine_tx(self.setRequiredParticipation(owner, new_required_participation))
		self.assertEqual(self.requiredParticipation(), new_required_participation)

		# Required participation must not be lower than 10%
		bad_required_participation = UNIT // 20
		assertReverts(self, self.setRequiredParticipation, [owner, bad_required_participation])

	def test_getSetRequiredMajority(self):
		owner = self.owner()
		new_required_majority = (3 * UNIT) // 4 
		# Only the owner can set requiredMajority
		assertReverts(self, self.setRequiredMajority, [DUMMY, new_required_majority])

		mine_tx(self.setRequiredMajority(owner, new_required_majority))
		self.assertEqual(self.requiredMajority(), new_required_majority)

		# Required majority must be no lower than 50%
		bad_required_majority = UNIT // 4
		assertReverts(self, self.setRequiredMajority, [owner, bad_required_majority])

	def test_voting(self):
		owner = self.owner()

		mine_tx(self.beginConfiscationAction(owner, DUMMY))
		self.assertTrue(self.voting(owner, DUMMY))

	# def test_confirming(self):

	# def test_waiting(self):

	# def test_votePasses(self):

	def test_beginConfiscationAction(self):
		owner = self.owner()
		# Must have standing to vote
		assertReverts(self, self.beginConfiscationAction, [DUMMY, owner])

		mine_tx(self.beginConfiscationAction(owner, DUMMY))
		self.assertTrue(self.voting(owner, DUMMY))

	# def test_voteFor(self):

	# def test_voteAgainst(self):

	# def test_cancelVote(self):

	# def test_closeVote(self):

	# def test_approve(self):

	# def test_veto(self):





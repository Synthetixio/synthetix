import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, UNIT, MASTER, \
    fast_forward, DUMMY, take_snapshot, restore_snapshot, fresh_account, fresh_accounts
from utils.testutils import assertReverts, assertClose
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

SOLIDITY_SOURCES = ["tests/contracts/PublicCourt.sol",
                    "contracts/EtherNomin.sol",
                    "tests/contracts/PublicHavven.sol",
                    "contracts/Proxy.sol"]


def deploy_public_court():
    print("Deployment Initiated. \n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")
    court_abi = compiled['PublicCourt']['abi']
    nomin_abi = compiled['EtherNomin']['abi']

    havven_contract, havven_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER])
    nomin_contract, nomin_txr = attempt_deploy(compiled, 'EtherNomin', MASTER,
                                               [havven_contract.address, MASTER, MASTER, 1000 * UNIT, MASTER,
                                                ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt', MASTER,
                                               [havven_contract.address, nomin_contract.address, MASTER])

    # Install proxies
    havven_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                     MASTER, [havven_contract.address, MASTER])
    mine_tx(havven_contract.functions.setProxy(havven_proxy.address).transact({'from': MASTER}))
    proxy_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])

    nomin_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                    MASTER, [nomin_contract.address, MASTER])
    mine_tx(nomin_contract.functions.setProxy(nomin_proxy.address).transact({'from': MASTER}))
    proxy_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['EtherNomin']['abi'])

    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return (proxy_havven, proxy_nomin, havven_proxy, nomin_proxy, havven_contract,
            nomin_contract, court_contract, nomin_abi, court_abi)


def setUpModule():
    print("Testing Court...")


def tearDownModule():
    print()


class TestCourt(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        cls.havven, cls.nomin, cls.havven_proxy, cls.nomin_proxy, cls.havven_real, \
            cls.nomin_real, cls.court, cls.nomin_abi, cls.court_abi = deploy_public_court()

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
        cls.motionTarget = lambda self, index: self.court.functions.motionTarget(index).call()
        cls.targetMotionID = lambda self, address: self.court.functions.targetMotionID(address).call()
        cls.motionStartTime = lambda self, account: self.court.functions.motionStartTime(account).call()
        cls.votesFor = lambda self, account: self.court.functions.votesFor(account).call()
        cls.votesAgainst = lambda self, account: self.court.functions.votesAgainst(account).call()
        cls.vote = lambda self, account, motionID: self.court.functions.vote(account, motionID).call()

        # Inherited setters
        cls.nominateOwner = lambda self, sender, address: mine_tx(
            self.court.functions.nominateOwner(address).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            self.court.functions.acceptOwnership().transact({'from': sender}))

        # Setters
        cls.setMinStandingBalance = lambda self, sender, balance: mine_tx(
            self.court.functions.setMinStandingBalance(balance).transact({'from': sender}))
        cls.setVotingPeriod = lambda self, sender, duration: mine_tx(
            self.court.functions.setVotingPeriod(duration).transact({'from': sender}))
        cls.setConfirmationPeriod = lambda self, sender, duration: mine_tx(
            self.court.functions.setConfirmationPeriod(duration).transact({'from': sender}))
        cls.setRequiredParticipation = lambda self, sender, fraction: mine_tx(
            self.court.functions.setRequiredParticipation(fraction).transact({'from': sender}))
        cls.setRequiredMajority = lambda self, sender, fraction: mine_tx(
            self.court.functions.setRequiredMajority(fraction).transact({'from': sender}))

        # Views
        cls.hasVoted = lambda self, sender, motionID: self.court.functions.hasVoted(sender, motionID).call()
        cls.motionVoting = lambda self, target: self.court.functions.motionVoting(target).call()
        cls.motionConfirming = lambda self, target: self.court.functions.motionConfirming(target).call()
        cls.motionWaiting = lambda self, target: self.court.functions.motionWaiting(target).call()
        cls.motionPasses = lambda self, target: self.court.functions.motionPasses(target).call()

        # Mutators
        cls.beginMotion = lambda self, sender, target: mine_tx(
            self.court.functions.beginMotion(target).transact({'from': sender}))
        cls.voteFor = lambda self, sender, target: mine_tx(
            self.court.functions.voteFor(target).transact({'from': sender}))
        cls.voteAgainst = lambda self, sender, target: mine_tx(
            self.court.functions.voteAgainst(target).transact({'from': sender}))
        cls.cancelVote = lambda self, sender, target: mine_tx(
            self.court.functions.cancelVote(target).transact({'from': sender}))
        cls.closeMotion = lambda self, sender, target: mine_tx(
            self.court.functions.closeMotion(target).transact({'from': sender}))

        # Owner only
        cls.approveMotion = lambda self, sender, target: mine_tx(
            self.court.functions.approveMotion(target).transact({'from': sender}))
        cls.vetoMotion = lambda self, sender, target: mine_tx(
            self.court.functions.vetoMotion(target).transact({'from': sender}))

        # Internal
        cls.setupVote = lambda self, sender, target: mine_tx(
            self.court.functions.publicSetupVote(target).transact({'from': sender}))

        # Havven getters
        cls.havvenSupply = lambda self: self.havven.functions.totalSupply().call()
        cls.havvenBalance = lambda self, account: self.havven.functions.balanceOf(account).call()
        cls.havvenTargetFeePeriodDurationSeconds = lambda self: \
            self.havven.functions.targetFeePeriodDurationSeconds().call()
        cls.havvenPenultimateAverageBalance = lambda self, addr: \
            self.havven.functions.penultimateAverageBalance(addr).call()
        cls.havvenLastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()

        # Havven mutators
        cls.havvenEndow = lambda self, sender, account, value: mine_tx(
            self.havven.functions.endow(account, value).transact({'from': sender}))
        cls.havvenTransfer = lambda self, sender, to, value: mine_tx(
            self.havven.functions.transfer(to, value).transact({'from': sender}))
        cls.havvenCheckFeePeriodRollover = lambda self, sender: mine_tx(
            self.havven.functions._checkFeePeriodRollover().transact({'from': sender}))
        cls.havvenAdjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(
            self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
        cls.havvenSetTargetFeePeriodDuration = lambda self, sender, duration: mine_tx(
            self.havven.functions.setTargetFeePeriodDuration(duration).transact({'from': sender}))

        # Nomin getter
        cls.nominIsFrozen = lambda self, account: self.nomin.functions.frozen(account).call()

        # Solidity convenience
        cls.days = 86400
        cls.weeks = 604800
        cls.months = 2628000
        cls.unit = 10**18

    # Extract vote index from a transaction receipt returned by a call to beginMotion
    def get_motion_index(self, tx_receipt):
        event_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])
        self.assertEqual(event_data['event'], "MotionBegun")
        return event_data['args']['motionID']

    def test_constructor(self):
        self.assertEqual(self.owner(), MASTER)
        self.assertEqual(self.havven_real.address, self.getHavven())
        self.assertEqual(self.nomin_real.address, self.getNomin())
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
        # Only owner can change the owner.
        self.assertReverts(self.nominateOwner, DUMMY, DUMMY)
        self.nominateOwner(owner, DUMMY)
        self.acceptOwnership(DUMMY)
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

    def test_nextMotionID(self):
        owner = self.owner()
        voter = fresh_account()
        fee_period = self.havvenTargetFeePeriodDurationSeconds()

        self.havvenEndow(owner, voter, 1000 * UNIT)
        self.assertEqual(self.havvenBalance(voter), 1000 * UNIT)

        # Fast forward to update the vote weight.
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)

        address_pattern = "0x" + "0" * 39 + "{}"
        motion_id = self.get_motion_index(self.beginMotion(voter, address_pattern.format(1)))
        self.assertEqual(motion_id, 1)
        for i in range(2, 6):
            self.assertEqual(self.get_motion_index(self.beginMotion(voter, address_pattern.format(i))), i)

    def test_motionTarget_targetMotionID(self):
        owner = self.owner()
        voter, target1, target2, target3 = fresh_accounts(4)
        fee_period = self.havvenTargetFeePeriodDurationSeconds()
        voting_period = self.votingPeriod()
        confirmation_period = self.confirmationPeriod()

        self.havvenEndow(owner, voter, self.havvenSupply() // 2)

        # Fast forward to update the vote weight.
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)

        # Start three motions to close them in three different ways.
        motion_id1 = self.get_motion_index(self.beginMotion(voter, target1))
        motion_id2 = self.get_motion_index(self.beginMotion(voter, target2))
        motion_id3 = self.get_motion_index(self.beginMotion(voter, target3))

        self.assertEqual(self.motionTarget(motion_id1), target1)
        self.assertEqual(self.motionTarget(motion_id2), target2)
        self.assertEqual(self.motionTarget(motion_id3), target3)

        self.assertEqual(self.targetMotionID(target1), motion_id1)
        self.assertEqual(self.targetMotionID(target2), motion_id2)
        self.assertEqual(self.targetMotionID(target3), motion_id3)

        self.vetoMotion(owner, motion_id1)
        self.assertEqual(int(self.motionTarget(motion_id1), 16), 0)
        self.assertEqual(self.targetMotionID(target1), 0)

        self.voteFor(voter, motion_id2)

        fast_forward(voting_period + 1)

        self.approveMotion(owner, motion_id2)
        self.assertEqual(int(self.motionTarget(motion_id2), 16), 0)
        self.assertEqual(self.targetMotionID(target2), 0)

        fast_forward(confirmation_period + 1)
        self.closeMotion(voter, motion_id3)
        self.assertEqual(int(self.motionTarget(motion_id3), 16), 0)
        self.assertEqual(self.targetMotionID(target3), 0)

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
        actual_motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
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

    def test_beginMotion(self):
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
        self.assertReverts(self.beginMotion, insufficient_standing, suspects[0])
        tx_receipt = self.beginMotion(sufficient_standing, suspects[0])

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionBegun")
        motion_id_0 = self.get_motion_index(tx_receipt)
        self.assertTrue(self.motionVoting(motion_id_0))

        # Initial vote balances should be zero.
        self.assertEqual(self.votesFor(motion_id_0), 0)
        self.assertEqual(self.votesAgainst(motion_id_0), 0)

        # The contract owner can also begin a motion, regardless of the token requirement.
        motion_id_1 = self.get_motion_index(self.beginMotion(owner, suspects[1]))

        # Cannot open multiple confiscation motions on one suspect.
        self.assertReverts(self.beginMotion, owner, suspects[0])
        self.voteFor(voter, motion_id_0)
        fast_forward(voting_period)
        self.approveMotion(owner, motion_id_0)
        self.assertTrue(self.nominIsFrozen(suspects[0]))

        # Cannot open a vote on an account that has already been frozen.
        self.assertReverts(self.beginMotion, owner, suspects[0])

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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))

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
        voter, no_tokens, suspect = fresh_accounts(3)
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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
        self.assertTrue(self.motionVoting(motion_id))

        # Cast a vote in favour of confiscation.
        tx_receipt = self.voteFor(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VotedFor")

        # And that the totals have been updated properly.
        self.assertEqual(self.votesFor(motion_id), 1000)
        self.assertEqual(self.voteWeight(voter, motion_id), 1000)
        self.assertEqual(self.vote(voter, motion_id), 1)

        # It should not be possible to cast a repeat vote without cancelling first.
        self.assertReverts(self.voteFor, voter, motion_id)
        self.assertReverts(self.voteAgainst, voter, motion_id)

        # It should not be possible to vote without any vote weight.
        self.assertReverts(self.voteFor, no_tokens, motion_id)

        # And a target should not be able to vote for themself.
        self.assertReverts(self.voteFor, suspect, motion_id)

    def test_voteAgainst(self):
        owner = self.owner()
        voter, no_tokens, suspect = fresh_accounts(3)
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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
        self.assertTrue(self.motionVoting(motion_id))

        # Cast a vote against confiscation.
        tx_receipt = self.voteAgainst(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VotedAgainst")

        # And that the totals have been updated properly.
        self.assertEqual(self.votesAgainst(motion_id), 1000)
        self.assertEqual(self.voteWeight(voter, motion_id), 1000)
        self.assertEqual(self.vote(voter, motion_id), 2)

        # It should not be possible to cast a repeat vote without cancelling first.
        self.assertReverts(self.voteFor, voter, motion_id)
        self.assertReverts(self.voteAgainst, voter, motion_id)

        # It should not be possible to vote without any vote weight.
        self.assertReverts(self.voteAgainst, no_tokens, motion_id)

        # And a target should not be able to vote against themself.
        self.assertReverts(self.voteAgainst, suspect, motion_id)

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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))

        # Cast a vote in favour of confiscation.
        self.voteFor(voter, motion_id)
        self.assertEqual(self.votesFor(motion_id), 1000)
        tx_receipt = self.cancelVote(voter, motion_id)

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
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))

        # Should not be able to close vote in the voting period.
        self.assertReverts(self.closeMotion, voter, motion_id)
        fast_forward(voting_period)
        self.assertTrue(self.motionConfirming(motion_id))
        tx_receipt = self.closeMotion(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionClosed")

        # Start another confiscation motion.
        motion_id = self.get_motion_index(self.beginMotion(owner, suspect))
        self.voteFor(voter, motion_id)
        fast_forward(voting_period)

        # After vote has closed, voteStarTimes and votesFor/votesAgainst should be 0 and suspect should be waiting.
        self.closeMotion(voter, motion_id)
        self.assertEqual(self.targetMotionID(suspect), 0)
        self.assertEqual(self.motionTarget(motion_id), ZERO_ADDRESS)
        self.assertEqual(self.votesFor(motion_id), 0)
        self.assertEqual(self.votesAgainst(motion_id), 0)
        self.assertEqual(self.motionStartTime(motion_id), 0)
        self.assertTrue(self.motionWaiting(motion_id))

    def test_approveMotion(self):
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
        tx_receipt = self.beginMotion(owner, guilty)
        motion_id = self.get_motion_index(tx_receipt)

        # Cast a vote in favour of confiscation.
        tx_receipt = self.voteFor(voter, motion_id)

        # It should not be possible to approve in the voting state.
        self.assertReverts(self.approveMotion, owner, motion_id)
        fast_forward(voting_period)
        self.assertTrue(self.motionConfirming(motion_id))

        # Only the owner can approve the confiscation of a balance.
        self.assertReverts(self.approveMotion, voter, motion_id)
        tx_receipt = self.approveMotion(owner, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])['event'], "AccountFrozen")
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "MotionClosed")
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[2])['event'], "MotionApproved")
        self.assertEqual(self.motionStartTime(motion_id), 0)
        self.assertEqual(self.votesFor(motion_id), 0)

        # After confiscation, their nomin balance should be frozen.
        self.assertTrue(self.nominIsFrozen(guilty))

    def test_vetoMotion(self):
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
        self.assertReverts(self.vetoMotion, owner, 10)
        motion_id = self.get_motion_index(self.beginMotion(owner, acquitted))

        # Only owner can veto.
        self.assertReverts(self.vetoMotion, DUMMY, motion_id)
        self.vetoMotion(owner, motion_id)

        # After veto motion, suspect should be back in the waiting stage.
        self.assertTrue(self.motionWaiting(motion_id))
        motion_id_2 = self.get_motion_index(self.beginMotion(owner, acquitted))
        self.assertNotEqual(motion_id, motion_id_2)
        self.voteFor(voter, motion_id_2)
        self.assertTrue(self.motionPasses(motion_id_2))
        fast_forward(voting_period)
        self.assertTrue(self.motionConfirming(motion_id_2))

        # Once a vote has been passed, the owner can veto it.
        tx_receipt = self.vetoMotion(owner, motion_id_2)

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

    def validate_MotionBegun_data(self, tx_receipt, expected_initiator, expected_target, expected_motionID):
        event_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])
        self.assertEqual(event_data['event'], "MotionBegun")
        self.assertEqual(event_data['args']['initiator'], expected_initiator)
        self.assertEqual(event_data['args']['target'], expected_target)
        self.assertEqual(event_data['args']['motionID'], expected_motionID)

    def validate_MotionClosed_data(self, tx_receipt, log_index, expected_motionID):
        closed_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(closed_data['event'], "MotionClosed")
        self.assertEqual(closed_data['args']['motionID'], expected_motionID)

    def validate_MotionVetoed_data(self, tx_receipt, log_index, expected_motionID):
        veto_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(veto_data['event'], "MotionVetoed")
        self.assertEqual(veto_data['args']['motionID'], expected_motionID)

    def validate_MotionApproved_data(self, tx_receipt, log_index, expected_motionID):
        veto_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(veto_data['event'], "MotionApproved")
        self.assertEqual(veto_data['args']['motionID'], expected_motionID)

    def validate_Confiscation_data(self, tx_receipt, log_index, expected_target, expected_balance=None):
        veto_data = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(veto_data['event'], "AccountFrozen")
        self.assertEqual(veto_data['args']['target'], expected_target)
        if expected_balance is not None:
            self.assertEqual(veto_data['args']['balance'], expected_balance)

    def test_multi_vote(self):
        owner = self.owner()
        voting_period = self.votingPeriod()
        confirmation_period = self.confirmationPeriod()
        fee_period = self.havvenTargetFeePeriodDurationSeconds()
        required_participation = self.requiredParticipation() / self.unit
        required_majority = self.requiredMajority() / self.unit

        # Generate a bunch of voters with equal voting power
        num_voters = 50
        num_targets = 11
        accounts = fresh_accounts(num_voters + num_targets)
        voters, targets = accounts[:num_voters], accounts[num_voters:]
        for voter in voters:
            self.havvenEndow(owner, voter, self.havvenSupply() // num_voters)

        frozen, unfrozen = [], []

        # Update their fee info.
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)
        fast_forward(fee_period + 1)
        self.havvenCheckFeePeriodRollover(DUMMY)

        # Run a shitload of votes simultaneously:
        motions = []
        target_index = 0
        motion_id = self.nextMotionID()

        # pass (unanimous)
        unanimous_target = targets[target_index]
        frozen.append(unanimous_target)
        tx_receipt = self.beginMotion(owner, unanimous_target)
        self.validate_MotionBegun_data(tx_receipt, owner, unanimous_target, motion_id)
        motion_id += 1
        unanimous_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(unanimous_vote)
        for voter in voters:
            self.voteFor(voter, unanimous_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, unanimous_vote))

        # pass (majority)
        majority_target = targets[target_index]
        frozen.append(majority_target)
        tx_receipt = self.beginMotion(owner, majority_target)
        self.validate_MotionBegun_data(tx_receipt, owner, majority_target, motion_id)
        motion_id += 1
        majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(majority_vote)
        n_yeas = int(num_voters * 0.67) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.voteFor(voter, majority_vote)
        for voter in nays:
            self.voteAgainst(voter, majority_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, majority_vote))

        # pass (bare)
        bare_target = targets[target_index]
        frozen.append(bare_target)
        tx_receipt = self.beginMotion(owner, bare_target)
        self.validate_MotionBegun_data(tx_receipt, owner, bare_target, motion_id)
        motion_id += 1
        bare_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(bare_majority_vote)
        n_yeas = int(num_voters * required_majority) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.voteFor(voter, bare_majority_vote)
        for voter in nays:
            self.voteAgainst(voter, bare_majority_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, bare_majority_vote))

        # pass (barely enough participation)
        quorum_target = targets[target_index]
        frozen.append(quorum_target)
        tx_receipt = self.beginMotion(owner, quorum_target)
        self.validate_MotionBegun_data(tx_receipt, owner, quorum_target, motion_id)
        motion_id += 1
        bare_quorum_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(bare_quorum_vote)
        bare_quorum = int(num_voters * required_participation) + 1
        n_yeas = int(bare_quorum * required_majority) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:bare_quorum]
        for voter in yeas:
            self.voteFor(voter, bare_quorum_vote)
        for voter in nays:
            self.voteAgainst(voter, bare_quorum_vote)
        for voter in voters[:bare_quorum]:
            self.assertTrue(self.hasVoted(voter, bare_quorum_vote))
        for voter in voters[bare_quorum:]:
            self.assertFalse(self.hasVoted(voter, bare_quorum_vote))

        # fail (just-insufficient participation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        not_quite_quorum_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(not_quite_quorum_vote)
        not_quite_quorum = int(num_voters * 0.3) - 1
        n_yeas = (not_quite_quorum // 2) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:not_quite_quorum]
        for voter in yeas:
            self.voteFor(voter, not_quite_quorum_vote)
        for voter in nays:
            self.voteAgainst(voter, not_quite_quorum_vote)
        for voter in voters[:not_quite_quorum]:
            self.assertTrue(self.hasVoted(voter, not_quite_quorum_vote))
        for voter in voters[not_quite_quorum:]:
            self.assertFalse(self.hasVoted(voter, not_quite_quorum_vote))

        # fail (zero participation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        zero_participation_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(zero_participation_vote)
        for voter in voters:
            self.assertFalse(self.hasVoted(voter, zero_participation_vote))

        # fail (insufficient majority)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        insufficient_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(insufficient_majority_vote)
        n_yeas = int(num_voters * 0.66) - 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.voteFor(voter, insufficient_majority_vote)
        for voter in nays:
            self.voteAgainst(voter, insufficient_majority_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, insufficient_majority_vote))

        # fail (zero majority)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        no_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(no_majority_vote)
        for voter in voters:
            self.voteAgainst(voter, no_majority_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, no_majority_vote))

        # fail (timeout)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        timeout_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(timeout_vote)
        for voter in voters:
            self.voteFor(voter, timeout_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, timeout_vote))

        # fail (veto during proceedings)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        mid_veto_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(mid_veto_vote)
        for voter in voters:
            self.voteFor(voter, mid_veto_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, mid_veto_vote))

        # fail (veto during confirmation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        post_veto_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(post_veto_vote)
        for voter in voters:
            self.voteFor(voter, post_veto_vote)
        for voter in voters:
            self.assertTrue(self.hasVoted(voter, post_veto_vote))

        # All these motions should now be voting.
        for motion in motions:
            self.assertTrue(self.motionVoting(motion))

        # Fast forward to mid voting period...
        fast_forward(voting_period // 2)
        for motion in motions:
            self.assertTrue(self.motionVoting(motion))

        tx_receipt = self.vetoMotion(owner, mid_veto_vote)
        self.validate_MotionClosed_data(tx_receipt, 0, mid_veto_vote)
        self.validate_MotionVetoed_data(tx_receipt, 1, mid_veto_vote)
        self.assertTrue(self.motionWaiting(mid_veto_vote))

        fast_forward(voting_period // 2 + 1)
        for motion, target in [(unanimous_vote, unanimous_target),
                               (majority_vote, majority_target),
                               (bare_majority_vote, bare_target),
                               (bare_quorum_vote, quorum_target)]:
            self.assertTrue(self.motionConfirming(motion))

            yeas = self.votesFor(motion)
            nays = self.votesAgainst(motion)
            totalVotes = yeas + nays
            self.assertTrue(self.motionPasses(motion))

            tx_receipt = self.approveMotion(owner, motion)
            self.assertTrue(self.motionWaiting(motion))
            self.assertTrue(self.nominIsFrozen(target))

            self.validate_Confiscation_data(tx_receipt, 0, target)
            self.validate_MotionClosed_data(tx_receipt, 1, motion)
            self.validate_MotionApproved_data(tx_receipt, 2, motion)

        for motion in [not_quite_quorum_vote, zero_participation_vote,
                       insufficient_majority_vote, no_majority_vote]:
            self.assertTrue(self.motionConfirming(motion))
            tx_receipt = self.closeMotion(owner, motion)
            self.validate_MotionClosed_data(tx_receipt, 0, motion)
            self.assertTrue(self.motionWaiting(motion))

        self.assertTrue(self.motionConfirming(post_veto_vote))
        self.assertReverts(self.closeMotion, owner, post_veto_vote)
        tx_receipt = self.vetoMotion(owner, post_veto_vote)
        self.validate_MotionClosed_data(tx_receipt, 0, post_veto_vote)
        self.validate_MotionVetoed_data(tx_receipt, 1, post_veto_vote)
        self.assertTrue(self.motionWaiting(post_veto_vote))

        self.assertTrue(self.motionConfirming(timeout_vote))
        self.assertReverts(self.closeMotion, owner, timeout_vote)
        fast_forward(confirmation_period + 1)
        self.assertTrue(self.motionWaiting(timeout_vote))
        self.closeMotion(owner, timeout_vote)
        self.assertTrue(self.motionWaiting(timeout_vote))

    def test_weight_invariance(self):
        pass

import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, mine_txs, UNIT, MASTER, \
    fast_forward, DUMMY, take_snapshot, restore_snapshot, fresh_account, fresh_accounts
from utils.testutils import assertReverts, assertClose, block_time
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

from tests.contract_interfaces.court_interface import PublicCourtInterface
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import NominInterface

SOLIDITY_SOURCES = ["tests/contracts/PublicCourt.sol",
                    "contracts/Nomin.sol",
                    "tests/contracts/PublicHavven.sol"]


def deploy_public_court():
    print("Deployment Initiated. \n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts...")
    court_abi = compiled['PublicCourt']['abi']
    nomin_abi = compiled['Nomin']['abi']

    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER, MASTER])
    nomin_contract, nom_txr = attempt_deploy(compiled, 'Nomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'PublicCourt',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])

    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
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

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        cls.havven_contract, cls.nomin_contract, cls.court_contract, cls.nomin_abi, cls.court_abi = deploy_public_court()

        # Event stuff
        cls.court_event_dict = generate_topic_event_map(cls.court_abi)
        cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

        cls.court = PublicCourtInterface(cls.court_contract)

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = NominInterface(cls.nomin_contract)

        # Solidity convenience
        cls.days = 86400
        cls.weeks = 604800
        cls.months = 2628000
        cls.unit = 10**18

    #
    # HELPER FUNCTIONS
    #

    #  Extract vote index from a transaction receipt returned by a call to beginMotion
    def get_motion_index(self, tx_receipt):
        event_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[-1])
        self.assertEqual(event_data['event'], "MotionBegun")
        return event_data['args']['motionID']

    def startVotingPeriod(self, voter, target):
        tx = self.court.beginMotion(voter, target)
        motion_id = self.get_motion_index(tx)

        self.assertReverts(self.court.closeMotion, voter, motion_id)
        # fast forward to voting period
        fast_forward(self.court.motionStartTime(motion_id) - block_time() + 1)
        return motion_id

    def validate_MotionBegun_data(self, tx_receipt, expected_initiator, expected_target, expected_motion_id):
        event_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])
        self.assertEqual(event_data['event'], "MotionBegun")
        self.assertEqual(event_data['args']['initiator'], expected_initiator)
        self.assertEqual(event_data['args']['target'], expected_target)
        self.assertEqual(event_data['args']['motionID'], expected_motion_id)
        # TODO: check start time

    def validate_MotionClosed_data(self, tx_receipt, log_index, expected_motion_id):
        closed_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(closed_data['event'], "MotionClosed")
        self.assertEqual(closed_data['args']['motionID'], expected_motion_id)

    def validate_MotionVetoed_data(self, tx_receipt, log_index, expected_motion_id):
        veto_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(veto_data['event'], "MotionVetoed")
        self.assertEqual(veto_data['args']['motionID'], expected_motion_id)

    def validate_MotionApproved_data(self, tx_receipt, log_index, expected_motion_id):
        approved_data = get_event_data_from_log(self.court_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(approved_data['event'], "MotionApproved")
        self.assertEqual(approved_data['args']['motionID'], expected_motion_id)

    def validate_Confiscation_data(self, tx_receipt, log_index, expected_target, expected_balance=None):
        freeze_data = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[log_index])
        self.assertEqual(freeze_data['event'], "AccountFrozen")
        self.assertEqual(freeze_data['args']['target'], expected_target)
        if expected_balance is not None:
            self.assertEqual(freeze_data['args']['balance'], expected_balance)
        xfer_data = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[log_index + 1])
        self.assertEqual(xfer_data['event'], "Transfer")

    #
    # UNIT TESTS
    #

    def test_constructor(self):
        self.assertEqual(self.court.owner(), MASTER)
        self.assertEqual(self.havven.contract.address, self.court.getHavven())
        self.assertEqual(self.nomin.contract.address, self.court.getNomin())
        self.assertEqual(self.court.minStandingBalance(), 100 * UNIT)
        self.assertEqual(self.court.votingPeriod(), 1 * self.weeks)
        self.assertEqual(self.court.MIN_VOTING_PERIOD(), 3 * self.days)
        self.assertEqual(self.court.MAX_VOTING_PERIOD(), 4 * self.weeks)
        self.assertEqual(self.court.confirmationPeriod(), 1 * self.weeks)
        self.assertEqual(self.court.MIN_CONFIRMATION_PERIOD(), 1 * self.days)
        self.assertEqual(self.court.MAX_CONFIRMATION_PERIOD(), 2 * self.weeks)
        self.assertEqual(self.court.requiredParticipation(), 3 * UNIT / 10)
        self.assertEqual(self.court.MIN_REQUIRED_PARTICIPATION(), UNIT / 10)
        self.assertEqual(self.court.requiredMajority(), (2 * UNIT) // 3)
        self.assertEqual(self.court.MIN_REQUIRED_MAJORITY(), UNIT / 2)

    def test_setOwner(self):
        owner = self.court.owner()
        # Only owner can change the owner.
        self.assertReverts(self.court.nominateOwner, DUMMY, DUMMY)
        self.court.nominateOwner(owner, DUMMY)
        self.court.acceptOwnership(DUMMY)
        self.assertEqual(self.court.owner(), DUMMY)

    def test_setMinStandingBalance(self):
        owner = self.court.owner()
        new_min_standing_balance = 200 * UNIT
        # Only owner can set minStandingBalance.
        self.assertReverts(self.court.setMinStandingBalance, DUMMY, new_min_standing_balance)
        tx_receipt = self.court.setMinStandingBalance(owner, new_min_standing_balance)
        self.assertEqual(self.court.minStandingBalance(), new_min_standing_balance)

    def test_setVotingPeriod(self):
        owner = self.court.owner()
        new_voting_period = 2 * self.weeks

        # Only owner can set votingPeriod.
        self.assertReverts(self.court.setVotingPeriod, DUMMY, new_voting_period)
        tx_receipt = self.court.setVotingPeriod(owner, new_voting_period)
        self.assertEqual(self.court.votingPeriod(), new_voting_period)

        # Voting period must be > than MIN_VOTING_PERIOD (~ currently 3 days).
        bad_voting_period = 3 * self.days - 1
        self.assertReverts(self.court.setVotingPeriod, owner, bad_voting_period)

        # Voting period must be < than MAX_VOTING_PERIOD (~ currently 4 weeks).
        bad_voting_period = 4 * self.weeks + 1
        self.assertReverts(self.court.setVotingPeriod, owner, bad_voting_period)

        # Voting period must be <= the havven target fee period duration.
        fee_period_duration = 2 * self.weeks
        self.havven.setTargetFeePeriodDuration(owner, fee_period_duration)
        self.assertEqual(self.havven.targetFeePeriodDurationSeconds(), fee_period_duration)

        # Voting period must be <= fee period duration.
        bad_voting_period = 2 * self.weeks + 1
        self.assertReverts(self.court.setVotingPeriod, owner, bad_voting_period)

    def test_setConfirmationPeriod(self):
        owner = self.court.owner()
        new_confirmation_period = 2 * self.weeks

        # Only owner can set confirmationPeriod.
        self.assertReverts(self.court.setConfirmationPeriod, DUMMY, new_confirmation_period)
        tx_receipt = self.court.setConfirmationPeriod(owner, new_confirmation_period)
        self.assertEqual(self.court.confirmationPeriod(), new_confirmation_period)

        # Confirmation period must be > than MIN_CONFIRMATION_PERIOD (~ currently 1 days).
        bad_confirmation_period = 1 * self.days - 1
        self.assertReverts(self.court.setConfirmationPeriod, owner, bad_confirmation_period)

        # Confirmation period must be < than MAX_CONFIRMATION_PERIOD (~ 3 weeks).
        bad_confirmation_period = 3 * self.weeks + 1
        self.assertReverts(self.court.setConfirmationPeriod, owner, bad_confirmation_period)

    def test_setRequiredParticipation(self):
        owner = self.court.owner()
        new_required_participation = 5 * UNIT // 10

        # Only owner can set requiredParticipation.
        self.assertReverts(self.court.setRequiredParticipation, DUMMY, new_required_participation)
        tx_receipt = self.court.setRequiredParticipation(owner, new_required_participation)
        self.assertEqual(self.court.requiredParticipation(), new_required_participation)

        # Required participation must be >= than 10%.
        bad_required_participation = UNIT // 10 - 1
        self.assertReverts(self.court.setRequiredParticipation, owner, bad_required_participation)

    def test_setRequiredMajority(self):
        owner = self.court.owner()
        new_required_majority = (3 * UNIT) // 4

        # Only owner can set requiredMajority.
        self.assertReverts(self.court.setRequiredMajority, DUMMY, new_required_majority)
        tx_receipt = self.court.setRequiredMajority(owner, new_required_majority)
        self.assertEqual(self.court.requiredMajority(), new_required_majority)

        # Required majority must be >= than 50%.
        bad_required_majority = UNIT // 2 - 1
        self.assertReverts(self.court.setRequiredMajority, owner, bad_required_majority)

    def test_nextMotionID(self):
        owner = self.court.owner()
        voter = fresh_account()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        self.havven.endow(owner, voter, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(voter), 1000 * UNIT)

        # Fast forward to update the vote weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        address_pattern = "0x" + "0" * 39 + "{}"
        motion_id = self.get_motion_index(self.court.beginMotion(voter, address_pattern.format(1)))
        self.assertEqual(motion_id, 1)
        for i in range(2, 6):
            self.assertEqual(self.get_motion_index(self.court.beginMotion(voter, address_pattern.format(i))), i)

    def test_motionTarget_targetMotionID(self):
        owner = self.court.owner()
        voter, target1, target2, target3 = fresh_accounts(4)
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        voting_period = self.court.votingPeriod()
        confirmation_period = self.court.confirmationPeriod()

        self.havven.endow(owner, voter, self.havven.totalSupply() // 2)

        # Fast forward to update the vote weight.
        fast_forward(fee_period + 1)

        # Start three motions to close them in three different ways.
        motion_id1 = self.get_motion_index(self.court.beginMotion(voter, target1))
        motion_id2 = self.get_motion_index(self.court.beginMotion(voter, target2))
        motion_id3 = self.get_motion_index(self.court.beginMotion(voter, target3))

        fast_forward(self.court.motionStartTime(motion_id1) - block_time() + 1)

        self.assertEqual(self.court.motionTarget(motion_id1), target1)
        self.assertEqual(self.court.motionTarget(motion_id2), target2)
        self.assertEqual(self.court.motionTarget(motion_id3), target3)

        self.assertEqual(self.court.targetMotionID(target1), motion_id1)
        self.assertEqual(self.court.targetMotionID(target2), motion_id2)
        self.assertEqual(self.court.targetMotionID(target3), motion_id3)

        self.court.vetoMotion(owner, motion_id1)
        self.assertEqual(int(self.court.motionTarget(motion_id1), 16), 0)
        self.assertEqual(self.court.targetMotionID(target1), 0)

        self.court.voteFor(voter, motion_id2)

        fast_forward(voting_period + 1)

        self.court.approveMotion(owner, motion_id2)
        self.assertEqual(int(self.court.motionTarget(motion_id2), 16), 0)
        self.assertEqual(self.court.targetMotionID(target2), 0)

        fast_forward(confirmation_period + 1)
        self.court.closeMotion(voter, motion_id3)
        self.assertEqual(int(self.court.motionTarget(motion_id3), 16), 0)
        self.assertEqual(self.court.targetMotionID(target3), 0)

    def test_waiting_voting_confirming_state_transitions(self):
        owner = self.court.owner()
        suspect = fresh_account()
        voting_period = self.court.votingPeriod()
        confirmation_period = self.court.confirmationPeriod()
        motion_id = self.court.nextMotionID()

        # Before a confiscation motion begins, should be in the waiting state.
        self.assertTrue(self.court.motionWaiting(motion_id))
        self.assertFalse(self.court.motionVoting(motion_id))
        self.assertFalse(self.court.motionConfirming(motion_id))

        # Begin a confiscation motion against the suspect, should move to the voting state.
        actual_motion_id = self.startVotingPeriod(owner, suspect)
        self.assertEqual(motion_id, actual_motion_id)
        self.assertFalse(self.court.motionWaiting(motion_id))
        self.assertTrue(self.court.motionVoting(motion_id))
        self.assertFalse(self.court.motionConfirming(motion_id))

        # Fast forward to the middle of the voting period, should still be in the voting state.
        fast_forward(voting_period / 2)
        self.assertFalse(self.court.motionWaiting(motion_id))
        self.assertTrue(self.court.motionVoting(motion_id))
        self.assertFalse(self.court.motionConfirming(motion_id))

        # When the voting period finishes, should move to confirming state.
        fast_forward(voting_period / 2)
        self.assertFalse(self.court.motionWaiting(motion_id))
        self.assertFalse(self.court.motionVoting(motion_id))
        self.assertTrue(self.court.motionConfirming(motion_id))

        # Fast forward to the middle of the confirmation period, should still be in the confirming state.
        fast_forward(confirmation_period / 2)
        self.assertFalse(self.court.motionWaiting(motion_id))
        self.assertFalse(self.court.motionVoting(motion_id))
        self.assertTrue(self.court.motionConfirming(motion_id))

        # When the voting confirmation period finishes, should move to waiting state.
        fast_forward(confirmation_period / 2)
        self.assertTrue(self.court.motionWaiting(motion_id))
        self.assertFalse(self.court.motionVoting(motion_id))
        self.assertFalse(self.court.motionConfirming(motion_id))

    def test_hasVoted(self):
        owner = self.court.owner()
        voter, suspect = fresh_accounts(2)
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Give 1000 havven tokens to our voter.
        self.havven.endow(owner, voter, 1000)
        self.assertEqual(self.havven.balanceOf(voter), 1000)

        # Fast forward to update the vote weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        self.havven.recomputeAccountLastHavvenAverageBalance(voter, voter)

        # This should fail because no confiscation motion has begun.
        next_motion_id = self.court.nextMotionID()
        self.assertFalse(self.court.hasVoted(voter, next_motion_id))
        motion_id = self.get_motion_index(self.court.beginMotion(owner, suspect))
        self.assertEqual(motion_id, next_motion_id)

        fast_forward(self.court.motionStartTime(motion_id) - block_time() + 1)

        # This should return false because the voter has not voted yet.
        self.assertFalse(self.court.hasVoted(voter, motion_id))
        self.court.voteFor(voter, motion_id)

        # This should return true because the voter has voted.
        self.assertTrue(self.court.hasVoted(voter, motion_id))

        # And false when they cancel their vote.
        self.court.cancelVote(voter, motion_id)
        self.assertFalse(self.court.hasVoted(voter, motion_id))

        # And true again if they vote against.
        self.court.voteFor(voter, motion_id)
        self.assertTrue(self.court.hasVoted(voter, motion_id))

    def test_motionPasses(self):
        owner = self.court.owner()
        accounts = fresh_accounts(11)
        suspect = accounts[0]
        voters = accounts[1:]
        required_participation = self.court.requiredParticipation()
        required_majority = self.court.requiredMajority()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        tokens = self.havven.totalSupply() // 20

        # Give 1/20th of the token supply to each of our 10 voters. In total 50% of tokens distributed.
        for voter in voters:
            self.havven.endow(owner, voter, tokens)
            self.assertEqual(self.havven.balanceOf(voter), tokens)

        # Fast forward to update the vote weights.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Begin a confiscation motion against the suspect.
        motion_id = self.get_motion_index(self.court.beginMotion(owner, suspect))
        self.assertFalse(self.court.motionPasses(motion_id))

        fast_forward(self.court.motionStartTime(motion_id) - block_time() + 1)

        # 100% in favour and 0% against (50% participation).
        for voter in voters:
            self.court.voteFor(voter, motion_id)
        self.assertTrue(self.court.motionPasses(motion_id))
        self.assertEqual(self.court.votesFor(motion_id), self.havven.totalSupply() // 2)

        # All cancel votes.
        for voter in voters:
            self.court.cancelVote(voter, motion_id)
        self.assertFalse(self.court.motionPasses(motion_id))
        self.assertEqual(self.court.votesFor(motion_id), 0)

        # 100% against and 0% in favour (50% participation).
        for voter in voters:
            self.court.voteAgainst(voter, motion_id)
        self.assertFalse(self.court.motionPasses(motion_id))
        self.assertEqual(self.court.votesAgainst(motion_id), self.havven.totalSupply() // 2)

        # All cancel votes.
        for voter in voters:
            self.court.cancelVote(voter, motion_id)
        self.assertEqual(self.court.votesAgainst(motion_id), 0)

        # 60% in favour and 0% against (30% participation)
        for voter in voters[:6]:
            self.court.voteFor(voter, motion_id)

        # Required participation must be > than 30%.
        self.assertFalse(self.court.motionPasses(motion_id))

        # But if another user votes in favour, participation = 35% which is sufficient for a vote to pass.
        self.court.voteFor(voters[7], motion_id)
        self.assertTrue(self.court.motionPasses(motion_id))

        # The last 3 vote against, 70% in favour and 30% against (required majority is 2/3).
        for voter in voters[8:]:
            self.court.voteAgainst(voter, motion_id)
        self.assertTrue(self.court.motionPasses(motion_id))

        # If one changes their vote for to against, should not pass since 60% in favour 40% against (less than the min required majority of 2/3).
        self.court.cancelVote(voters[7], motion_id)
        self.court.voteAgainst(voters[7], motion_id)
        self.assertFalse(self.court.motionPasses(motion_id))

    def test_beginMotion(self):
        owner = self.court.owner()
        accounts = fresh_accounts(6)[1:]
        insufficient_standing = accounts[0]
        sufficient_standing = accounts[1]
        voter = accounts[2]
        suspects = accounts[3:]
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        controlling_share = self.havven.totalSupply() // 2

        # Assert that accounts are unique.
        l = [owner] + accounts
        for i in range(len(l)):
            for j in range(len(l)):
                if j == i:
                    continue
                self.assertNotEqual(l[i], l[j])

        # Give 50% of the havven tokens to voter, enough to pass a confiscation motion on their own.
        self.havven.endow(owner, voter, controlling_share)
        self.assertEqual(self.havven.balanceOf(voter), controlling_share)

        # Fast forward to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        self.havven.endow(owner, insufficient_standing, 99 * UNIT)
        self.havven.endow(owner, sufficient_standing, 100 * UNIT)

        # Must have at least 100 havvens to begin a confiscation motion.
        self.assertReverts(self.court.beginMotion, insufficient_standing, suspects[0])
        tx_receipt = self.court.beginMotion(sufficient_standing, suspects[0])

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[-1])['event'], "MotionBegun")
        motion_id_0 = self.get_motion_index(tx_receipt)
        fast_forward(self.court.motionStartTime(motion_id_0) - block_time() + 1)

        self.assertTrue(self.court.motionVoting(motion_id_0))

        # Initial vote balances should be zero.
        self.assertEqual(self.court.votesFor(motion_id_0), 0)
        self.assertEqual(self.court.votesAgainst(motion_id_0), 0)

        self.court.voteFor(voter, motion_id_0)

        # The contract owner can also begin a motion, regardless of the token requirement.
        motion_id_1 = self.court.beginMotion(owner, suspects[1])

        # Cannot open multiple confiscation motions on one suspect.
        self.assertReverts(self.court.beginMotion, owner, suspects[0])
        fast_forward(voting_period)
        self.court.approveMotion(owner, motion_id_0)
        self.assertTrue(self.nomin.frozen(suspects[0]))

        # Cannot open a vote on an account that has already been frozen.
        self.assertReverts(self.court.beginMotion, owner, suspects[0])

    def test_setupVote(self):
        owner = self.court.owner()
        non_voter, voter, suspect = fresh_accounts(3)
        voter_weight = 50 * UNIT

        # Give the voter some voting weight.
        self.havven.endow(owner, voter, voter_weight)
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Start the vote itself
        motion_id = self.startVotingPeriod(owner, suspect)

        # Zero-weight voters should not be able to cast votes.
        self.assertEqual(self.court.voteWeight(non_voter, motion_id), 0)
        self.assertReverts(self.court.setupVote, non_voter, motion_id)

        # Test that internal function properly updates state
        self.assertEqual(self.court.voteWeight(voter, motion_id), 0)
        self.assertEqual(self.court.vote(voter, motion_id), 0)
        self.assertTrue(self.court.motionVoting(motion_id))
        self.assertFalse(self.court.hasVoted(voter, motion_id))
        tx_receipt = self.court.setupVote(voter, motion_id)
        # Additionally ensure that the vote recomputed the voter's fee totals.
        self.assertClose(self.havven.lastAverageHavvenBalance(voter), voter_weight)
        self.assertClose(self.court.voteWeight(voter, motion_id), voter_weight)
        self.assertClose(int(tx_receipt.logs[-1].data, 16), voter_weight)

        # If already voted, cannot setup again
        self.court.voteFor(voter, motion_id)
        self.assertReverts(self.court.setupVote, voter, motion_id)

    def test_voteFor(self):
        owner = self.court.owner()
        voter, no_tokens, suspect = fresh_accounts(3)
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Give some havven tokens to our voter.
        self.havven.endow(owner, voter, 1000)
        self.assertEqual(self.havven.balanceOf(voter), 1000)

        # Cannot vote unless there is a confiscation motion.
        self.assertReverts(self.court.voteFor, voter, 10)

        # Fast forward to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Begin a confiscation motion against the suspect.
        motion_id = self.startVotingPeriod(owner, suspect)
        self.assertTrue(self.court.motionVoting(motion_id))

        # Cast a vote in favour of confiscation.
        tx_receipt = self.court.voteFor(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[-1])['event'], "VotedFor")

        # And that the totals have been updated properly.
        self.assertEqual(self.court.votesFor(motion_id), 1000)
        self.assertEqual(self.court.voteWeight(voter, motion_id), 1000)
        self.assertEqual(self.court.vote(voter, motion_id), 1)

        # It should not be possible to cast a repeat vote without cancelling first.
        self.assertReverts(self.court.voteFor, voter, motion_id)
        self.assertReverts(self.court.voteAgainst, voter, motion_id)

        # It should not be possible to vote without any vote weight.
        self.assertReverts(self.court.voteFor, no_tokens, motion_id)

        # And a target should not be able to vote for themself.
        self.assertReverts(self.court.voteFor, suspect, motion_id)

    def test_voteAgainst(self):
        owner = self.court.owner()
        voter, no_tokens, suspect = fresh_accounts(3)
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Give some havven tokens to our voter.
        self.havven.endow(owner, voter, 1000)
        self.assertEqual(self.havven.balanceOf(voter), 1000)

        # Cannot vote unless there is a confiscation motion.
        self.assertReverts(self.court.voteAgainst, voter, 10)

        # Fast forward two fee periods to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Begin a confiscation motion against the suspect.
        motion_id = self.startVotingPeriod(owner, suspect)
        self.assertTrue(self.court.motionVoting(motion_id))

        # Cast a vote against confiscation.
        tx_receipt = self.court.voteAgainst(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[-1])['event'], "VotedAgainst")

        # And that the totals have been updated properly.
        self.assertEqual(self.court.votesAgainst(motion_id), 1000)
        self.assertEqual(self.court.voteWeight(voter, motion_id), 1000)
        self.assertEqual(self.court.vote(voter, motion_id), 2)

        # It should not be possible to cast a repeat vote without cancelling first.
        self.assertReverts(self.court.voteFor, voter, motion_id)
        self.assertReverts(self.court.voteAgainst, voter, motion_id)

        # It should not be possible to vote without any vote weight.
        self.assertReverts(self.court.voteAgainst, no_tokens, motion_id)

        # And a target should not be able to vote against themself.
        self.assertReverts(self.court.voteAgainst, suspect, motion_id)

    def test_cancelVote(self):
        owner = self.court.owner()
        voter, voter2, suspect = fresh_accounts(3)
        voting_period = self.court.votingPeriod()
        confirmation_period = self.court.confirmationPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Give some havven tokens to our voter.
        self.havven.endow(owner, voter, 1000)
        self.havven.endow(owner, voter2, 1000)
        self.assertEqual(self.havven.balanceOf(voter), 1000)
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Begin a confiscation motion against the suspect.
        motion_id = self.startVotingPeriod(owner, suspect)

        # Cast a vote in favour of confiscation.
        self.court.voteFor(voter, motion_id)
        self.assertEqual(self.court.votesFor(motion_id), 1000)
        tx_receipt = self.court.cancelVote(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "VoteCancelled")
        self.assertEqual(self.court.votesFor(motion_id), 0)
        self.assertEqual(self.court.vote(voter, motion_id), 0)

        # Cast a vote against confiscation.
        self.court.voteAgainst(voter, motion_id)
        self.assertEqual(self.court.votesAgainst(motion_id), 1000)
        self.court.cancelVote(voter, motion_id)
        self.assertEqual(self.court.votesAgainst(motion_id), 0)
        self.assertEqual(self.court.vote(voter, motion_id), 0)
        self.assertEqual(self.court.voteWeight(voter, motion_id), 0)

        # We should be able to re-vote after cancelling, both for and against.
        self.court.voteFor(voter2, motion_id)
        self.court.cancelVote(voter2, motion_id)
        self.court.voteAgainst(voter2, motion_id)
        self.court.cancelVote(voter2, motion_id)
        self.court.voteFor(voter2, motion_id)

        # Cannot cancel a vote during the confirmation period.
        self.court.voteFor(voter, motion_id)
        self.assertEqual(self.court.vote(voter2, motion_id), 1)
        fast_forward(voting_period)
        self.assertReverts(self.court.cancelVote, voter, motion_id)
        self.assertEqual(self.court.vote(voter, motion_id), 1)

        # Can cancel it after the confirmation period.
        fast_forward(confirmation_period)
        self.court.cancelVote(voter, motion_id)
        self.assertEqual(self.court.vote(voter, motion_id), 0)
        self.assertEqual(self.court.voteWeight(voter, motion_id), 0)

        # And after the vote has been closed.
        self.court.closeMotion(voter2, motion_id)
        self.court.cancelVote(voter2, motion_id)
        self.assertEqual(self.court.vote(voter2, motion_id), 0)
        self.assertEqual(self.court.voteWeight(voter2, motion_id), 0)

    def test_closeMotion(self):
        owner = self.court.owner()
        voter, suspect = fresh_accounts(2)
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Give some havven tokens to our voter.
        self.havven.endow(owner, voter, 1000)

        # Fast forward one fee period to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        self.havven.recomputeAccountLastHavvenAverageBalance(voter, voter)
        motion_id = self.startVotingPeriod(owner, suspect)

        # Should not be able to close vote in the voting period.
        self.assertReverts(self.court.closeMotion, voter, motion_id)

        fast_forward(voting_period + 1)

        self.assertTrue(self.court.motionConfirming(motion_id))
        tx_receipt = self.court.closeMotion(voter, motion_id)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionClosed")

        fast_forward(fee_period + 1)

        # Start another confiscation motion.
        motion_id = self.startVotingPeriod(owner, suspect)

        self.court.voteFor(voter, motion_id)
        fast_forward(voting_period)

        # After vote has closed, voteStarTimes and votesFor/votesAgainst should be 0 and suspect should be waiting.
        self.court.closeMotion(voter, motion_id)
        self.assertEqual(self.court.targetMotionID(suspect), 0)
        self.assertEqual(self.court.motionTarget(motion_id), ZERO_ADDRESS)
        self.assertEqual(self.court.votesFor(motion_id), 0)
        self.assertEqual(self.court.votesAgainst(motion_id), 0)
        self.assertEqual(self.court.motionStartTime(motion_id), 0)
        self.assertTrue(self.court.motionWaiting(motion_id))

    def test_approveMotion(self):
        owner = self.court.owner()
        _, voter, guilty = fresh_accounts(3)
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        controlling_share = self.havven.totalSupply() // 2

        self.assertNotEqual(owner, voter)
        self.assertNotEqual(owner, guilty)
        self.assertNotEqual(voter, guilty)

        # Give 50% of all havven tokens to our voter.
        self.havven.endow(owner, voter, controlling_share)

        # Fast forward two fee periods to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        motion_id = self.startVotingPeriod(owner, guilty)

        # Cast a vote in favour of confiscation.
        tx_receipt = self.court.voteFor(voter, motion_id)

        # It should not be possible to approve in the voting state.
        self.assertReverts(self.court.approveMotion, owner, motion_id)
        fast_forward(voting_period)
        self.assertTrue(self.court.motionConfirming(motion_id))

        # Only the owner can approve the confiscation of a balance.
        self.assertReverts(self.court.approveMotion, voter, motion_id)
        tx_receipt = self.court.approveMotion(owner, motion_id)

        self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])['event'], "AccountFrozen")
        self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[1])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[2])['event'], "MotionClosed")
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[3])['event'], "MotionApproved")
        self.assertEqual(self.court.motionStartTime(motion_id), 0)
        self.assertEqual(self.court.votesFor(motion_id), 0)

        # After confiscation, their nomin balance should be frozen.
        self.assertTrue(self.nomin.frozen(guilty))

    def test_vetoMotion(self):
        owner = self.court.owner()
        voter, acquitted = fresh_accounts(2)
        voting_period = self.court.votingPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        controlling_share = self.havven.totalSupply() // 2
        self.havven.endow(owner, voter, controlling_share)

        # Fast forward two fee periods to update the voter's weight.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Cannot veto when there is no vote in progress.
        self.assertReverts(self.court.vetoMotion, owner, 10)
        motion_id = self.startVotingPeriod(owner, acquitted)

        # Only owner can veto.
        self.assertReverts(self.court.vetoMotion, DUMMY, motion_id)
        self.court.vetoMotion(owner, motion_id)

        # After veto motion, suspect should be back in the waiting stage.
        self.assertTrue(self.court.motionWaiting(motion_id))
        motion_id_2 = self.startVotingPeriod(owner, acquitted)
        self.assertNotEqual(motion_id, motion_id_2)
        self.court.voteFor(voter, motion_id_2)
        self.assertTrue(self.court.motionPasses(motion_id_2))
        fast_forward(voting_period)
        self.assertTrue(self.court.motionConfirming(motion_id_2))

        # Once a vote has been passed, the owner can veto it.
        tx_receipt = self.court.vetoMotion(owner, motion_id_2)

        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[0])['event'], "MotionClosed")
        self.assertEqual(get_event_data_from_log(self.court_event_dict, tx_receipt.logs[1])['event'], "MotionVetoed")

        # After veto motion, suspect should be back in the waiting stage.
        self.assertTrue(self.court.motionWaiting(motion_id))
        self.assertTrue(self.court.motionWaiting(motion_id_2))

        # Votes should be reset.
        self.assertEqual(self.court.motionStartTime(motion_id), 0)
        self.assertEqual(self.court.votesFor(motion_id), 0)
        self.assertEqual(self.court.votesAgainst(motion_id), 0)
        self.assertTrue(self.court.motionWaiting(motion_id))
        self.assertEqual(self.court.motionStartTime(motion_id_2), 0)
        self.assertEqual(self.court.votesFor(motion_id_2), 0)
        self.assertEqual(self.court.votesAgainst(motion_id_2), 0)
        self.assertTrue(self.court.motionWaiting(motion_id_2))

    def test_multi_vote(self):
        owner = self.court.owner()
        voting_period = self.court.votingPeriod()
        confirmation_period = self.court.confirmationPeriod()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        required_participation = self.court.requiredParticipation() / self.unit
        required_majority = self.court.requiredMajority() / self.unit

        # Generate a bunch of voters with equal voting power
        num_voters = 50
        num_targets = 11
        accounts = fresh_accounts(num_voters + num_targets)
        voters, targets = accounts[:num_voters], accounts[num_voters:]
        for voter in voters:
            self.havven.endow(owner, voter, self.havven.totalSupply() // num_voters)

        frozen, unfrozen = [], []

        # Update their fee info.
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        # Run a shitload of votes simultaneously:
        motions = []
        target_index = 0
        motion_id = self.court.nextMotionID()

        # pass (unanimous)
        unanimous_target = targets[target_index]
        frozen.append(unanimous_target)
        tx_receipt = self.court.beginMotion(owner, unanimous_target)
        self.validate_MotionBegun_data(tx_receipt, owner, unanimous_target, motion_id)
        motion_id += 1
        unanimous_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(unanimous_vote)


        # pass (majority)
        majority_target = targets[target_index]
        frozen.append(majority_target)
        tx_receipt = self.court.beginMotion(owner, majority_target)
        self.validate_MotionBegun_data(tx_receipt, owner, majority_target, motion_id)
        motion_id += 1
        majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(majority_vote)


        # pass (bare)
        bare_target = targets[target_index]
        frozen.append(bare_target)
        tx_receipt = self.court.beginMotion(owner, bare_target)
        self.validate_MotionBegun_data(tx_receipt, owner, bare_target, motion_id)
        motion_id += 1
        bare_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(bare_majority_vote)

        # pass (barely enough participation)
        quorum_target = targets[target_index]
        frozen.append(quorum_target)
        tx_receipt = self.court.beginMotion(owner, quorum_target)
        self.validate_MotionBegun_data(tx_receipt, owner, quorum_target, motion_id)
        motion_id += 1
        bare_quorum_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(bare_quorum_vote)

        # fail (just-insufficient participation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        not_quite_quorum_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(not_quite_quorum_vote)

        # fail (zero participation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        zero_participation_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(zero_participation_vote)

        # fail (insufficient majority)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        insufficient_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(insufficient_majority_vote)

        # fail (zero majority)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        no_majority_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(no_majority_vote)

        # fail (timeout)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        timeout_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(timeout_vote)


        # fail (veto during proceedings)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        mid_veto_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(mid_veto_vote)


        # fail (veto during confirmation)
        target = targets[target_index]
        unfrozen.append(target)
        tx_receipt = self.court.beginMotion(owner, target)
        self.validate_MotionBegun_data(tx_receipt, owner, target, motion_id)
        motion_id += 1
        post_veto_vote = self.get_motion_index(tx_receipt)
        target_index += 1
        motions.append(post_veto_vote)

        fast_forward(self.court.motionStartTime(motion_id-1) - block_time() + 1)

        # All these motions should now be voting.
        for motion in motions:
            self.assertTrue(self.court.motionVoting(motion))

        # Have all voters vote proportionally on every target
        for voter in voters:
            self.court.voteFor(voter, unanimous_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, unanimous_vote))

        n_yeas = int(num_voters * 0.67) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.court.voteFor(voter, majority_vote)
        for voter in nays:
            self.court.voteAgainst(voter, majority_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, majority_vote))

        n_yeas = int(num_voters * required_majority) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.court.voteFor(voter, bare_majority_vote)
        for voter in nays:
            self.court.voteAgainst(voter, bare_majority_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, bare_majority_vote))

        bare_quorum = int(num_voters * required_participation) + 1
        n_yeas = int(bare_quorum * required_majority) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:bare_quorum]
        for voter in yeas:
            self.court.voteFor(voter, bare_quorum_vote)
        for voter in nays:
            self.court.voteAgainst(voter, bare_quorum_vote)
        for voter in voters[:bare_quorum]:
            self.assertTrue(self.court.hasVoted(voter, bare_quorum_vote))
        for voter in voters[bare_quorum:]:
            self.assertFalse(self.court.hasVoted(voter, bare_quorum_vote))

        not_quite_quorum = int(num_voters * 0.3) - 1
        n_yeas = (not_quite_quorum // 2) + 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:not_quite_quorum]

        fast_forward(self.court.motionStartTime(motion_id) - block_time() + 1)

        for voter in yeas:
            self.court.voteFor(voter, not_quite_quorum_vote)
        for voter in nays:
            self.court.voteAgainst(voter, not_quite_quorum_vote)
        for voter in voters[:not_quite_quorum]:
            self.assertTrue(self.court.hasVoted(voter, not_quite_quorum_vote))
        for voter in voters[not_quite_quorum:]:
            self.assertFalse(self.court.hasVoted(voter, not_quite_quorum_vote))

        for voter in voters:
            self.assertFalse(self.court.hasVoted(voter, zero_participation_vote))

        n_yeas = int(num_voters * 0.66) - 1
        yeas, nays = voters[:n_yeas], voters[n_yeas:]
        for voter in yeas:
            self.court.voteFor(voter, insufficient_majority_vote)
        for voter in nays:
            self.court.voteAgainst(voter, insufficient_majority_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, insufficient_majority_vote))

        for voter in voters:
            self.court.voteAgainst(voter, no_majority_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, no_majority_vote))

        for voter in voters:
            self.court.voteFor(voter, timeout_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, timeout_vote))

        for voter in voters:
            self.court.voteFor(voter, mid_veto_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, mid_veto_vote))

        for voter in voters:
            self.court.voteFor(voter, post_veto_vote)
        for voter in voters:
            self.assertTrue(self.court.hasVoted(voter, post_veto_vote))

        # Fast forward to mid voting period...
        fast_forward(voting_period // 2)
        for motion in motions:
            self.assertTrue(self.court.motionVoting(motion))

        tx_receipt = self.court.vetoMotion(owner, mid_veto_vote)
        self.validate_MotionClosed_data(tx_receipt, 0, mid_veto_vote)
        self.validate_MotionVetoed_data(tx_receipt, 1, mid_veto_vote)
        self.assertTrue(self.court.motionWaiting(mid_veto_vote))

        fast_forward(voting_period // 2 + 1)
        for motion, target in [(unanimous_vote, unanimous_target),
                               (majority_vote, majority_target),
                               (bare_majority_vote, bare_target),
                               (bare_quorum_vote, quorum_target)]:
            self.assertTrue(self.court.motionConfirming(motion))

            yeas = self.court.votesFor(motion)
            nays = self.court.votesAgainst(motion)
            totalVotes = yeas + nays
            self.assertTrue(self.court.motionPasses(motion))

            tx_receipt = self.court.approveMotion(owner, motion)
            self.assertTrue(self.court.motionWaiting(motion))
            self.assertTrue(self.nomin.frozen(target))

            self.validate_Confiscation_data(tx_receipt, 0, target)
            self.validate_MotionClosed_data(tx_receipt, 2, motion)
            self.validate_MotionApproved_data(tx_receipt, 3, motion)

        for motion in [not_quite_quorum_vote, zero_participation_vote,
                       insufficient_majority_vote, no_majority_vote]:
            self.assertTrue(self.court.motionConfirming(motion))
            tx_receipt = self.court.closeMotion(owner, motion)
            self.validate_MotionClosed_data(tx_receipt, 0, motion)
            self.assertTrue(self.court.motionWaiting(motion))

        self.assertTrue(self.court.motionConfirming(post_veto_vote))
        self.assertReverts(self.court.closeMotion, owner, post_veto_vote)
        tx_receipt = self.court.vetoMotion(owner, post_veto_vote)
        self.validate_MotionClosed_data(tx_receipt, 0, post_veto_vote)
        self.validate_MotionVetoed_data(tx_receipt, 1, post_veto_vote)
        self.assertTrue(self.court.motionWaiting(post_veto_vote))

        self.assertTrue(self.court.motionConfirming(timeout_vote))
        self.assertReverts(self.court.closeMotion, owner, timeout_vote)
        fast_forward(confirmation_period + 1)
        self.assertTrue(self.court.motionWaiting(timeout_vote))
        self.court.closeMotion(owner, timeout_vote)
        self.assertTrue(self.court.motionWaiting(timeout_vote))

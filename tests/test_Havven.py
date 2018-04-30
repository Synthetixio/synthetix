import unittest

from utils.deployutils import attempt, mine_txs, fresh_accounts
from utils.testutils import assertClose

from utils.deployutils import W3, UNIT, MASTER, DUMMY, ETHER, fresh_accounts, fresh_account
from utils.deployutils import compile_contracts, attempt_deploy, to_seconds
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time, get_event_data_from_log
from utils.testutils import generate_topic_event_map
from utils.testutils import ZERO_ADDRESS
import time

from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "contracts/Nomin.sol",
                    "contracts/Court.sol", "contracts/HavvenEscrow.sol"]


def deploy_public_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER, MASTER])
    hvn_block = W3.eth.blockNumber
    nomin_contract, nom_txr = attempt_deploy(compiled, 'Nomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])
    escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                 MASTER,
                                                 [MASTER, havven_contract.address])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
           havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    havven_event_dict = generate_topic_event_map(compiled['PublicHavven']['abi'])

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract, escrow_contract, hvn_block, havven_event_dict


def setUpModule():
    print("Testing Havven...")


def tearDownModule():
    print()


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
        # to avoid overflowing in the negative direction (now - targetFeePeriodDuration * 2)
        fast_forward(weeks=102)

        cls.havven_contract, cls.nomin_contract, cls.court_contract, \
            cls.escrow_contract, cls.construction_block, cls.havven_event_dict = deploy_public_havven()

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        
        cls.nomin = PublicNominInterface(cls.nomin_contract)

        cls.initial_time = cls.havven.lastFeePeriodStartTime()
        cls.time_fast_forwarded = 0

        cls.base_havven_price = UNIT

    def test_issue(self):
        self.havven.endow(MASTER, MASTER, 1000 * UNIT)
        self.havven.setWhitelisted(MASTER, MASTER, True)

        self.assertEqual(self.havven.balanceOf(MASTER), 1000 * UNIT)

        # UPDATE PRICE
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        # ISSUE NOMINS

        self.havven.issueNomins(MASTER, 5 * UNIT)

        self.assertEqual(self.nomin_contract.functions.balanceOf(MASTER).call(), 5 * UNIT)

    # def test_issue_against_escrowed(self):



    ###
    # Test inherited Owned - Should be the same test_Owned.py
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.havven.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.owner()
        new_owner = DUMMY

        self.havven.nominateOwner(old_owner, new_owner)
        self.havven.acceptOwnership(new_owner)
        self.assertEqual(self.havven.owner(), new_owner)

        # reset back to old owner
        self.havven.nominateOwner(new_owner, old_owner)
        self.havven.acceptOwnership(old_owner)
        self.assertEqual(self.havven.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.havven.nominateOwner, invalid_account, invalid_account)

    ###
    # Test inherited ExternStateToken
    ###
    # Constuctor
    def test_ExternStateToken_constructor(self):
        total_supply = 10 ** 8 * UNIT
        self.assertEqual(self.havven.name(), "Havven")
        self.assertEqual(self.havven.symbol(), "HAV")
        self.assertEqual(self.havven.totalSupply(), total_supply)
        self.assertEqual(self.havven.balanceOf(self.havven.contract.address), total_supply)

    # Approval
    def test_approve(self):
        owner = MASTER
        spender = DUMMY
        self.havven.approve(owner, spender, UNIT)
        self.assertEqual(self.havven.allowance(owner, spender), UNIT)
        self.havven.approve(owner, spender, 0)
        self.assertEqual(self.havven.allowance(owner, spender), 0)

    #
    ##
    ###
    # Test Havven
    ###
    ###
    # Constructor
    ###
    def test_constructor(self):
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        self.assertEqual(fee_period, to_seconds(weeks=4))
        self.assertGreater(block_time(), 2 * fee_period)
        self.assertEqual(self.havven.MIN_FEE_PERIOD_DURATION_SECONDS(), to_seconds(days=1))
        self.assertEqual(self.havven.MAX_FEE_PERIOD_DURATION_SECONDS(), to_seconds(weeks=26))
        self.assertEqual(self.havven.lastFeesCollected(), 0)
        self.assertEqual(self.havven.nomin(), self.nomin.contract.address)
        self.assertEqual(self.havven.decimals(), 18)

    ###
    # Mappings
    ###
    # currentBalanceSum
    def test_currentBalanceSum(self):
        """
        Testing the value of currentBalanceSum works as intended,
        Further testing involving this and fee collection will be done
        in scenario testing
        """
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        delay = int(fee_period / 10)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)

        start_amt = UNIT * 50
        self.havven.endow(MASTER, alice, start_amt)
        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.currentHavvenBalanceSum(alice), 0)
        start_time = block_time()
        fast_forward(delay)
        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        end_time = block_time()
        balance_sum = (end_time - start_time) * start_amt
        self.assertEqual(
            self.havven.currentHavvenBalanceSum(alice),
            balance_sum
        )
        self.havven.transfer(alice, self.havven.contract.address, start_amt)
        self.assertEqual(self.havven.balanceOf(alice), 0)
        fast_forward(delay)
        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        self.assertClose(
            self.havven.currentHavvenBalanceSum(alice), balance_sum
        )

    # lastAverageBalance
    def test_lastAverageBalance(self):
        # set the block time to be at least 30seconds away from the end of the fee_period
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # fast forward next block with some extra padding
        delay = fee_period + 1
        fast_forward(delay)
        self.havven.rolloverFeePeriod(DUMMY)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)

        start_amt = UNIT * 50

        tx_receipt = self.havven.endow(MASTER, alice, start_amt)
        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.currentHavvenBalanceSum(alice), 0)
        self.assertEqual(self.havven.lastAverageHavvenBalance(alice), 0)
        self.assertEqual(self.havven.lastHavvenTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        fast_forward(delay)
        self.havven.rolloverFeePeriod(DUMMY)
        fast_forward(fee_period // 2)

        tx_receipt = self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        block_number = tx_receipt['blockNumber']

        duration_since_rollover = block_time(block_number) - self.havven.feePeriodStartTime()
        balance_sum = duration_since_rollover * start_amt

        actual = self.havven.currentHavvenBalanceSum(alice)
        expected = balance_sum
        self.assertClose(
            actual, expected
        )

        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining - 5)
        self.havven.transfer(alice, MASTER, start_amt // 2)
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 10)

        self.havven.rolloverFeePeriod(alice)
        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)

        actual = self.havven.lastAverageHavvenBalance(alice)
        expected = (start_amt * delay) // (self.havven.feePeriodStartTime() - self.havven.lastFeePeriodStartTime())
        self.assertClose(
            actual, expected
        )

    def test_lastAverageBalanceFullPeriod(self):
        alice = fresh_account()
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Alice will initially have 20 havvens
        self.havven.endow(MASTER, alice, 20 * UNIT)
        self.assertEqual(self.havven.balanceOf(alice), 20 * UNIT)

        # Fastforward until just before a fee period rolls over.
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        tx_receipt = self.havven.transfer(alice, alice, 0)
        self.assertEqual(self.havven.lastHavvenTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        # roll over the full period
        fast_forward(fee_period + 50)
        tx_receipt = self.havven.transfer(alice, alice, 0)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        self.assertEqual(self.havven.lastHavvenTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        self.assertEqual(self.havven.lastAverageHavvenBalance(alice), 20 * UNIT)

        # Try a half-and-half period
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        self.havven.transfer(alice, MASTER, 10 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        fast_forward(fee_period // 2)
        tx_receipt = self.havven.transfer(alice, MASTER, 10 * UNIT)
        fast_forward(fee_period // 2 + 10)
        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        self.assertClose(self.havven.lastAverageHavvenBalance(alice), 5 * UNIT)

    def test_arithmeticSeriesBalance(self):
        alice = fresh_account()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        n = 50

        self.havven.endow(MASTER, alice, n * UNIT)
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 5)

        for _ in range(n):
            self.havven.transfer(alice, MASTER, UNIT)
            fast_forward(fee_period // n)

        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        self.assertClose(self.havven.lastAverageHavvenBalance(alice), n * (n - 1) * UNIT // (2 * n))

    def test_averageBalanceSum(self):
        alice, bob, carol = fresh_accounts(3)
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        self.havven.endow(MASTER, alice, UNIT)
        
        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriod(DUMMY)

        self.havven.transfer(alice, bob, UNIT // 4)
        self.havven.transfer(alice, carol, UNIT // 4)
        fast_forward(fee_period // 10)
        self.havven.transfer(bob, carol, UNIT // 4)
        fast_forward(fee_period // 10)
        self.havven.transfer(carol, bob, UNIT // 2)
        fast_forward(fee_period // 10)
        self.havven.transfer(bob, alice, UNIT // 4)
        fast_forward(2 * fee_period // 10)
        self.havven.transfer(alice, bob, UNIT // 3)
        self.havven.transfer(alice, carol, UNIT // 3)
        fast_forward(3 * fee_period // 10)
        self.havven.transfer(carol, bob, UNIT // 3)
        fast_forward(3 * fee_period // 10)

        self.havven.recomputeAccountLastHavvenAverageBalance(alice, alice)
        self.havven.recomputeAccountLastHavvenAverageBalance(carol, bob)
        self.havven.recomputeAccountLastHavvenAverageBalance(carol, carol)

        total_average = self.havven.lastAverageHavvenBalance(alice) + \
                        self.havven.lastAverageHavvenBalance(bob) + \
                        self.havven.lastAverageHavvenBalance(carol)

        self.assertClose(UNIT, total_average)

    # lastTransferTimestamp - tested above
    # hasWithdrawnLastPeriodFees - tested in test_FeeCollection.py
    # lastFeesCollected - tested in test_FeeCollection.py

    ###
    # Contract variables
    ###
    # feePeriodStartTime - tested above
    # targetFeePeriodDurationSeconds - tested above
    # MIN_FEE_PERIOD_DURATION_SECONDS - constant, checked in constructor test

    ###
    # Functions
    ###

    # setNomin
    def test_setNomin(self):
        alice = fresh_account()
        self.havven.setNomin(MASTER, alice)
        self.assertEqual(self.havven.nomin(), alice)

    def test_invalidSetNomin(self):
        alice = fresh_account()
        self.assertReverts(self.havven.setNomin, alice, alice)

    # setEscrow
    def test_setEscrow(self):
        alice = fresh_account()
        self.havven.setEscrow(MASTER, alice)
        self.assertEqual(self.havven.escrow(), alice)

    def test_invalidSetEscrow(self):
        alice = fresh_account()
        self.assertReverts(self.havven.setEscrow, alice, alice)

    # setTargetFeePeriod
    def test_setTargetFeePeriod(self):
        self.havven.setTargetFeePeriodDuration(MASTER, to_seconds(weeks=10))
        self.assertEqual(
            self.havven.targetFeePeriodDurationSeconds(),
            to_seconds(weeks=10)
        )

    def test_setTargetFeePeriod_max(self):
        sixmonths = 26 * 7 * 24 * 60 * 60
        self.assertReverts(self.havven.setTargetFeePeriodDuration, MASTER, 2 ** 256 - 1)
        self.assertReverts(self.havven.setTargetFeePeriodDuration, MASTER, sixmonths + 1)
        self.havven.setTargetFeePeriodDuration(MASTER, sixmonths)
        self.assertEqual(
            self.havven.targetFeePeriodDurationSeconds(),
            sixmonths
        )

    def test_setTargetFeePeriod_minimal(self):
        self.havven.setTargetFeePeriodDuration(MASTER, self.havven.MIN_FEE_PERIOD_DURATION_SECONDS())
        self.assertEqual(
            self.havven.targetFeePeriodDurationSeconds(),
            self.havven.MIN_FEE_PERIOD_DURATION_SECONDS()
        )

    def test_setTargetFeePeriod_invalid_below_min(self):
        self.assertReverts(self.havven.setTargetFeePeriodDuration, MASTER, self.havven.MIN_FEE_PERIOD_DURATION_SECONDS() - 1)

    def test_setTargetFeePeriod_invalid_0(self):
        self.assertReverts(self.havven.setTargetFeePeriodDuration, MASTER, self.havven.MIN_FEE_PERIOD_DURATION_SECONDS() - 1)

    # endow
    def test_endow_valid(self):
        amount = 50 * UNIT
        havven_balance = self.havven.balanceOf(self.havven.contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven.contract.address), amount)

    def test_endow_0(self):
        amount = 0
        havven_balance = self.havven.balanceOf(self.havven.contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven.contract.address), amount)

    def test_endow_supply(self):
        amount = self.havven.totalSupply()
        havven_balance = self.havven.balanceOf(self.havven.contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven.contract.address), amount)

    def test_endow_more_than_supply(self):
        amount = self.havven.totalSupply() * 2
        alice = fresh_account()
        self.assertReverts(self.havven.endow, MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_invalid_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.havven.endow, alice, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_contract_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.havven.endow, self.havven.contract.address, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_to_contract(self):
        amount = 50 * UNIT
        self.assertEqual(self.havven.balanceOf(self.havven.contract.address), self.havven.totalSupply())
        self.havven.endow(MASTER, self.havven.contract.address, amount)
        self.assertEqual(self.havven.balanceOf(self.havven.contract.address), self.havven.totalSupply())
        # Balance is not lost (still distributable) if sent to the contract.
        self.havven.endow(MASTER, self.havven.contract.address, amount)

    def test_endow_currentBalanceSum(self):
        amount = 50 * UNIT
        # Force updates.
        self.havven.endow(MASTER, self.havven.contract.address, 0)
        havven_balanceSum = self.havven.currentHavvenBalanceSum(self.havven.contract.address)
        alice = fresh_account()
        fast_forward(seconds=60)
        self.havven.endow(MASTER, alice, amount)
        self.assertGreater(self.havven.currentHavvenBalanceSum(self.havven.contract.address), havven_balanceSum)

    def test_endow_transfers(self):
        alice = fresh_account()
        self.havven.recomputeAccountLastHavvenAverageBalance(MASTER, MASTER)
        tx_receipt = self.havven.endow(MASTER, alice, 50 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'Transfer')

    # transfer
    def test_transferRollsOver(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 50 * UNIT)
        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 100)
        tx_receipt = self.havven.transfer(alice, MASTER, 25 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    # same as test_ExternStateToken
    def test_transfer(self):
        sender, receiver, no_tokens = fresh_accounts(3)
        self.havven.endow(MASTER, sender, 50 * UNIT)
        sender_balance = self.havven.balanceOf(sender)

        receiver_balance = self.havven.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.havven.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.havven.transfer, receiver, sender, value)

        self.havven.transfer(sender, receiver, value)
        self.assertEqual(self.havven.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.havven.balanceOf(sender), sender_balance - value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.havven.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.havven.transfer, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.havven.balanceOf(sender)
        pre_receiver_balance = self.havven.balanceOf(receiver)
        self.havven.transfer(sender, receiver, value)
        self.assertEqual(self.havven.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.havven.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        self.assertEqual(self.havven.balanceOf(no_tokens), 0)
        self.havven.transfer(no_tokens, receiver, value)
        self.assertEqual(self.havven.balanceOf(no_tokens), 0)

    # transferFrom
    def test_transferFromRollsOver(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 50 * UNIT)
        self.havven.approve(alice, MASTER, 25 * UNIT)
        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 100)
        tx_receipt = self.havven.transferFrom(MASTER, alice, MASTER, 25 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    def test_transferFrom(self):
        approver, spender, receiver, no_tokens = fresh_accounts(4)

        self.havven.endow(MASTER, approver, 50 * UNIT)

        approver_balance = self.havven.balanceOf(approver)
        spender_balance = self.havven.balanceOf(spender)
        receiver_balance = self.havven.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.havven.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.havven.transferFrom, spender, approver, receiver, value)

        self.havven.approve(approver, spender, 2 * value)
        self.assertEqual(self.havven.allowance(approver, spender), 2 * value)

        self.assertReverts(self.havven.transferFrom, spender, approver, receiver, 2 * value + 1)
        self.havven.transferFrom(spender, approver, receiver, value)

        self.assertEqual(self.havven.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.havven.balanceOf(spender), spender_balance)
        self.assertEqual(self.havven.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.havven.allowance(approver, spender), value)
        self.assertEqual(self.havven.totalSupply(), total_supply)

        # Empty the account
        self.havven.transferFrom(spender, approver, receiver, value)

        # This account has no tokens
        approver_balance = self.havven.balanceOf(no_tokens)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.havven.allowance(no_tokens, spender), 0)

        self.havven.approve(no_tokens, spender, value)
        self.assertEqual(self.havven.allowance(no_tokens, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.havven.transferFrom, spender, no_tokens, receiver, value)

    def test_double_withdraw_fee(self):
        alice = fresh_account()
        self.havven.withdrawFeeEntitlement(alice)
        self.assertReverts(self.havven.withdrawFeeEntitlement, alice)

    def test_withdraw_multiple_periods(self):
        alice = fresh_account()
        self.havven.withdrawFeeEntitlement(alice)
        fast_forward(self.havven.targetFeePeriodDurationSeconds() * 2)
        self.havven.rolloverFeePeriod(DUMMY)
        self.havven.withdrawFeeEntitlement(alice)
        fast_forward(self.havven.targetFeePeriodDurationSeconds() * 2)
        self.havven.rolloverFeePeriod(DUMMY)

    # adjustFeeEntitlement - tested above
    # rolloverFee - tested above, indirectly

    # withdrawFeeEntitlement - tested in test_FeeCollection.py

    ###
    # Modifiers
    ###
    # postCheckFeePeriodRollover - tested above
    def test_checkFeePeriodRollover_escrow_exists(self):
        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 10)

        pre_feePeriodStartTime = self.havven.feePeriodStartTime()
        # This should work fine.
        self.havven.rolloverFeePeriod(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 10)
        pre_feePeriodStartTime = self.havven.feePeriodStartTime()
        # And so should this
        self.havven.setEscrow(MASTER, ZERO_ADDRESS)
        self.havven.rolloverFeePeriod(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

    def test_abuse_havven_balance(self):
        """Test whether repeatedly moving havvens between two parties will shift averages upwards"""
        alice, bob = fresh_accounts(2)
        amount = UNIT * 100000
        a_sum = 0
        b_sum = 0
        self.havven.endow(MASTER, alice, amount)
        t = block_time()
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(self.havven.currentHavvenBalanceSum(alice), 0)
        for i in range(20):
            self.havven.transfer(alice, bob, amount)
            a_sum += (block_time() - t) * amount
            t = block_time()
            self.assertEqual(self.havven.balanceOf(bob), amount)
            self.assertEqual(self.havven.currentHavvenBalanceSum(alice), a_sum)
            self.havven.transfer(bob, alice, amount)
            b_sum += (block_time() - t) * amount
            t = block_time()
            self.assertEqual(self.havven.balanceOf(alice), amount)
            self.assertEqual(self.havven.currentHavvenBalanceSum(bob), b_sum)

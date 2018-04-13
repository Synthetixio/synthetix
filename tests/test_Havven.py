import unittest

from utils.deployutils import attempt, mine_txs, fresh_accounts
from utils.testutils import assertClose

from utils.deployutils import W3, UNIT, MASTER, DUMMY, ETHER
from utils.deployutils import compile_contracts, attempt_deploy
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time
from utils.testutils import generate_topic_event_map
from utils.testutils import ZERO_ADDRESS
import time

from tests.contract_interfaces.havven_interface import PublicHavvenInterface


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
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 1)
        self.havven.recomputeAccountLastHavvenAverageBalance(MASTER, MASTER)

    def _test_time_elapsed(self):
        return utils.testutils.time_fast_forwarded + (round(time.time()) - self.initial_time)

    def now_block_time(self):
        return block_time() + self._test_time_elapsed()

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

        cls.initial_time = cls.havven.lastFeePeriodStartTime()
        cls.time_fast_forwarded = 0

        cls.base_havven_price = UNIT

    def test_scenario(self):
        alice, bob = fresh_accounts(2)
        self.havven.endow(MASTER, alice, 1000 * UNIT)
        self.havven.setWhitelisted(MASTER, alice, True)

        self.assertEqual(self.havven.balanceOf(alice), 1000 * UNIT)

        # UPDATE PRICE
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        # ISSUE NOMINS

        self.havven.issueNomins(alice, 5 * UNIT)

        self.assertEqual(self.nomin_contract.functions.balanceOf(alice).call(), 5 * UNIT)

    '''
    def start_new_fee_period(self):
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 1)
        self._checkFeePeriodRollover(MASTER)

    ###
    # Test inherited Owned - Should be the same test_Owned.py
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.h_owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.h_owner()
        new_owner = DUMMY

        self.h_nominateOwner(old_owner, new_owner)
        self.h_acceptOwnership(new_owner)
        self.assertEqual(self.h_owner(), new_owner)

        # reset back to old owner
        self.h_nominateOwner(new_owner, old_owner)
        self.h_acceptOwnership(old_owner)
        self.assertEqual(self.h_owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.h_nominateOwner, invalid_account, invalid_account)

    ###
    # Test inherited ExternStateToken
    ###
    # Constuctor
    def test_ExternStateToken_constructor(self):
        total_supply = 10 ** 8 * UNIT
        self.assertEqual(self.name(), "Havven")
        self.assertEqual(self.symbol(), "HAV")
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.balanceOf(self.havven.address), total_supply)

    # Approval
    def test_approve(self):
        owner = MASTER
        spender = DUMMY
        self.approve(owner, spender, UNIT)
        self.assertEqual(self.allowance(owner, spender), UNIT)
        self.approve(owner, spender, 0)
        self.assertEqual(self.allowance(owner, spender), 0)

    #
    ##
    ###
    # Test Havven
    ###
    ###
    # Constructor
    ###
    def test_constructor(self):
        fee_period = self.targetFeePeriodDurationSeconds()
        self.assertEqual(fee_period, to_seconds(weeks=4))
        self.assertGreater(block_time(), 2 * fee_period)
        self.assertEqual(self.MIN_FEE_PERIOD_DURATION_SECONDS(), to_seconds(days=1))
        self.assertEqual(self.MAX_FEE_PERIOD_DURATION_SECONDS(), to_seconds(weeks=26))
        self.assertEqual(self.lastFeesCollected(), 0)
        self.assertEqual(self.get_nomin(), self.nomin.address)
        self.assertEqual(self.havven.functions.decimals().call(), 18)

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
        fee_period = self.targetFeePeriodDurationSeconds()
        delay = int(fee_period / 10)
        alice = fresh_account()
        self.assertEqual(self.balanceOf(alice), 0)

        start_amt = UNIT * 50
        self.endow(MASTER, alice, start_amt)
        self.assertEqual(self.balanceOf(alice), start_amt)
        self.assertEqual(self.currentBalanceSum(alice), 0)
        start_time = block_time()
        fast_forward(delay)
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))
        end_time = block_time()
        balance_sum = (end_time - start_time) * start_amt
        self.assertEqual(
            self.currentBalanceSum(alice),
            balance_sum
        )
        self.transfer(alice, self.havven.address, start_amt)
        self.assertEqual(self.balanceOf(alice), 0)
        fast_forward(delay)
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))
        self.assertClose(
            self.currentBalanceSum(alice), balance_sum
        )

    # lastAverageBalance
    def test_lastAverageBalance(self):
        # set the block time to be at least 30seconds away from the end of the fee_period
        fee_period = self.targetFeePeriodDurationSeconds()
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        if time_remaining < 30:
            fast_forward(50)
            time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()

        # fast forward next block with some extra padding
        delay = time_remaining + 100
        alice = fresh_account()
        self.assertEqual(self.balanceOf(alice), 0)

        start_amt = UNIT * 50

        tx_receipt = self.endow(MASTER, alice, start_amt)
        self.assertEqual(self.balanceOf(alice), start_amt)
        self.assertEqual(self.currentBalanceSum(alice), 0)
        self.assertEqual(self.lastAverageBalance(alice), 0)
        self.assertEqual(self.lastTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        fast_forward(delay)
        self._checkFeePeriodRollover(DUMMY)
        fast_forward(fee_period // 2)

        tx_receipt = self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))
        block_number = tx_receipt['blockNumber']

        duration_since_rollover = block_time(block_number) - self.feePeriodStartTime()
        balance_sum = duration_since_rollover * start_amt

        actual = self.currentBalanceSum(alice)
        expected = balance_sum
        self.assertClose(
            actual, expected
        )

        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining - 5)
        self.transfer(alice, MASTER, start_amt // 2)
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 10)

        actual = self.lastAverageBalance(alice)
        expected = (start_amt * delay) // (self.feePeriodStartTime() - self.lastFeePeriodStartTime())
        self.assertClose(
            actual, expected
        )

    def test_lastAverageBalanceFullPeriod(self):
        alice = fresh_account()
        fee_period = self.targetFeePeriodDurationSeconds()

        # Alice will initially have 20 havvens
        self.endow(MASTER, alice, 20 * UNIT)
        self.assertEqual(self.balanceOf(alice), 20 * UNIT)

        # Fastforward until just before a fee period rolls over.
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        tx_receipt = self.transfer(alice, alice, 0)
        self.assertEqual(self.lastTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        # roll over the full period
        fast_forward(fee_period + 50)
        tx_receipt = self.transfer(alice, alice, 0)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        self.assertEqual(self.lastTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        self.assertEqual(self.lastAverageBalance(alice), 20 * UNIT)

        # Try a half-and-half period
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        self.transfer(alice, MASTER, 10 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        fast_forward(fee_period // 2)
        tx_receipt = self.transfer(alice, MASTER, 10 * UNIT)
        fast_forward(fee_period // 2 + 10)
        self.recomputeLastAverageBalance(alice)
        self.assertClose(self.lastAverageBalance(alice), 5 * UNIT)

    def test_arithmeticSeriesBalance(self):
        alice = fresh_account()
        fee_period = self.targetFeePeriodDurationSeconds()
        n = 50

        self.endow(MASTER, alice, n * UNIT)
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 5)

        for _ in range(n):
            self.transfer(alice, MASTER, UNIT)
            fast_forward(fee_period // n)

        self.recomputeLastAverageBalance(alice)
        self.assertClose(self.lastAverageBalance(alice), n * (n - 1) * UNIT // (2 * n))

    def test_averageBalanceSum(self):
        alice, bob, carol = fresh_accounts(3)
        fee_period = self.targetFeePeriodDurationSeconds()

        self.endow(MASTER, alice, UNIT)

        self.start_new_fee_period()

        self.transfer(alice, bob, UNIT // 4)
        self.transfer(alice, carol, UNIT // 4)
        fast_forward(fee_period // 10)
        self.transfer(bob, carol, UNIT // 4)
        fast_forward(fee_period // 10)
        self.transfer(carol, bob, UNIT // 2)
        fast_forward(fee_period // 10)
        self.transfer(bob, alice, UNIT // 4)
        fast_forward(2 * fee_period // 10)
        self.transfer(alice, bob, UNIT // 3)
        self.transfer(alice, carol, UNIT // 3)
        fast_forward(3 * fee_period // 10)
        self.transfer(carol, bob, UNIT // 3)
        fast_forward(3 * fee_period // 10)

        self.recomputeLastAverageBalance(alice)
        self.recomputeLastAverageBalance(bob)
        self.recomputeLastAverageBalance(carol)

        total_average = self.lastAverageBalance(alice) + \
                        self.lastAverageBalance(bob) + \
                        self.lastAverageBalance(carol)

        self.assertClose(UNIT, total_average)

    # penultimateAverageBalance
    def test_penultimateAverageBalance(self):
        # start a new fee period
        alice = fresh_account()
        fee_period = self.targetFeePeriodDurationSeconds()
        fast_forward(fee_period * 2)
        self._checkFeePeriodRollover(DUMMY)

        # skip to halfway through it
        delay = fee_period // 2
        fast_forward(delay)

        self.assertEqual(self.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.endow(MASTER, alice, start_amt)
        inital_transfer_time = self.lastTransferTimestamp(alice)
        self.assertEqual(self.balanceOf(alice), start_amt)
        self.assertEqual(self.currentBalanceSum(alice), 0)
        self.assertEqual(self.lastAverageBalance(alice), 0)

        # rollover two fee periods without alice doing anything
        fast_forward(fee_period * 2)
        self._checkFeePeriodRollover(DUMMY)

        fast_forward(fee_period * 2)
        self._checkFeePeriodRollover(DUMMY)

        # adjust alice's fee entitlement
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))

        # expected currentBalance sum is balance*(time since start of period)
        actual = self.currentBalanceSum(alice)
        expected = (block_time() - self.feePeriodStartTime()) * start_amt
        self.assertClose(
            actual, expected
        )

        last_period_delay = (self.feePeriodStartTime() - self.lastFeePeriodStartTime())

        actual = self.lastAverageBalance(alice)
        expected = (start_amt * last_period_delay) // last_period_delay
        self.assertClose(
            actual, expected,
            msg='last:'
        )

        delay_from_transfer = self.lastFeePeriodStartTime() - inital_transfer_time
        penultimate_period_duration = self.lastFeePeriodStartTime() - self.penultimateFeePeriodStartTime()

        actual = self.penultimateAverageBalance(alice)
        expected = (start_amt * delay_from_transfer) // penultimate_period_duration
        self.assertClose(
            actual, expected,
            msg='penultimate:'
        )

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
        self.setNomin(MASTER, alice)
        self.assertEqual(self.get_nomin(), alice)

    def test_invalidSetNomin(self):
        alice = fresh_account()
        self.assertReverts(self.setNomin, alice, alice)

    # setEscrow
    def test_setEscrow(self):
        alice = fresh_account()
        self.setEscrow(MASTER, alice)
        self.assertEqual(self.get_escrow(), alice)

    def test_invalidSetEscrow(self):
        alice = fresh_account()
        self.assertReverts(self.setEscrow, alice, alice)

    # setTargetFeePeriod
    def test_setTargetFeePeriod(self):
        self.setTargetFeePeriodDuration(MASTER, to_seconds(weeks=10))
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            to_seconds(weeks=10)
        )

    def test_setTargetFeePeriod_max(self):
        sixmonths = 26 * 7 * 24 * 60 * 60
        self.assertReverts(self.setTargetFeePeriodDuration, MASTER, 2 ** 256 - 1)
        self.assertReverts(self.setTargetFeePeriodDuration, MASTER, sixmonths + 1)
        self.setTargetFeePeriodDuration(MASTER, sixmonths)
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            sixmonths
        )

    def test_setTargetFeePeriod_minimal(self):
        self.setTargetFeePeriodDuration(MASTER, self.MIN_FEE_PERIOD_DURATION_SECONDS())
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            self.MIN_FEE_PERIOD_DURATION_SECONDS()
        )

    def test_setTargetFeePeriod_invalid_below_min(self):
        self.assertReverts(self.setTargetFeePeriodDuration, MASTER, self.MIN_FEE_PERIOD_DURATION_SECONDS() - 1)

    def test_setTargetFeePeriod_invalid_0(self):
        self.assertReverts(self.setTargetFeePeriodDuration, MASTER, self.MIN_FEE_PERIOD_DURATION_SECONDS() - 1)

    # endow
    def test_endow_valid(self):
        amount = 50 * UNIT
        havven_balance = self.balanceOf(self.havven.address)
        alice = fresh_account()
        self.assertEqual(self.balanceOf(alice), 0)
        self.endow(MASTER, alice, amount)
        self.assertEqual(self.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.balanceOf(self.havven.address), amount)

    def test_endow_0(self):
        amount = 0
        havven_balance = self.balanceOf(self.havven.address)
        alice = fresh_account()
        self.assertEqual(self.balanceOf(alice), 0)
        self.endow(MASTER, alice, amount)
        self.assertEqual(self.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.balanceOf(self.havven.address), amount)

    def test_endow_supply(self):
        amount = self.totalSupply()
        havven_balance = self.balanceOf(self.havven.address)
        alice = fresh_account()
        self.assertEqual(self.balanceOf(alice), 0)
        self.endow(MASTER, alice, amount)
        self.assertEqual(self.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.balanceOf(self.havven.address), amount)

    def test_endow_more_than_supply(self):
        amount = self.totalSupply() * 2
        alice = fresh_account()
        self.assertReverts(self.endow, MASTER, alice, amount)
        self.assertEqual(self.balanceOf(alice), 0)

    def test_endow_invalid_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.endow, alice, alice, amount)
        self.assertEqual(self.balanceOf(alice), 0)

    def test_endow_contract_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.endow, self.havven.address, alice, amount)
        self.assertEqual(self.balanceOf(alice), 0)

    def test_endow_to_contract(self):
        amount = 50 * UNIT
        self.assertEqual(self.balanceOf(self.havven.address), self.totalSupply())
        self.endow(MASTER, self.havven.address, amount)
        self.assertEqual(self.balanceOf(self.havven.address), self.totalSupply())
        # Balance is not lost (still distributable) if sent to the contract.
        self.endow(MASTER, self.havven.address, amount)

    def test_endow_currentBalanceSum(self):
        amount = 50 * UNIT
        # Force updates.
        self.endow(MASTER, self.havven.address, 0)
        havven_balanceSum = self.currentBalanceSum(self.havven.address)
        alice = fresh_account()
        fast_forward(seconds=60)
        self.endow(MASTER, alice, amount)
        self.assertGreater(self.currentBalanceSum(self.havven.address), havven_balanceSum)

    def test_endow_transfers(self):
        alice = fresh_account()
        self.recomputeLastAverageBalance(MASTER)
        tx_receipt = self.endow(MASTER, alice, 50 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'Transfer')

    # transfer
    def test_transferRollsOver(self):
        alice = fresh_account()
        self.endow(MASTER, alice, 50 * UNIT)
        fast_forward(seconds=self.targetFeePeriodDurationSeconds() + 100)
        tx_receipt = self.transfer(alice, MASTER, 25 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    # same as test_ExternStateToken
    def test_transfer(self):
        sender, receiver, no_tokens = fresh_accounts(3)
        self.endow(MASTER, sender, 50 * UNIT)
        sender_balance = self.balanceOf(sender)

        receiver_balance = self.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer, receiver, sender, value)

        self.transfer(sender, receiver, value)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.balanceOf(sender), sender_balance - value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.transfer, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.balanceOf(sender)
        pre_receiver_balance = self.balanceOf(receiver)
        self.transfer(sender, receiver, value)
        self.assertEqual(self.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        self.assertEqual(self.balanceOf(no_tokens), 0)
        self.transfer(no_tokens, receiver, value)
        self.assertEqual(self.balanceOf(no_tokens), 0)

    # transferFrom
    def test_transferFromRollsOver(self):
        alice = fresh_account()
        self.endow(MASTER, alice, 50 * UNIT)
        self.approve(alice, MASTER, 25 * UNIT)
        fast_forward(seconds=self.targetFeePeriodDurationSeconds() + 100)
        tx_receipt = self.transferFrom(MASTER, alice, MASTER, 25 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    def test_transferFrom(self):
        approver, spender, receiver, no_tokens = fresh_accounts(4)

        self.endow(MASTER, approver, 50 * UNIT)

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

        self.approve(approver, spender, 2 * value)
        self.assertEqual(self.allowance(approver, spender), 2 * value)

        self.assertReverts(self.transferFrom, spender, approver, receiver, 2 * value + 1)
        self.transferFrom(spender, approver, receiver, value)

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.allowance(approver, spender), value)
        self.assertEqual(self.totalSupply(), total_supply)

        # Empty the account
        self.transferFrom(spender, approver, receiver, value)

        # This account has no tokens
        approver_balance = self.balanceOf(no_tokens)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.allowance(no_tokens, spender), 0)

        self.approve(no_tokens, spender, value)
        self.assertEqual(self.allowance(no_tokens, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom, spender, no_tokens, receiver, value)

    def test_double_withdraw_fee(self):
        alice = fresh_account()
        self.withdrawFeeEntitlement(alice)
        self.assertReverts(self.withdrawFeeEntitlement, alice)

    def test_withdraw_multiple_periods(self):
        alice = fresh_account()
        self.withdrawFeeEntitlement(alice)
        fast_forward(self.targetFeePeriodDurationSeconds() * 2)
        self.rolloverFeePeriod(DUMMY)
        self.withdrawFeeEntitlement(alice)
        fast_forward(self.targetFeePeriodDurationSeconds() * 2)
        self.rolloverFeePeriod(DUMMY)

    # adjustFeeEntitlement - tested above
    # rolloverFee - tested above, indirectly

    # withdrawFeeEntitlement - tested in test_FeeCollection.py

    ###
    # Modifiers
    ###
    # postCheckFeePeriodRollover - tested above
    def test_checkFeePeriodRollover_escrow_exists(self):
        fast_forward(seconds=self.targetFeePeriodDurationSeconds() + 10)

        pre_feePeriodStartTime = self.feePeriodStartTime()
        # This should work fine.
        self._checkFeePeriodRollover(MASTER)
        self.assertGreater(self.feePeriodStartTime(), pre_feePeriodStartTime)

        fast_forward(seconds=self.targetFeePeriodDurationSeconds() + 10)
        pre_feePeriodStartTime = self.feePeriodStartTime()
        # And so should this
        self.setEscrow(MASTER, ZERO_ADDRESS)
        self._checkFeePeriodRollover(MASTER)
        self.assertGreater(self.feePeriodStartTime(), pre_feePeriodStartTime)

    def test_abuse_havven_balance(self):
        """Test whether repeatedly moving havvens between two parties will shift averages upwards"""
        alice, bob = fresh_accounts(2)
        amount = UNIT * 100000
        a_sum = 0
        b_sum = 0
        self.endow(MASTER, alice, amount)
        time = block_time()
        self.assertEqual(self.balanceOf(alice), amount)
        self.assertEqual(self.currentBalanceSum(alice), 0)
        for i in range(20):
            self.transfer(alice, bob, amount)
            a_sum += (block_time() - time) * amount
            time = block_time()
            self.assertEqual(self.balanceOf(bob), amount)
            self.assertEqual(self.currentBalanceSum(alice), a_sum)
            self.transfer(bob, alice, amount)
            b_sum += (block_time() - time) * amount
            time = block_time()
            self.assertEqual(self.balanceOf(alice), amount)
            self.assertEqual(self.currentBalanceSum(bob), b_sum)
    '''
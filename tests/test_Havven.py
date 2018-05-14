import random

from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    mine_txs, attempt,
    fresh_accounts, fresh_account,
    compile_contracts, attempt_deploy,
    take_snapshot, restore_snapshot,
    fast_forward, to_seconds
)
from utils.testutils import (
    HavvenTestCase, block_time,
    get_event_data_from_log, generate_topic_event_map,
    ZERO_ADDRESS
)
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


def setUpModule():
    print("Testing Havven...")


def tearDownModule():
    print()


class TestHavven(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        print("Deployment initiated.\n")

        sources = ["tests/contracts/PublicHavven.sol", "contracts/Nomin.sol",
                   "contracts/Court.sol", "contracts/HavvenEscrow.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        # Deploy contracts
        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['Nomin']['abi'])

        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER, UNIT//2])
        hvn_block = W3.eth.blockNumber
        nomin_contract, nom_txr = attempt_deploy(compiled, 'Nomin',
                                                 MASTER,
                                                 [nomin_proxy.address, havven_contract.address, MASTER, ZERO_ADDRESS])
        court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                                   MASTER,
                                                   [havven_contract.address, nomin_contract.address,
                                                    MASTER])
        escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                     MASTER,
                                                     [MASTER, havven_contract.address])

        # Hook up each of those contracts to each other
        mine_txs([
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})
        ])

        havven_event_dict = generate_topic_event_map(compiled['PublicHavven']['abi'])

        print("\nDeployment complete.\n")
        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, havven_contract, nomin_contract, court_contract, escrow_contract, hvn_block, havven_event_dict

    @classmethod
    def setUpClass(cls):
        # to avoid overflowing in the negative direction (now - targetFeePeriodDuration * 2)
        fast_forward(weeks=102)

        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, \
            cls.havven_contract, cls.nomin_contract, cls.court_contract, \
            cls.escrow_contract, cls.construction_block, cls.havven_event_dict = cls.deployContracts()

        cls.event_map = cls.event_maps['Havven']

        cls.havven = PublicHavvenInterface(cls.havven_contract, "Havven")
        
        cls.nomin = PublicNominInterface(cls.nomin_contract, "Nomin")

        cls.initial_time = cls.havven.lastFeePeriodStartTime()
        cls.time_fast_forwarded = 0

        cls.base_havven_price = UNIT

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
    # Test inherited DestructibleExternStateToken
    ###
    # Constuctor
    def test_DestructibleExternStateToken_constructor(self):
        total_supply = 10 ** 8 * UNIT
        self.assertEqual(self.havven.name(), "Havven")
        self.assertEqual(self.havven.symbol(), "HAV")
        self.assertEqual(self.havven.totalSupply(), total_supply)
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), total_supply)

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
        self.assertEqual(self.havven.nomin(), self.nomin_contract.address)
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
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        self.havven.issueNomins(alice, start_amt)

        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.nomin.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.issuedNominCurrentBalanceSum(alice), 0)
        start_time = block_time()
        fast_forward(delay)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        end_time = block_time()
        balance_sum = (end_time - start_time) * start_amt
        self.assertEqual(
            self.havven.issuedNominCurrentBalanceSum(alice),
            balance_sum
        )
        self.havven.burnNomins(alice, start_amt)
        self.assertEqual(self.nomin.balanceOf(alice), 0)
        fast_forward(delay)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        self.assertClose(
            self.havven.issuedNominCurrentBalanceSum(alice), balance_sum
        )

    # lastAverageBalance
    def test_lastAverageBalance(self):
        # set the block time to be at least 30seconds away from the end of the fee_period
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # fast forward next block with some extra padding
        delay = fee_period + 1
        fast_forward(delay)
        self.havven.checkFeePeriodRollover(DUMMY)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.havven.endow(MASTER, alice, start_amt)
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        tx_receipt = self.havven.issueNomins(alice, start_amt)

        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.issuedNominCurrentBalanceSum(alice), 0)
        self.assertEqual(self.havven.issuedNominLastAverageBalance(alice), 0)
        self.assertEqual(self.havven.issuedNominLastTransferTimestamp(alice), block_time(tx_receipt['blockNumber']))
        fast_forward(delay)
        self.havven.checkFeePeriodRollover(DUMMY)
        fast_forward(fee_period // 2)

        tx_receipt = self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        block_number = tx_receipt['blockNumber']

        duration_since_rollover = block_time(block_number) - self.havven.feePeriodStartTime()
        balance_sum = duration_since_rollover * start_amt

        actual = self.havven.issuedNominCurrentBalanceSum(alice)
        expected = balance_sum
        self.assertClose(
            actual, expected
        )

        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining - 5)
        self.havven.burnNomins(alice, start_amt // 2)
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 10)

        self.havven.checkFeePeriodRollover(alice)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)

        actual = self.havven.issuedNominLastAverageBalance(alice)
        expected = (start_amt * delay) // (self.havven.feePeriodStartTime() - self.havven.lastFeePeriodStartTime())
        self.assertClose(
            actual, expected
        )

    def test_lastAverageBalanceFullPeriod(self):
        alice = fresh_account()
        self.havven.setWhitelisted(MASTER, alice, True)
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        # Alice will initially have 20 havvens
        self.havven.endow(MASTER, alice, 20 * UNIT)
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        self.havven.issueNomins(alice, 20 * UNIT)

        self.assertEqual(self.havven.balanceOf(alice), 20 * UNIT)
        self.assertEqual(self.nomin.balanceOf(alice), 20 * UNIT)

        # Fastforward until just before a fee period rolls over.
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        tx_receipt = self.havven.checkFeePeriodRollover(alice)
        self.havven.updatePrice(MASTER, UNIT, block_time())
        issue_receipt = self.havven.issueNomins(alice, 0) 

        self.assertEqual(self.havven.issuedNominLastTransferTimestamp(alice), block_time(issue_receipt['blockNumber']))
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        # roll over the full period
        fast_forward(fee_period + 50)
        tx_receipt = self.havven.checkFeePeriodRollover(MASTER)
        self.havven.updatePrice(MASTER, UNIT, block_time()+1)
        transfer_receipt = self.havven.issueNomins(alice, 0)

        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        self.assertEqual(self.havven.issuedNominLastTransferTimestamp(alice), block_time(transfer_receipt['blockNumber'])) 
        self.assertEqual(self.havven.issuedNominLastAverageBalance(alice), 20 * UNIT)

        # Try a half-and-half period
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        self.havven.checkFeePeriodRollover(MASTER)
        self.havven.burnNomins(alice, 10 * UNIT)

        fast_forward(fee_period // 2 + 10)
        self.havven.burnNomins(alice, 10 * UNIT)
        self.havven.checkFeePeriodRollover(MASTER)

        fast_forward(fee_period // 2 + 10)

        tx_receipt = self.havven.checkFeePeriodRollover(MASTER)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        self.havven.checkFeePeriodRollover(alice)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        self.assertClose(self.havven.issuedNominLastAverageBalance(alice), 5 * UNIT)

    def test_arithmeticSeriesBalance(self):
        alice = fresh_account()
        fee_period = self.havven.targetFeePeriodDurationSeconds()
        n = 50

        self.havven.endow(MASTER, alice, n * UNIT)
        self.havven.updatePrice(self.havven.oracle(), UNIT, block_time())
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.issueNomins(alice, n * UNIT // 20)
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 5 )
        self.havven.checkFeePeriodRollover(MASTER)

        for _ in range(n):
            self.havven.burnNomins(alice, UNIT // 20) 
            fast_forward(fee_period // n)

        fast_forward(n)  # fast forward allow the rollover to happen
        self.havven.checkFeePeriodRollover(MASTER)

        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        self.assertClose(self.havven.issuedNominLastAverageBalance(alice), n * (n - 1) * UNIT // (2 * n * 20), precision=3)

    def test_averageBalanceSum(self):
        alice, bob, carol = fresh_accounts(3)
        fee_period = self.havven.targetFeePeriodDurationSeconds()

        self.havven.endow(MASTER, alice, UNIT)
        self.havven.endow(MASTER, bob, UNIT)
        self.havven.endow(MASTER, carol, UNIT)

        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.setWhitelisted(MASTER, bob, True)
        self.havven.setWhitelisted(MASTER, carol, True)
        self.havven.setIssuanceRatio(MASTER, UNIT)

        fast_forward(fee_period + 1)
        self.havven.checkFeePeriodRollover(DUMMY)

        for i in range(10):
            self.havven.updatePrice(MASTER, UNIT, block_time() + 1)
            a_weight = random.random()
            b_weight = random.random()
            c_weight = random.random()
            tot = a_weight + b_weight + c_weight

            self.havven.issueNomins(alice, max(1, int(UNIT * a_weight / tot)))
            self.havven.issueNomins(bob, max(1, int(UNIT * b_weight / tot)))
            self.havven.issueNomins(carol, max(1, int(UNIT * c_weight / tot)))
            fast_forward(fee_period // 10 - 1)
            self.havven.burnNomins(alice, max(1, int(UNIT * a_weight / tot)))
            self.havven.burnNomins(bob, max(1, int(UNIT * b_weight / tot)))
            self.havven.burnNomins(carol, max(1, int(UNIT * c_weight / tot)))
        fast_forward(11)
        self.havven.checkFeePeriodRollover(MASTER)

        self.havven.recomputeAccountIssuedNominLastAverageBalance(alice, alice)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(bob, bob)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(carol, carol)

        total_average = self.havven.issuedNominLastAverageBalance(alice) + \
                        self.havven.issuedNominLastAverageBalance(bob) + \
                        self.havven.issuedNominLastAverageBalance(carol)

        self.assertClose(UNIT, total_average, precision=3)

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
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

    def test_endow_0(self):
        amount = 0
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

    def test_endow_supply(self):
        amount = self.havven.totalSupply()
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

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
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), self.havven.totalSupply())
        self.havven.endow(MASTER, self.havven_contract.address, amount)
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), self.havven.totalSupply())
        # Balance is not lost (still distributable) if sent to the contract.
        self.havven.endow(MASTER, self.havven.contract.address, amount)

    def test_endow_transfers(self):
        alice = fresh_account()
        tx_receipt = self.havven.endow(MASTER, alice, 50 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'Transfer')

    # transfer
    def test_transferRollsOver(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 50 * UNIT)
        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 100)
        self.havven.transfer(alice, MASTER, 25 * UNIT)
        tx_receipt = self.havven.checkFeePeriodRollover(MASTER)

        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    # same as test_DestructibleExternStateToken
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
        self.havven.transferFrom(MASTER, alice, MASTER, 25 * UNIT)
        tx_receipt = self.havven.checkFeePeriodRollover(MASTER)

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
        self.havven.checkFeePeriodRollover(DUMMY)
        self.havven.withdrawFeeEntitlement(alice)
        fast_forward(self.havven.targetFeePeriodDurationSeconds() * 2)
        self.havven.checkFeePeriodRollover(DUMMY)

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
        self.havven.checkFeePeriodRollover(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

        fast_forward(seconds=self.havven.targetFeePeriodDurationSeconds() + 10)
        pre_feePeriodStartTime = self.havven.feePeriodStartTime()
        # And so should this
        self.havven.setEscrow(MASTER, ZERO_ADDRESS)
        self.havven.checkFeePeriodRollover(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

    def test_abuse_havven_balance(self):
        # Test whether repeatedly moving havvens between two parties will shift averages upwards
        alice = fresh_account()
        amount = UNIT * 100000
        self.havven.updatePrice(MASTER, UNIT, block_time() + 1)
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        a_sum = 0
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(self.havven.issuedNominCurrentBalanceSum(alice), 0)
        for i in range(20):
            self.havven.issueNomins(alice, amount)
            t = block_time()
            self.assertEqual(self.nomin.balanceOf(alice), amount)
            self.assertEqual(self.havven.issuedNominCurrentBalanceSum(alice), a_sum)
            self.havven.burnNomins(alice, amount)
            a_sum += (block_time() - t) * amount
            self.assertEqual(self.nomin.balanceOf(alice), 0)
            self.assertEqual(self.havven.issuedNominCurrentBalanceSum(alice), a_sum)

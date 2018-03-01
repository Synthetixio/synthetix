import unittest
import time

import utils.generalutils
from utils.testutils import assertReverts, assertClose, block_time
from utils.testutils import ZERO_ADDRESS, generate_topic_event_map, get_event_data_from_log

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, to_seconds, fast_forward, fresh_account, fresh_accounts, take_snapshot, restore_snapshot

SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol", "contracts/HavvenEscrow.sol",
                    "contracts/Proxy.sol", "tests/contracts/PublicHavvenEscrow.sol"]


def deploy_public_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [ZERO_ADDRESS, MASTER])
    hvn_block = W3.eth.blockNumber
    nomin_contract, nom_txr = attempt_deploy(compiled, 'EtherNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000 * UNIT, MASTER, ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])
    escrow_contract, escrow_txr = attempt_deploy(compiled, 'PublicHavvenEscrow',
                                                 MASTER,
                                                 [MASTER, havven_contract.address])

    # Install proxies
    havven_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                     MASTER, [havven_contract.address, MASTER])
    mine_tx(havven_contract.functions.setProxy(havven_proxy.address).transact({'from': MASTER}))
    proxy_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])

    nomin_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                    MASTER, [nomin_contract.address, MASTER])
    mine_tx(nomin_contract.functions.setProxy(nomin_proxy.address).transact({'from': MASTER}))
    proxy_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['EtherNomin']['abi'])

    # Hook up each of those contracts to each other
    txs = [proxy_havven.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           proxy_nomin.functions.setCourt(court_contract.address).transact({'from': MASTER}),
           proxy_havven.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    escrow_event_dict = generate_topic_event_map(compiled['HavvenEscrow']['abi'])

    print("\nDeployment complete.\n")
    return proxy_havven, proxy_nomin, havven_proxy, nomin_proxy, havven_contract, nomin_contract, court_contract, escrow_contract, hvn_block, escrow_event_dict


def setUpModule():
    print("Testing HavvenEscrow...")


def tearDownModule():
    print()


class TestHavvenEscrow(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        utils.generalutils.time_fast_forwarded = 0
        self.initial_time = round(time.time())

    def tearDown(self):
        restore_snapshot(self.snapshot)

    def test_time_elapsed(self):
        return utils.generalutils.time_fast_forwarded + (round(time.time()) - self.initial_time)

    def now_block_time(self):
        return block_time() + self.test_time_elapsed()

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        cls.havven, cls.nomin, cls.havven_proxy, cls.nomin_proxy, cls.havven_real, cls.nomin_real, cls.court, cls.escrow, cls.construction_block, cls.escrow_event_dict = deploy_public_havven()

        cls.initial_time = cls.nomin.functions.lastPriceUpdate().call()

        cls.h_totalSupply = lambda self: cls.havven.functions.totalSupply().call()
        cls.h_targetFeePeriodDurationSeconds = lambda self: cls.havven.functions.targetFeePeriodDurationSeconds().call()
        cls.h_feePeriodStartTime = lambda self: cls.havven.functions.feePeriodStartTime().call()
        cls.h_endow = lambda self, sender, receiver, amt: mine_tx(
            cls.havven.functions.endow(receiver, amt).transact({'from': sender}))
        cls.h_balanceOf = lambda self, account: cls.havven.functions.balanceOf(account).call()
        cls.h_transfer = lambda self, sender, receiver, amt: mine_tx(
            cls.havven.functions.transfer(receiver, amt).transact({'from': sender}))
        cls.h_recomputeLastAverageBalance = lambda self, sender: mine_tx(
            cls.havven.functions.recomputeLastAverageBalance().transact({'from': sender}))
        cls.h_withdrawFeeEntitlement = lambda self, sender: mine_tx(
            cls.havven.functions.withdrawFeeEntitlement().transact({'from': sender}))

        cls.n_updatePrice = lambda self, sender, price, timeSent: mine_tx(
            cls.nomin_real.functions.updatePrice(price, timeSent).transact({'from': sender}))
        cls.n_setTransferFeeRate = lambda self, sender, rate: mine_tx(
            cls.nomin.functions.setTransferFeeRate(rate).transact({'from': sender}))
        cls.n_replenishPool = lambda self, sender, quantity, value: mine_tx(
            cls.nomin.functions.replenishPool(quantity).transact({'from': sender, 'value': value}))
        cls.n_diminishPool = lambda self, sender, quantity: mine_tx(
            cls.nomin.functions.diminishPool(quantity).transact({'from': sender}))
        cls.n_buy = lambda self, sender, quantity, value: mine_tx(
            cls.nomin.functions.buy(quantity).transact({'from': sender, 'value': value}))
        cls.n_sell = lambda self, sender, quantity: mine_tx(
            cls.nomin.functions.sell(quantity).transact({'from': sender}))
        cls.n_purchaseCostEther = lambda self, quantity: cls.nomin.functions.purchaseCostEther(quantity).call()
        cls.n_balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.n_transfer = lambda self, sender, recipient, quantity: mine_tx(
            cls.nomin.functions.transfer(recipient, quantity).transact({'from': sender}))
        cls.n_feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.n_nominPool = lambda self: cls.nomin.functions.nominPool().call()
        cls.n_priceToSpend = lambda self, v: cls.nomin.functions.priceToSpend(v).call()

        cls.owner = lambda self: cls.escrow.functions.owner().call()
        cls.nominateOwner = lambda self, sender, newOwner: mine_tx(
            cls.escrow.functions.nominateOwner(newOwner).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.escrow.functions.acceptOwnership().transact({'from': sender}))

        cls.e_havven = lambda self: cls.escrow.functions.havven().call()
        cls.vestingSchedules = lambda self, account, index, i: cls.escrow.functions.vestingSchedules(account, index,
                                                                                                     i).call()
        cls.numVestingEntries = lambda self, account: cls.escrow.functions.numVestingEntries(account).call()
        cls.getVestingScheduleEntry = lambda self, account, index: cls.escrow.functions.getVestingScheduleEntry(account,
                                                                                                                index).call()
        cls.getVestingTime = lambda self, account, index: cls.escrow.functions.getVestingTime(account, index).call()
        cls.getVestingQuantity = lambda self, account, index: cls.escrow.functions.getVestingQuantity(account,
                                                                                                      index).call()
        cls.totalVestedAccountBalance = lambda self, account: cls.escrow.functions.totalVestedAccountBalance(
            account).call()
        cls.totalVestedBalance = lambda self: cls.escrow.functions.totalVestedBalance().call()
        cls.getNextVestingIndex = lambda self, account: cls.escrow.functions.getNextVestingIndex(account).call()
        cls.getNextVestingEntry = lambda self, account: cls.escrow.functions.getNextVestingEntry(account).call()
        cls.getNextVestingTime = lambda self, account: cls.escrow.functions.getNextVestingTime(account).call()
        cls.getNextVestingQuantity = lambda self, account: cls.escrow.functions.getNextVestingQuantity(account).call()

        cls.setHavven = lambda self, sender, account: mine_tx(
            cls.escrow.functions.setHavven(account).transact({'from': sender}))
        cls.purgeAccount = lambda self, sender, account: mine_tx(
            cls.escrow.functions.purgeAccount(account).transact({'from': sender}))
        cls.withdrawHavvens = lambda self, sender, quantity: mine_tx(
            cls.escrow.functions.withdrawHavvens(quantity).transact({'from': sender}))
        cls.appendVestingEntry = lambda self, sender, account, time, quantity: mine_tx(
            cls.escrow.functions.appendVestingEntry(account, time, quantity).transact({'from': sender}))
        cls.addRegularVestingSchedule = lambda self, sender, account, time, quantity, periods: mine_tx(
            cls.escrow.functions.addRegularVestingSchedule(account, time, quantity, periods).transact({'from': sender}))
        cls.vest = lambda self, sender: mine_tx(cls.escrow.functions.vest().transact({'from': sender}))

    def make_nomin_velocity(self):
        # should produce a 36 * UNIT fee pool
        buyer = fresh_account()
        self.n_updatePrice(MASTER, UNIT, self.now_block_time())
        self.n_setTransferFeeRate(MASTER, UNIT // 100)
        self.n_replenishPool(MASTER, 1000 * UNIT, 2000 * UNIT)
        self.n_buy(buyer, 1000 * UNIT, self.n_purchaseCostEther(1000 * UNIT))
        for i in range(8):
            self.n_transfer(buyer, buyer, (9 - (i + 1)) * 100 * UNIT)
        self.n_sell(buyer, self.n_balanceOf(MASTER))
        self.n_diminishPool(MASTER, self.n_nominPool())

    def test_constructor(self):
        self.assertEqual(self.e_havven(), self.havven_real.address)
        self.assertEqual(self.owner(), MASTER)
        self.assertEqual(self.totalVestedBalance(), 0)

    def test_vestingTimes(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        self.appendVestingEntry(MASTER, alice, times[0], UNIT)
        self.assertEqual(self.getVestingTime(alice, 0), times[0])

        for i in range(1, len(times)):
            self.appendVestingEntry(MASTER, alice, times[i], UNIT)
        for i in range(1, len(times)):
            self.assertEqual(self.getVestingTime(alice, i), times[i])

    def test_vestingQuantities(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        quantities = [UNIT * i for i in range(1, 6)]
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        self.appendVestingEntry(MASTER, alice, times[0], quantities[0])
        self.assertEqual(self.getVestingQuantity(alice, 0), quantities[0])

        for i in range(1, len(times)):
            self.appendVestingEntry(MASTER, alice, times[i], quantities[i])
        for i in range(1, len(times)):
            self.assertEqual(self.getVestingQuantity(alice, i), quantities[i])

    def test_vestingSchedules(self):
        alice = fresh_account()
        time = block_time()
        self.h_endow(MASTER, self.escrow.address, 1500 * UNIT)

        self.appendVestingEntry(MASTER, alice, time + 1000, UNIT)
        self.assertEqual(self.vestingSchedules(alice, 0, 0), time + 1000)
        self.assertEqual(self.vestingSchedules(alice, 0, 1), UNIT)
        self.appendVestingEntry(MASTER, alice, time + 2000, 2 * UNIT)
        self.assertEqual(self.vestingSchedules(alice, 1, 0), time + 2000)
        self.assertEqual(self.vestingSchedules(alice, 1, 1), 2 * UNIT)

    def test_totalVestedAccountBalance(self):
        alice = fresh_account()
        time = block_time()

        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        self.assertEqual(self.totalVestedAccountBalance(alice), 0)
        self.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.assertEqual(self.totalVestedAccountBalance(alice), UNIT)

        self.purgeAccount(MASTER, alice)
        self.assertEqual(self.totalVestedAccountBalance(alice), 0)

        k = 5
        for n in [100 * 2 ** i for i in range(k)]:
            self.appendVestingEntry(MASTER, alice, time + n, n)

        self.assertEqual(self.totalVestedAccountBalance(alice), 100 * (2 ** k - 1))
        fast_forward(110)
        self.vest(alice)
        self.assertEqual(self.totalVestedAccountBalance(alice), 100 * (2 ** k - 1) - 100)

    def test_totalVestedBalance(self):
        alice, bob = fresh_accounts(2)
        time = block_time()

        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        self.assertEqual(self.totalVestedBalance(), 0)
        self.appendVestingEntry(MASTER, bob, time + 100, UNIT)
        self.assertEqual(self.totalVestedBalance(), UNIT)

        self.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.assertEqual(self.totalVestedBalance(), 2 * UNIT)

        self.purgeAccount(MASTER, alice)
        self.assertEqual(self.totalVestedBalance(), UNIT)

        k = 5
        for n in [100 * 2 ** i for i in range(k)]:
            self.appendVestingEntry(MASTER, alice, time + n, n)

        self.assertEqual(self.totalVestedBalance(), UNIT + 100 * (2 ** k - 1))
        fast_forward(110)
        self.vest(alice)
        self.assertEqual(self.totalVestedBalance(), UNIT + 100 * (2 ** k - 1) - 100)

    def test_numVestingEntries(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)

        self.assertEqual(self.numVestingEntries(alice), 0)
        self.appendVestingEntry(MASTER, alice, times[0], UNIT)
        self.assertEqual(self.numVestingEntries(alice), 1)
        self.appendVestingEntry(MASTER, alice, times[1], UNIT)
        self.assertEqual(self.numVestingEntries(alice), 2)
        self.appendVestingEntry(MASTER, alice, times[2], UNIT)
        self.appendVestingEntry(MASTER, alice, times[3], UNIT)
        self.appendVestingEntry(MASTER, alice, times[4], UNIT)
        self.assertEqual(self.numVestingEntries(alice), 5)
        self.purgeAccount(MASTER, alice)
        self.assertEqual(self.numVestingEntries(alice), 0)

    def test_getVestingScheduleEntry(self):
        alice = fresh_account()
        time = block_time()
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        self.appendVestingEntry(MASTER, alice, time + 100, 1);
        self.assertEqual(self.getVestingScheduleEntry(alice, 0), [time + 100, 1])

    def test_getNextVestingIndex(self):
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]

        self.assertEqual(self.getNextVestingIndex(alice), 0)

        for i in range(len(times)):
            self.appendVestingEntry(MASTER, alice, times[i], UNIT)

        for i in range(len(times)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.getNextVestingIndex(alice), i)
            self.vest(alice)
            self.assertEqual(self.getNextVestingIndex(alice), i + 1)

    def test_getNextVestingEntry(self):
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.getNextVestingEntry(alice), [0, 0])

        for i in range(len(entries)):
            self.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.getNextVestingEntry(alice), entries[i])
            self.vest(alice)
            self.assertEqual(self.getNextVestingEntry(alice), [0, 0] if i == len(entries) - 1 else entries[i + 1])

    def test_getNextVestingTime(self):
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.getNextVestingTime(alice), 0)

        for i in range(len(entries)):
            self.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.getNextVestingTime(alice), entries[i][0])
            self.vest(alice)
            self.assertEqual(self.getNextVestingTime(alice), 0 if i == len(entries) - 1 else entries[i + 1][0])

    def test_getNextVestingQuantity(self):
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.getNextVestingQuantity(alice), 0)

        for i in range(len(entries)):
            self.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.getNextVestingQuantity(alice), entries[i][1])
            self.vest(alice)
            self.assertEqual(self.getNextVestingQuantity(alice), 0 if i == len(entries) - 1 else entries[i + 1][1])

    def test_setHavven(self):
        alice = fresh_account()
        self.setHavven(MASTER, alice)
        self.assertEqual(self.e_havven(), alice)
        self.assertReverts(self.setHavven, alice, alice)

    def test_escrowedFees(self):
        self.h_endow(MASTER, self.escrow.address, self.h_totalSupply() - 100 * UNIT)
        self.h_endow(MASTER, MASTER, 100 * UNIT)
        self.appendVestingEntry(MASTER, MASTER, block_time() + to_seconds(weeks=1), self.h_totalSupply() - 100 * UNIT)
        self.make_nomin_velocity()

        self.assertClose(self.n_feePool(), 36 * UNIT)

        target_period = self.h_targetFeePeriodDurationSeconds() + 1000
        fast_forward(seconds=target_period)

        self.h_transfer(MASTER, self.escrow.address, 0)
        fast_forward(seconds=target_period)

        self.h_withdrawFeeEntitlement(MASTER)
        self.assertEqual(self.n_feePool(), 0)
        self.assertClose(self.n_balanceOf(MASTER), 36 * UNIT)

    def test_withdrawHalfFees(self):
        self.h_endow(MASTER, self.escrow.address, self.h_totalSupply())
        self.appendVestingEntry(MASTER, MASTER, block_time() + 100000, self.h_totalSupply() // 2)
        self.appendVestingEntry(MASTER, DUMMY, block_time() + 100000, self.h_totalSupply() // 2)
        self.make_nomin_velocity()

        uncollected = self.n_feePool()
        self.assertClose(uncollected, 36 * UNIT)

        # Skip a period so we have a full period with no transfers
        target_period = self.h_targetFeePeriodDurationSeconds() + 100
        fast_forward(seconds=target_period)

        # Zero value transfer to roll over the fee period
        self.h_transfer(MASTER, self.escrow.address, 0)
        fast_forward(seconds=target_period)

        # Since escrow contract has most of the global supply, and half of the
        # escrowed balance, they should get half of the fees.
        self.h_withdrawFeeEntitlement(MASTER)
        self.assertClose(self.n_balanceOf(MASTER), 18 * UNIT)

    def test_purgeAccount(self):
        alice = fresh_account()
        time = block_time() + 100
        self.h_endow(MASTER, self.escrow.address, 1000 * UNIT)
        self.appendVestingEntry(MASTER, alice, time, 1000)

        self.assertReverts(self.purgeAccount, alice, alice);

        self.assertEqual(self.numVestingEntries(alice), 1)
        self.assertEqual(self.totalVestedBalance(), 1000)
        self.assertEqual(self.totalVestedAccountBalance(alice), 1000)
        self.assertEqual(self.getNextVestingIndex(alice), 0)
        self.assertEqual(self.getNextVestingTime(alice), time)
        self.assertEqual(self.getNextVestingQuantity(alice), 1000)

        tx_receipt = self.purgeAccount(MASTER, alice)
        self.assertEqual(get_event_data_from_log(self.escrow_event_dict, tx_receipt.logs[0])['event'], 'SchedulePurged')

        self.assertEqual(self.numVestingEntries(alice), 0)
        self.assertEqual(self.totalVestedBalance(), 0)
        self.assertEqual(self.totalVestedAccountBalance(alice), 0)
        self.assertEqual(self.getNextVestingIndex(alice), 0)
        self.assertEqual(self.getNextVestingTime(alice), 0)
        self.assertEqual(self.getNextVestingQuantity(alice), 0)

    def test_withdrawHavvens(self):
        self.h_endow(MASTER, self.escrow.address, UNIT)
        self.assertEqual(self.h_balanceOf(self.escrow.address), UNIT)

        pre_h_balance = self.h_balanceOf(self.havven_real.address)
        self.withdrawHavvens(MASTER, UNIT // 2)
        self.assertEqual(self.h_balanceOf(self.escrow.address), UNIT // 2)
        self.assertEqual(self.h_balanceOf(self.havven_real.address), pre_h_balance + UNIT // 2)

    def test_appendVestingEntry(self):
        alice, bob = fresh_accounts(2)
        escrow_balance = 20 * UNIT
        amount = 10
        self.h_endow(MASTER, self.escrow.address, escrow_balance)
        time = block_time()

        # Should not be able to add a vestingEntry > havven.totalSupply()
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), self.h_totalSupply() + 1)

        # Should not be able to add a vestingEntry > balanceOf escrow account
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), escrow_balance + 1)

        # Should not be able to vest in the past
        self.assertReverts(self.appendVestingEntry, MASTER, alice, 0, UNIT)
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time - 1, UNIT)
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time, UNIT)

        # Vesting quantities should be nonzero
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), 0)

        self.appendVestingEntry(MASTER, alice, time + to_seconds(weeks=2), amount)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 0)
        fast_forward(weeks=3)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), amount)
        self.h_transfer(alice, MASTER, amount)

        time = block_time()
        t1 = time + to_seconds(weeks=1)
        t2 = time + to_seconds(weeks=2)
        self.appendVestingEntry(MASTER, alice, t1, amount)
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time + to_seconds(days=1), amount)
        self.assertReverts(self.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=1), amount)
        self.appendVestingEntry(MASTER, alice, t2, amount + 1)

        self.assertEqual(self.getVestingQuantity(alice, 1), amount)
        self.assertEqual(self.getVestingQuantity(alice, 2), amount + 1)

        self.assertEqual(self.getVestingTime(alice, 1), t1)
        self.assertEqual(self.getVestingTime(alice, 2), t2)
        self.assertEqual(self.numVestingEntries(alice), 3)

    def test_vest(self):
        alice = fresh_account()
        self.h_endow(MASTER, self.escrow.address, 100 * UNIT)

        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 0)

        time = block_time()
        self.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.appendVestingEntry(MASTER, alice, time + 200, UNIT)
        self.appendVestingEntry(MASTER, alice, time + 300, UNIT)
        self.appendVestingEntry(MASTER, alice, time + 400, UNIT)
        self.appendVestingEntry(MASTER, alice, time + 500, UNIT)
        self.appendVestingEntry(MASTER, alice, time + 600, UNIT)

        fast_forward(105)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), UNIT)
        fast_forward(205)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 3 * UNIT)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 3 * UNIT)
        fast_forward(105)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 4 * UNIT)
        fast_forward(505)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 6 * UNIT)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 6 * UNIT)

    def test_addRegularVestingSchedule(self):
        alice, bob, carol, tim, pim = fresh_accounts(5)
        self.h_endow(MASTER, self.escrow.address, 1000 * UNIT)
        time = block_time()
        self.addRegularVestingSchedule(MASTER, alice, time + to_seconds(weeks=52), 100 * UNIT, 4)
        self.assertEqual(self.numVestingEntries(alice), 4)

        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 0)

        fast_forward(to_seconds(weeks=13) + 10)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 25 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 50 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 75 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 100 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 100 * UNIT)

        time = block_time() + 10000000
        bob_periods = 7
        self.addRegularVestingSchedule(MASTER, bob, time, UNIT, 7)

        q = sum(self.getVestingQuantity(bob, i) for i in range(bob_periods))
        self.assertEqual(q, UNIT)
        self.assertEqual(self.getVestingTime(bob, bob_periods - 1), time, UNIT)

        self.assertReverts(self.addRegularVestingSchedule, MASTER, carol, block_time() - 1, UNIT, 5)
        self.assertReverts(self.addRegularVestingSchedule, MASTER, carol, 0, UNIT, 5)
        self.assertReverts(self.addRegularVestingSchedule, MASTER, carol, block_time() + 100000, UNIT, 0)

        time = block_time() + 10000
        self.appendVestingEntry(MASTER, tim, time, UNIT)
        self.addRegularVestingSchedule(MASTER, pim, time, UNIT, 1)

        self.assertEqual(self.numVestingEntries(tim), self.numVestingEntries(pim))
        self.assertEqual(self.getVestingTime(tim, 0), self.getVestingTime(pim, 0))
        self.assertEqual(self.getVestingQuantity(tim, 0), self.getVestingQuantity(pim, 0))

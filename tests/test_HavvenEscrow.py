from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS, block_time,
    generate_topic_event_map, get_event_data_from_log
)

from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    mine_txs, mine_tx,
    attempt, attempt_deploy, compile_contracts,
    to_seconds, fast_forward,
    fresh_account, fresh_accounts,
    take_snapshot, restore_snapshot
)

from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.havven_escrow_interface import PublicHavvenEscrowInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


def setUpModule():
    print("Testing HavvenEscrow...")


def tearDownModule():
    print()


class TestHavvenEscrow(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                   "contracts/Court.sol", "contracts/HavvenEscrow.sol",
                   "tests/contracts/PublicHavvenEscrow.sol"]

        print("Deployment initiated.\n")

        cls.compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        # Deploy contracts
        cls.havven_contract, hvn_txr = attempt_deploy(cls.compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER, MASTER])
        hvn_block = W3.eth.blockNumber

        cls.nomin_contract, nom_txr = attempt_deploy(cls.compiled, 'PublicNomin',
                                                     MASTER,
                                                     [cls.havven_contract.address, MASTER, ZERO_ADDRESS])
        cls.court_contract, court_txr = attempt_deploy(cls.compiled, 'Court',
                                                       MASTER,
                                                       [cls.havven_contract.address, cls.nomin_contract.address,
                                                        MASTER])
        cls.escrow_contract, escrow_txr = attempt_deploy(cls.compiled, 'PublicHavvenEscrow',
                                                         MASTER,
                                                         [MASTER, cls.havven_contract.address])

        # Hook up each of those contracts to each other
        txs = [cls.havven_contract.functions.setNomin(cls.nomin_contract.address).transact({'from': MASTER}),
               cls.nomin_contract.functions.setCourt(cls.court_contract.address).transact({'from': MASTER}),
               cls.nomin_contract.functions.setHavven(cls.havven_contract.address).transact({'from': MASTER}),
               cls.havven_contract.functions.setEscrow(cls.escrow_contract.address).transact({'from': MASTER})]
        attempt(mine_txs, [txs], "Linking contracts... ")

        cls.escrow_event_dict = cls.event_maps['HavvenEscrow']

        print("\nDeployment complete.\n")

    @classmethod
    def setUpClass(cls):
        cls.deployContracts()
        cls.havven = PublicHavvenInterface(cls.havven_contract, "Havven")
        cls.nomin = PublicNominInterface(cls.nomin_contract, "Nomin")
        cls.escrow = PublicHavvenEscrowInterface(cls.escrow_contract, "HavvenEscrow")

    def test_constructor(self):
        self.assertEqual(self.escrow.havven(), self.havven.contract.address)
        self.assertEqual(self.escrow.owner(), MASTER)
        self.assertEqual(self.escrow.totalVestedBalance(), 0)

    def test_vestingTimes(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, times[0], UNIT)
        self.assertEqual(self.escrow.getVestingTime(alice, 0), times[0])

        for i in range(1, len(times)):
            self.escrow.appendVestingEntry(MASTER, alice, times[i], UNIT)
        for i in range(1, len(times)):
            self.assertEqual(self.escrow.getVestingTime(alice, i), times[i])

    def test_vestingQuantities(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        quantities = [UNIT * i for i in range(1, 6)]
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, times[0], quantities[0])
        self.assertEqual(self.escrow.getVestingQuantity(alice, 0), quantities[0])

        for i in range(1, len(times)):
            self.escrow.appendVestingEntry(MASTER, alice, times[i], quantities[i])
        for i in range(1, len(times)):
            self.assertEqual(self.escrow.getVestingQuantity(alice, i), quantities[i])

    def test_vestingSchedules(self):
        alice = fresh_account()
        time = block_time()
        self.havven.endow(MASTER, self.escrow.contract.address, 1500 * UNIT)

        self.escrow.appendVestingEntry(MASTER, alice, time + 1000, UNIT)
        self.assertEqual(self.escrow.vestingSchedules(alice, 0, 0), time + 1000)
        self.assertEqual(self.escrow.vestingSchedules(alice, 0, 1), UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 2000, 2 * UNIT)
        self.assertEqual(self.escrow.vestingSchedules(alice, 1, 0), time + 2000)
        self.assertEqual(self.escrow.vestingSchedules(alice, 1, 1), 2 * UNIT)

    def test_balanceOf(self):
        alice = fresh_account()
        time = block_time()

        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.assertEqual(self.escrow.balanceOf(alice), 0)
        self.escrow.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.assertEqual(self.escrow.balanceOf(alice), UNIT)

        self.escrow.purgeAccount(MASTER, alice)
        self.assertEqual(self.escrow.balanceOf(alice), 0)

        k = 5
        for n in [100 * 2 ** i for i in range(k)]:
            self.escrow.appendVestingEntry(MASTER, alice, time + n, n)

        self.assertEqual(self.escrow.balanceOf(alice), 100 * (2 ** k - 1))
        fast_forward(110)
        self.escrow.vest(alice)
        self.assertEqual(self.escrow.balanceOf(alice), 100 * (2 ** k - 1) - 100)

    def test_totalVestedAccountBalance(self):
        alice = fresh_account()
        time = block_time()

        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 0)
        self.escrow.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), UNIT)

        self.escrow.purgeAccount(MASTER, alice)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 0)

        k = 5
        for n in [100 * 2 ** i for i in range(k)]:
            self.escrow.appendVestingEntry(MASTER, alice, time + n, n)

        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 100 * (2 ** k - 1))
        fast_forward(110)
        self.escrow.vest(alice)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 100 * (2 ** k - 1) - 100)

    def test_totalVestedBalance(self):
        alice, bob = fresh_accounts(2)
        time = block_time()

        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), 0)
        self.escrow.appendVestingEntry(MASTER, bob, time + 100, UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), UNIT)

        self.escrow.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), 2 * UNIT)

        self.escrow.purgeAccount(MASTER, alice)
        self.assertEqual(self.escrow.totalVestedBalance(), UNIT)

        k = 5
        for n in [100 * 2 ** i for i in range(k)]:
            self.escrow.appendVestingEntry(MASTER, alice, time + n, n)

        self.assertEqual(self.escrow.totalVestedBalance(), UNIT + 100 * (2 ** k - 1))
        fast_forward(110)
        self.escrow.vest(alice)
        self.assertEqual(self.escrow.totalVestedBalance(), UNIT + 100 * (2 ** k - 1) - 100)

    def test_numVestingEntries(self):
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)

        self.assertEqual(self.escrow.numVestingEntries(alice), 0)
        self.escrow.appendVestingEntry(MASTER, alice, times[0], UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 1)
        self.escrow.appendVestingEntry(MASTER, alice, times[1], UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 2)
        self.escrow.appendVestingEntry(MASTER, alice, times[2], UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, times[3], UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, times[4], UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 5)
        self.escrow.purgeAccount(MASTER, alice)
        self.assertEqual(self.escrow.numVestingEntries(alice), 0)

    def test_getVestingScheduleEntry(self):
        alice = fresh_account()
        time = block_time()
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 100, 1);
        self.assertEqual(self.escrow.getVestingScheduleEntry(alice, 0), [time + 100, 1])

    def test_getNextVestingIndex(self):
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        times = [time + to_seconds(weeks=i) for i in range(1, 6)]

        self.assertEqual(self.escrow.getNextVestingIndex(alice), 0)

        for i in range(len(times)):
            self.escrow.appendVestingEntry(MASTER, alice, times[i], UNIT)

        for i in range(len(times)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.escrow.getNextVestingIndex(alice), i)
            self.escrow.vest(alice)
            self.assertEqual(self.escrow.getNextVestingIndex(alice), i + 1)

    def test_getNextVestingEntry(self):
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.escrow.getNextVestingEntry(alice), [0, 0])

        for i in range(len(entries)):
            self.escrow.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.escrow.getNextVestingEntry(alice), entries[i])
            self.escrow.vest(alice)
            self.assertEqual(self.escrow.getNextVestingEntry(alice), [0, 0] if i == len(entries) - 1 else entries[i + 1])

    def test_getNextVestingTime(self):
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.escrow.getNextVestingTime(alice), 0)

        for i in range(len(entries)):
            self.escrow.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.escrow.getNextVestingTime(alice), entries[i][0])
            self.escrow.vest(alice)
            self.assertEqual(self.escrow.getNextVestingTime(alice), 0 if i == len(entries) - 1 else entries[i + 1][0])

    def test_getNextVestingQuantity(self):
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)
        alice = fresh_account()
        time = block_time()
        entries = [[time + to_seconds(weeks=i), i * UNIT] for i in range(1, 6)]

        self.assertEqual(self.escrow.getNextVestingQuantity(alice), 0)

        for i in range(len(entries)):
            self.escrow.appendVestingEntry(MASTER, alice, entries[i][0], entries[i][1])

        for i in range(len(entries)):
            fast_forward(to_seconds(weeks=1) + 30)
            self.assertEqual(self.escrow.getNextVestingQuantity(alice), entries[i][1])
            self.escrow.vest(alice)
            self.assertEqual(self.escrow.getNextVestingQuantity(alice), 0 if i == len(entries) - 1 else entries[i + 1][1])

    def test_setHavven(self):
        alice = fresh_account()
        self.escrow.setHavven(MASTER, alice)
        self.assertEqual(self.escrow.havven(), alice)
        self.assertReverts(self.escrow.setHavven, alice, alice)

    def test_escrowedFees(self):
        self.havven.endow(MASTER, self.escrow.contract.address, self.havven.totalSupply())
        self.escrow.appendVestingEntry(MASTER, MASTER, block_time() + 100000, self.havven.totalSupply())

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.setWhitelisted(MASTER, MASTER, True)
        self.havven.issueNomins(MASTER, UNIT)

        # generate 1 UNIT of fees
        self.nomin.donateToFeePool(MASTER, UNIT)

        fees = self.nomin.feePool()

        # Skip a period so we have a full period with no transfers
        fast_forward(self.havven.targetFeePeriodDurationSeconds() + 100)
        self.havven.checkFeePeriodRollover(MASTER)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(MASTER, MASTER)
        # Skip a period so we have a full period with no transfers
        fast_forward(self.havven.targetFeePeriodDurationSeconds() + 100)
        self.havven.checkFeePeriodRollover(MASTER)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(MASTER, MASTER)

        self.assertEqual(fees, self.havven.lastFeesCollected())

        self.havven.withdrawFeeEntitlement(MASTER)

        self.assertEqual(self.nomin.feePool(), 0)
        self.assertEqual(self.nomin.balanceOf(MASTER), fees)

    def test_withdrawHalfFees(self):
        self.havven.endow(MASTER, self.escrow.contract.address, self.havven.totalSupply())
        self.escrow.appendVestingEntry(MASTER, MASTER, block_time() + 100000, self.havven.totalSupply() // 2)
        self.escrow.appendVestingEntry(MASTER, DUMMY, block_time() + 100000, self.havven.totalSupply() // 2)

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.setWhitelisted(MASTER, MASTER, True)
        self.havven.issueNomins(MASTER, UNIT)

        # generate 1 UNIT of fees
        self.havven.setWhitelisted(MASTER, DUMMY, True)
        self.havven.issueNomins(DUMMY, UNIT)
        self.nomin.donateToFeePool(DUMMY, UNIT)

        fees = self.nomin.feePool()

        # Skip a period so we have a full period with no transfers
        fast_forward(self.havven.targetFeePeriodDurationSeconds() + 100)
        self.havven.checkFeePeriodRollover(MASTER)
        self.havven.recomputeAccountIssuedNominLastAverageBalance(MASTER, MASTER)

        # Since escrow contract has most of the global supply, and half of the
        # escrowed balance, they should get half of the fees.
        self.havven.withdrawFeeEntitlement(MASTER)
        self.assertClose(self.nomin.balanceOf(MASTER) - UNIT, fees/2)

        self.havven.withdrawFeeEntitlement(DUMMY)
        self.assertClose(self.nomin.balanceOf(DUMMY), fees/2)

    def test_purgeAccount(self):
        alice = fresh_account()
        time = block_time() + 100
        self.havven.endow(MASTER, self.escrow.contract.address, 1000 * UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time, 1000)

        self.assertReverts(self.escrow.purgeAccount, alice, alice);

        self.assertEqual(self.escrow.numVestingEntries(alice), 1)
        self.assertEqual(self.escrow.totalVestedBalance(), 1000)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 1000)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 0)
        self.assertEqual(self.escrow.getNextVestingTime(alice), time)
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), 1000)

        tx_receipt = self.escrow.purgeAccount(MASTER, alice)

        self.assertEqual(self.escrow.numVestingEntries(alice), 0)
        self.assertEqual(self.escrow.totalVestedBalance(), 0)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 0)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 0)
        self.assertEqual(self.escrow.getNextVestingTime(alice), 0)
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), 0)

    def test_withdrawHavvens(self):
        self.havven.endow(MASTER, self.escrow.contract.address, UNIT)
        self.assertEqual(self.havven.balanceOf(self.escrow.contract.address), UNIT)

        pre_h_balance = self.havven.balanceOf(self.havven.contract.address)
        self.escrow.withdrawHavvens(MASTER, UNIT // 2)
        self.assertEqual(self.havven.balanceOf(self.escrow.contract.address), UNIT // 2)
        self.assertEqual(self.havven.balanceOf(self.havven.contract.address), pre_h_balance + UNIT // 2)

    def test_appendVestingEntry(self):
        alice, bob = fresh_accounts(2)
        escrow_balance = 20 * UNIT
        amount = 10
        self.havven.endow(MASTER, self.escrow.contract.address, escrow_balance)
        time = block_time()

        # Should not be able to add a vestingEntry > havven.totalSupply()
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), self.havven.totalSupply() + 1)

        # Should not be able to add a vestingEntry > balanceOf escrow account
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), escrow_balance + 1)

        # Should not be able to vest in the past
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, 0, UNIT)
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time - 1, UNIT)
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time, UNIT)

        # Vesting quantities should be nonzero
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=2), 0)

        self.escrow.appendVestingEntry(MASTER, alice, time + to_seconds(weeks=2), amount)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 0)
        fast_forward(weeks=3)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.havven.transfer(alice, MASTER, amount)

        time = block_time()
        t1 = time + to_seconds(weeks=1)
        t2 = time + to_seconds(weeks=2)
        self.escrow.appendVestingEntry(MASTER, alice, t1, amount)
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time + to_seconds(days=1), amount)
        self.assertReverts(self.escrow.appendVestingEntry, MASTER, alice, time + to_seconds(weeks=1), amount)
        self.escrow.appendVestingEntry(MASTER, alice, t2, amount + 1)

        self.assertEqual(self.escrow.getVestingQuantity(alice, 1), amount)
        self.assertEqual(self.escrow.getVestingQuantity(alice, 2), amount + 1)

        self.assertEqual(self.escrow.getVestingTime(alice, 1), t1)
        self.assertEqual(self.escrow.getVestingTime(alice, 2), t2)
        self.assertEqual(self.escrow.numVestingEntries(alice), 3)

    def test_vest(self):
        alice = fresh_account()
        self.havven.endow(MASTER, self.escrow.contract.address, 100 * UNIT)

        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 0)

        time = block_time()
        self.escrow.appendVestingEntry(MASTER, alice, time + 100, UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 200, UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 300, UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 400, UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 500, UNIT)
        self.escrow.appendVestingEntry(MASTER, alice, time + 600, UNIT)

        fast_forward(105)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), UNIT)
        fast_forward(205)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 3 * UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 3 * UNIT)
        fast_forward(105)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 4 * UNIT)
        fast_forward(505)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 6 * UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 6 * UNIT)

    def test_addVestingSchedule(self):
        alice, bob, eve = fresh_accounts(3)
        self.havven.endow(MASTER, self.escrow.contract.address, 1000 * UNIT)
        time = block_time()

        self.escrow.appendVestingEntry(MASTER, bob, time + 100000, UNIT)

        times = [time + 100, time + 300, time + 400, time + 10000]
        quantities = [UNIT, 2*UNIT, UNIT, 5*UNIT]

        self.escrow.addVestingSchedule(MASTER, alice, times, quantities)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)

        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)
        self.assertEqual(self.escrow.totalVestedBalance(), 10*UNIT)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 9*UNIT)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 0)
        self.assertEqual(self.escrow.getNextVestingTime(alice), times[0])
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), quantities[0])

        fast_forward(110)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 8*UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), 9*UNIT)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 1)
        self.assertEqual(self.escrow.getNextVestingTime(alice), times[1])
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), quantities[1])

        fast_forward(220)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 3*UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 3*UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 6*UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), 7*UNIT)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 2)
        self.assertEqual(self.escrow.getNextVestingTime(alice), times[2])
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), quantities[2])

        fast_forward(110)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 4*UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 4*UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 5*UNIT)
        self.assertEqual(self.escrow.totalVestedBalance(), 6*UNIT)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 3)
        self.assertEqual(self.escrow.getNextVestingTime(alice), times[3])
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), quantities[3])

        fast_forward(10000)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 9*UNIT)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 9*UNIT)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)
        self.assertEqual(self.escrow.totalVestedAccountBalance(alice), 0)
        self.assertEqual(self.escrow.totalVestedBalance(), UNIT)
        self.assertEqual(self.escrow.getNextVestingIndex(alice), 4)
        self.assertEqual(self.escrow.getNextVestingTime(alice), 0)
        self.assertEqual(self.escrow.getNextVestingQuantity(alice), 0)

        time = block_time()
        # Bad (zero) quantities
        self.assertReverts(self.escrow.addVestingSchedule, MASTER, eve, [time + 1000, time + 2000], [0, UNIT])
        self.assertReverts(self.escrow.addVestingSchedule, MASTER, eve, [time + 1000, time + 2000], [UNIT, 0])

        # Bad times
        self.assertReverts(self.escrow.addVestingSchedule, MASTER, eve, [time - 1000, time + 2000], [UNIT, UNIT])
        self.assertReverts(self.escrow.addVestingSchedule, MASTER, eve, [time + 1000, time + 500], [UNIT, UNIT])

    def test_addRegularVestingSchedule(self):
        alice, bob, carol, tim, pim = fresh_accounts(5)
        self.havven.endow(MASTER, self.escrow.contract.address, 1000 * UNIT)
        time = block_time()
        self.escrow.addRegularVestingSchedule(MASTER, alice, time + to_seconds(weeks=52), 100 * UNIT, 4)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)

        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 0)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 25 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 50 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)

    def test_addRegularVestingSchedule(self):
        alice, bob, carol, tim, pim = fresh_accounts(5)
        self.havven.endow(MASTER, self.escrow.contract.address, 1000 * UNIT)
        time = block_time()
        self.escrow.addRegularVestingSchedule(MASTER, alice, time + to_seconds(weeks=52), 100 * UNIT, 4)
        self.assertEqual(self.escrow.numVestingEntries(alice), 4)

        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 0)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 25 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 50 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 75 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 100 * UNIT)

        fast_forward(to_seconds(weeks=13) + 10)
        self.escrow.vest(alice)
        self.assertEqual(self.havven.balanceOf(alice), 100 * UNIT)

        time = block_time() + 10000000
        bob_periods = 7
        self.escrow.addRegularVestingSchedule(MASTER, bob, time, UNIT, 7)

        q = sum(self.escrow.getVestingQuantity(bob, i) for i in range(bob_periods))
        self.assertEqual(q, UNIT)
        self.assertEqual(self.escrow.getVestingTime(bob, bob_periods - 1), time, UNIT)

        self.assertReverts(self.escrow.addRegularVestingSchedule, MASTER, carol, block_time() - 1, UNIT, 5)
        self.assertReverts(self.escrow.addRegularVestingSchedule, MASTER, carol, 0, UNIT, 5)
        self.assertReverts(self.escrow.addRegularVestingSchedule, MASTER, carol, block_time() + 100000, UNIT, 0)

        time = block_time() + 10000
        self.escrow.appendVestingEntry(MASTER, tim, time, UNIT)
        self.escrow.addRegularVestingSchedule(MASTER, pim, time, UNIT, 1)

        self.assertEqual(self.escrow.numVestingEntries(tim), self.escrow.numVestingEntries(pim))
        self.assertEqual(self.escrow.getVestingTime(tim, 0), self.escrow.getVestingTime(pim, 0))
        self.assertEqual(self.escrow.getVestingQuantity(tim, 0), self.escrow.getVestingQuantity(pim, 0))

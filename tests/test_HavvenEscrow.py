import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY, take_snapshot,\
    restore_snapshot, fresh_account, fresh_accounts, UNIT, fast_forward
from utils.testutils import assertReverts, assertClose, block_time
from utils.generalutils import to_seconds

ESCROW_SOURCE = "contracts/HavvenEscrow.sol"
HAVVEN_SOURCE = "contracts/Havven.sol"
NOMIN_SOURCE = "contracts/EtherNomin.sol"


def setUpModule():
    print("Testing HavvenEscrow...")


def tearDownModule():
    print()


class TestHavvenEscrow(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        compiled = compile_contracts([ESCROW_SOURCE, HAVVEN_SOURCE, NOMIN_SOURCE])
        cls.havven, txr = attempt_deploy(compiled, 'Havven', MASTER, [MASTER])
        cls.nomin, txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [cls.havven.address, MASTER, MASTER, 1000 * 10**18, MASTER])
        cls.escrow, txr = attempt_deploy(compiled, 'HavvenEscrow', MASTER,
                                         [MASTER, cls.havven.address, cls.nomin.address])
        mine_tx(cls.havven.functions.setNomin(cls.nomin.address).transact({'from': MASTER}))

        cls.h_totalSupply = lambda self: cls.havven.functions.totalSupply().call()
        cls.h_targetFeePeriodDurationSeconds = lambda self: cls.havven.functions.targetFeePeriodDurationSeconds().call()
        cls.h_feePeriodStartTime = lambda self: cls.havven.functions.feePeriodStartTime().call()
        cls.h_endow = lambda self, sender, receiver, amt: mine_tx(cls.havven.functions.endow(receiver, amt).transact({'from': sender}))
        cls.h_balanceOf = lambda self, account: cls.havven.functions.balanceOf(account).call()
        cls.h_transfer = lambda self, sender, receiver, amt: mine_tx(cls.havven.functions.transfer(receiver, amt).transact({'from': sender}))
        cls.h_recomputeLastAverageBalance = lambda self, sender: mine_tx(cls.havven.functions.recomputeLastAverageBalance().transact({'from': sender}))

        cls.n_updatePrice = lambda self, sender, price: mine_tx(cls.nomin.functions.updatePrice(price).transact({'from': sender}))
        cls.n_setTransferFeeRate = lambda self, sender, rate: mine_tx(cls.nomin.functions.setTransferFeeRate(rate).transact({'from': sender}))
        cls.n_issue = lambda self, sender, quantity, value: mine_tx(cls.nomin.functions.issue(quantity).transact({'from': sender, 'value': value}))
        cls.n_burn = lambda self, sender, quantity: mine_tx(cls.nomin.functions.burn(quantity).transact({'from': sender}))
        cls.n_buy = lambda self, sender, quantity, value: mine_tx(cls.nomin.functions.buy(quantity).transact({'from': sender, 'value': value}))
        cls.n_sell = lambda self, sender, quantity: mine_tx(cls.nomin.functions.sell(quantity).transact({'from': sender}))
        cls.n_purchaseCostEther = lambda self, quantity: cls.nomin.functions.purchaseCostEther(quantity).call()
        cls.n_balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.n_transfer = lambda self, sender, recipient, quantity: mine_tx(cls.nomin.functions.transfer(recipient, quantity).transact({'from': sender}))
        cls.n_feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.n_nominPool = lambda self: cls.nomin.functions.nominPool().call()

        cls.owner = lambda self: cls.escrow.functions.owner().call()
        cls.setOwner = lambda self, sender, newOwner: mine_tx(cls.escrow.functions.setOwner(newOwner).transact({'from': sender}))

        cls.e_havven = lambda self: cls.escrow.functions.havven().call()
        cls.e_nomin = lambda self: cls.escrow.functions.nomin().call()
        cls.vestingTimes = lambda self, account, index: cls.escrow.functions.vestingTimes(account, index).call()
        cls.numTimes = lambda self, account: cls.escrow.functions.numTimes(account).call()
        cls.numVestingTimes = lambda self, account: cls.escrow.functions.numVestingTimes(account).call()
        cls.vestingQuantities = lambda self, account, time: cls.escrow.functions.vestingQuantities(account, time).call()
        cls.totalVestedAccountBalance = lambda self, account: cls.escrow.functions.totalVestedAccountBalance(account).call()
        cls.totalVestedBalance = lambda self: cls.escrow.functions.totalVestedBalance().call()

        cls.feePool = lambda self: cls.escrow.functions.feePool()
        cls.setHavven = lambda self, sender, account: mine_tx(cls.escrow.functions.setHavven(account).transact({'from': sender}))
        cls.setNomin = lambda self, sender, account: mine_tx(cls.escrow.functions.setNomin(account).transact({'from': sender}))
        cls.sweepFees = lambda self, sender: mine_tx(cls.escrow.functions.sweepFees().transact({'from': sender}))
        cls.withdrawContractFees = lambda self, sender: mine_tx(cls.escrow.functions.withdrawContractFees().transact({'from': sender}))
        cls.purgeAccount = lambda self, sender, account: mine_tx(cls.escrow.functions.purgeAccount(account).transact({'from': sender}))
        cls.withdrawHavvens = lambda self, sender, quantity: mine_tx(cls.escrow.functions.withdrawHavvens(quantity).transact({'from': sender}))
        cls.addNewVestedQuantity = lambda self, sender, account, time, quantity: mine_tx(cls.escrow.functions.addNewVestedQuantity(account, time, quantity).transact({'from': sender}))
        cls.addVestingSchedule = lambda self, sender, account, time, quantity, periods: mine_tx(cls.escrow.functions.addVestingSchedule(account, time, quantity, periods).transact({'from': sender}))
        cls.vest = lambda self, sender: mine_tx(cls.escrow.functions.vest().transact({'from': sender}))

    def make_nomin_velocity(self):
        # should produce a 36 * UNIT fee pool
        self.n_updatePrice(MASTER, UNIT)
        self.n_setTransferFeeRate(MASTER, UNIT // 100)
        self.n_issue(MASTER, 1000 * UNIT, 2000 * UNIT)
        self.n_buy(MASTER, 1000 * UNIT, self.n_purchaseCostEther(1000 * UNIT))
        for i in range(8):
            self.n_transfer(MASTER, MASTER, (9 - (i + 1)) * 100 * UNIT)
        self.n_sell(MASTER, self.n_balanceOf(MASTER))
        self.n_burn(MASTER, self.n_nominPool())

    def test_constructor(self):
        self.assertEqual(self.e_havven(), self.havven.address)
        self.assertEqual(self.e_nomin(), self.nomin.address)
        self.assertEqual(self.owner(), MASTER)
        self.assertEqual(self.totalVestedBalance(), 0)

    def test_vestingTimes(self):
        pass

    def test_vestingQuantities(self):
        pass

    def test_totalVestedAccountBalance(self):
        pass

    def test_totalVestedBalance(self):
        pass

    def test_numVestingTimes(self):
        alice = fresh_account()
        time = block_time()

        self.assertEqual(self.numVestingTimes(alice), 0)
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=1), UNIT)
        self.assertEqual(self.numVestingTimes(alice), 1)
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=2), UNIT)
        self.assertEqual(self.numVestingTimes(alice), 2)
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=3), UNIT)
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=4), UNIT)
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=5), UNIT)
        self.assertEqual(self.numVestingTimes(alice), 5)
        self.purgeAccount(MASTER, alice)
        self.assertEqual(self.numVestingTimes(alice), 0)

    def test_feePool(self):
        pass
        """
        self.make_nomin_velocity()
        self.h_endow(MASTER, self.escrow.address, self.h_totalSupply() - (100 * UNIT))
        self.h_endow(MASTER, MASTER, 100 * UNIT)
        uncollected = self.n_feePool()
        self.assertClose(uncollected, 36 * UNIT)
        self.assertEqual(self.feePool(), 0)
        self.h_transfer(MASTER, self.escrow.address, UNIT)

        self.h_transfer(MASTER, self.escrow.address, UNIT)
        target_period = self.h_targetFeePeriodDurationSeconds() + 1000
        fast_forward(seconds=target_period)
        self.h_transfer(MASTER, self.escrow.address, UNIT)
        fast_forward(seconds=target_period)
        self.h_transfer(MASTER, self.escrow.address, UNIT)
        fast_forward(seconds=target_period)
        self.h_transfer(MASTER, self.escrow.address, UNIT)
        print(self.h_balanceOf(MASTER))
        self.withdrawContractFees(MASTER)
        self.assertEqual(self.feePool(), uncollected)
        """

    def test_setHavven(self):
        alice = fresh_account()
        self.setHavven(MASTER, alice)
        self.assertEqual(self.e_havven(), alice)
        self.assertReverts(self.setHavven, alice, alice)

    def test_setNomin(self):
        alice = fresh_account()
        self.setNomin(MASTER, alice)
        self.assertEqual(self.e_nomin(), alice)
        self.assertReverts(self.setNomin, alice, alice)

    def test_withdrawContractFees(self):
        pass

    def test_remitFees(self):
        pass

    def test_withdrawFees(self):
        pass

    def test_purgeAccount(self):
        pass

    def test_withdrawHavvens(self):
        pass

    def test_addNewVestedQuantity(self):
        alice, bob = fresh_accounts(2)
        amount = 16 * UNIT
        self.h_endow(MASTER, self.escrow.address, amount)
        time = block_time()
        self.addNewVestedQuantity(MASTER, alice, time+to_seconds(weeks=2), amount)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 0)
        fast_forward(weeks=3)
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), amount)
        self.h_transfer(alice, MASTER, amount)

        time = block_time()
        t1 = time+to_seconds(weeks=1)
        t2 = time+to_seconds(weeks=2)
        self.addNewVestedQuantity(MASTER, alice, t1, amount)
        self.assertReverts(self.addNewVestedQuantity, MASTER, alice, time+to_seconds(days=1), amount)
        self.assertReverts(self.addNewVestedQuantity, MASTER, alice, time+to_seconds(weeks=1), amount)
        self.addNewVestedQuantity(MASTER, alice, t2, amount + 1)

        self.assertEqual(self.vestingQuantities(alice, t1), amount)
        self.assertEqual(self.vestingQuantities(alice, t2), amount + 1)

        self.assertEqual(self.vestingTimes(alice, 1), t1)
        self.assertEqual(self.vestingTimes(alice, 2), t2)
        self.assertEqual(self.numVestingTimes(alice), 3)

    def test_addVestingSchedule(self):
        pass

    def test_vest(self):
        pass


if __name__ == '__main__':
    unittest.main()

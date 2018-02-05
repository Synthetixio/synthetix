import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY, take_snapshot,\
    restore_snapshot, fresh_account, fresh_accounts, UNIT, fast_forward
from utils.testutils import assertReverts, block_time
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

        compiled = compile_contracts([ESCROW_SOURCE, HAVVEN_SOURCE, NOMIN_SOURCE])
        cls.havven, txr = attempt_deploy(compiled, 'Havven', MASTER, [MASTER])
        cls.nomin, txr = attempt_deploy(compiled, 'EtherNomin', MASTER, [cls.havven.address, MASTER, MASTER, 1000 * 10**18, MASTER])
        cls.escrow, txr = attempt_deploy(compiled, 'HavvenEscrow', MASTER,
                                         [MASTER, cls.havven.address, cls.nomin.address])

        cls.owner = lambda self: cls.escrow.functions.owner().call()
        cls.setOwner = lambda self, sender, newOwner: mine_tx(cls.escrow.functions.setOwner(newOwner).transact({'from': sender}))

        cls.h_endow = lambda self, sender, receiver, amt: mine_tx(cls.havven.functions.endow(receiver, amt).transact({'from': sender}))
        cls.h_balanceOf = lambda self, account: cls.havven.functions.balanceOf(account).call()

        cls.e_havven = lambda self: cls.escrow.functions.havven().call()
        cls.e_nomin = lambda self: cls.escrow.functions.nomin().call()
        cls.vestingTimes = lambda self, account: cls.escrow.functions.vestingTimes(account).call()
        cls.numTimes = lambda self, account: cls.escrow.functions.numTimes(account).call()
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

    def makeNominVelocity(self):
        pass

    def test_constructor(self):
        self.assertEqual(self.e_havven(), self.havven.address)
        self.assertEqual(self.e_nomin(), self.nomin.address)
        self.assertEqual(self.owner(), MASTER)

    def test_feePool(self):
        pass

    def test_withdrawContractFees(self):
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
        self.addNewVestedQuantity(MASTER, alice, amount, time+to_seconds(weeks=2))
        self.vest(alice)
        self.assertEqual(self.h_balanceOf(alice), 0)
        fast_forward(weeks=3)
        self.vest(alice)
        for i in range(100):
            try:
                print(self.escrow.functions.debug(i).call())
            except:
                break
        self.assertEqual(self.h_balanceOf(alice), amount)

    def test_addVestingSchedule(self):
        pass

    def test_vest(self):
        pass


if __name__ == '__main__':
    unittest.main()

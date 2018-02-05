import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY
from utils.testutils import assertReverts


ESCROW_SOURCE = "contracts/HavvenEscrow.sol"
HAVVEN_SOURCE = "contracts/Havven.sol"
NOMIN_SOURCE = "contracts/EtherNomin.sol"

def setUpModule():
    print("Testing HavvenEscrow...")


def tearDownModule():
    print()


class TestHavvenEscrow(unittest.TestCase):
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

        cls.e_havven = lambda self: cls.escrow.functions.havven().call()
        cls.e_nomin = lambda self: cls.escrow.functions.nomin().call()
        cls.vestingTimes = lambda self, account: cls.escrow.functions.vestingTimes(account).call()
        cls.numTimes = lambda self, account: cls.escrow.functions.numTimes(account).call()
        cls.vestingQuantities = lambda self, account, time: cls.escrow.functions.vestingQuantities(account, time).call()
        cls.totalVestedAccountBalance = lambda self, account: cls.escrow.functions.totalVestedAccountBalance(account).call()
        cls.totalVestedBalance = lambda self: cls.escrow.functions.totalVestedBalance().call()

        cls.feePool = lambda self: cls.escrow.functions.feePool()
        cls.withdrawContractFees = lambda self, sender: mine_tx(cls.escrow.functions.withdrawContractFees().transact({'from': sender}))
        cls.purgeAccount = lambda self, sender, account: mine_tx(cls.escrow.functions.purgeAccount(account).transact({'from': sender}))
        cls.withdrawHavvens = lambda self, sender, quantity: mine_tx(cls.escrow.functions.withdrawHavvens(quantity).transact({'from': sender}))
        cls.addNewVestedQuantity = lambda self, sender, account, time, quantity: mine_tx(cls.escrow.functions.addNewVestedQuantity(account, time, quantity).transact({'from': sender}))
        cls.vest = lambda self, sender: mine_tx(cls.escrow.functions.vest().transact({'from': sender}))

    def test_owner_is_master(self):
        self.assertEqual(self.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.owner()
        new_owner = DUMMY

        self.setOwner(MASTER, new_owner)
        self.assertEqual(self.owner(), new_owner)

        self.setOwner(new_owner, old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.setOwner, invalid_account, invalid_account)


if __name__ == '__main__':
    unittest.main()

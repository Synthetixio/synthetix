import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts


OWNED_SOURCE = "contracts/Owned.sol"


def setUpModule():
    print("Testing Owned...")


def tearDownModule():
    print()


class TestOwned(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([OWNED_SOURCE])
        cls.owned, txr = attempt_deploy(compiled, 'Owned', MASTER, [MASTER])

        cls.owner = lambda self: cls.owned.functions.owner().call()
        cls.nominateOwner = lambda self, sender, newOwner: cls.owned.functions.nominateOwner(newOwner).transact({'from': sender})
        cls.acceptOwnership = lambda self, sender: cls.owned.functions.acceptOwnership().transact({'from': sender})
        cls.forceAcceptOwnership = lambda self, sender: cls.owned.functions.forceAcceptOwnership().transact({'from': sender})
        cls.setOwner = lambda self, sender, newOwner: mine_tx(cls.owned.functions.setOwner(newOwner).transact({'from': sender}))

    def test_owner_is_master(self):
        self.assertEqual(self.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.owner()
        new_owner = DUMMY

        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        self.nominateOwner(old_owner, new_owner)
        self.assertEqual(self.owner(), old_owner)
        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        self.acceptOwnership(new_owner)
        self.assertEqual(self.owner(), new_owner)
        self.assertReverts(self.nominateOwner, old_owner, new_owner)
        self.nominateOwner(new_owner, old_owner)

    def test_forceAcceptOwnership(self):
        owner = self.owner()
        new_owner = DUMMY
        self.nominateOwner(owner, new_owner)
        self.assertReverts(self.forceAcceptOwnership, owner)
        fast_forward(24*60*60  - 100)
        self.assertReverts(self.forceAcceptOwnership, owner)
        fast_forward(200)
        self.forceAcceptOwnership(owner)
        self.assertEqual(self.owner(), new_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.nominateOwner, invalid_account, invalid_account)

if __name__ == '__main__':
    unittest.main()

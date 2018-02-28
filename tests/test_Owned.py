import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time, ZERO_ADDRESS

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
        cls.nominateOwner = lambda self, sender, newOwner: mine_tx(
            cls.owned.functions.nominateOwner(newOwner).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.owned.functions.acceptOwnership().transact({'from': sender}))

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
        self.acceptOwnership(old_owner)
        self.assertEqual(self.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.nominateOwner, invalid_account, invalid_account)

    def test_undo_change_owner(self):
        old_owner = self.owner()
        new_owner = DUMMY

        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        self.nominateOwner(old_owner, new_owner)
        self.nominateOwner(old_owner, ZERO_ADDRESS)
        self.assertReverts(self.acceptOwnership, new_owner)


if __name__ == '__main__':
    unittest.main()

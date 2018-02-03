import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY
from utils.testutils import assertReverts


OWNED_SOURCE = "contracts/Owned.sol"


def setUpModule():
    print("Testing Owned...")


def tearDownModule():
    print()


class TestOwned(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([OWNED_SOURCE])
        cls.owned, txr = attempt_deploy(compiled, 'Owned', MASTER, [MASTER])

        cls.owner = lambda self: cls.owned.functions.owner().call()
        cls.setOwner = lambda self, sender, newOwner: mine_tx(cls.owned.functions.setOwner(newOwner).transact({'from': sender}))

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

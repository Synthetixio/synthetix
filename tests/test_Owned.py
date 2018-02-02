import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, MASTER
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
        cls.setOwner = lambda self, new_owner, sender: cls.owned.functions.setOwner(new_owner).transact({'from': sender})

    def test_owner_is_master(self):
        self.assertEqual(self.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.owner()
        new_owner = W3.eth.accounts[1]

        mine_tx(self.setOwner(new_owner, MASTER))
        self.assertEqual(self.owner(), new_owner)

        mine_tx(self.setOwner(old_owner, new_owner))

    def test_change_invalid_owner(self):
        invalid_account = W3.eth.accounts[1]
        self.assertReverts(self.setOwner, invalid_account, invalid_account)

if __name__ == '__main__':
    unittest.main()

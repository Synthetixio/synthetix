import unittest
from deploy import MASTER
from deploy_utils import W3, compile_contracts, attempt_deploy, mine_tx
from test_utils import assertTransactionReverts

OWNED_SOURCE = "contracts/Owned.sol"

class TestOwned(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([OWNED_SOURCE])
        cls.owned = attempt_deploy(compiled, 'Owned', MASTER, [MASTER])

    def test_owner_is_master(self):
        self.assertEqual(self.owned.functions.owner().call(), MASTER)

    def test_change_owner(self):
        new_owner = W3.eth.accounts[1]
        mine_tx(self.owned.functions.setOwner(new_owner).transact({'from': MASTER}))
        self.assertEqual(self.owned.functions.owner().call(), new_owner)
        mine_tx(self.owned.functions.setOwner(MASTER).transact({'from': new_owner}))

    def test_change_invalid_owner(self):
        invalid_account = W3.eth.accounts[1]
        assertTransactionReverts(self, self.owned.functions.setOwner(invalid_account), invalid_account)

if __name__ == '__main__':
    unittest.main()

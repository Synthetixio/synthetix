import unittest
from deploy import UNIT, MASTER, deploy_havven
from utils.deployutils import W3, mine_tx
from utils.testutils import assertTransactionReverts


class TestHavven(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.havven, cls.nomin, cls.court = deploy_havven()

    #####
    # test ownership
    #####
    def test_owner_is_master(self):
        self.assertEqual(self.havven.functions.owner().call(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.functions.owner().call()
        new_owner = W3.eth.accounts[1]

        mine_tx(self.havven.functions.setOwner(new_owner).transact({'from': MASTER}))
        self.assertEqual(self.havven.functions.owner().call(), new_owner)

        mine_tx(self.havven.functions.setOwner(old_owner).transact({'from': new_owner}))

    def test_change_invalid_owner(self):
        invalid_account = W3.eth.accounts[1]
        assertTransactionReverts(self, self.havven.functions.setOwner(invalid_account), invalid_account)


if __name__ == '__main__':
    unittest.main()

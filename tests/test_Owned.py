import unittest
import deploy
from deploy import owned_contract, MASTER

class TestOwned(unittest.TestCase):
    def test_owner_is_master(self):
        self.assertEqual(owned_contract.call().owner(), MASTER)

    def test_change_owner(self):
        new_owner = deploy.W3.eth.accounts[1]
        deploy.mine_tx(owned_contract.transact({'from': MASTER}).setOwner(new_owner))
        self.assertEqual(owned_contract.call().owner(), new_owner)
        deploy.mine_tx(owned_contract.transact({'from': new_owner}).setOwner(MASTER))

    def test_change_invalid_owner(self):
        invalid_account = deploy.W3.eth.accounts[1]
        with self.assertRaises(ValueError) as error:
            deploy.mine_tx(owned_contract.transact({'from': invalid_account}).setOwner(invalid_account))
        self.assertTrue("revert" in error.exception.args[0]['message'])
        self.assertEqual(-32000, error.exception.args[0]['code'])

def setUpModule():
    pass

def tearDownModule():
    pass

if __name__ == '__main__':
    unittest.main()

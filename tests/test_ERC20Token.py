import unittest
from deploy import MASTER
from deployutils import W3, compile_contracts, attempt_deploy, mine_tx
from testutils import assertTransactionReverts

ERC20Token_SOURCE = "contracts/ERC20Token.sol"


def setUpModule():
    print("Testing ERC20Token...")


def tearDownModule():
    print()


class TestERC20TokenSetup(unittest.TestCase):
    """
    Test the basic ERC20 Token contract
    """
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20token = attempt_deploy(compiled, 'ERC20Token', MASTER, ["Test token", "TEST", 10**26, MASTER])
        cls.transfer_to = lambda self, from_acc, to_acc, amt: mine_tx(self.erc20token.functions.transfer(to_acc, amt).transact({'from': from_acc}))
        cls.balance_of = lambda self, acc: self.erc20token.functions.balanceOf(acc).call()

    def test_check_MASTER_balance(self):
        balance = self.balance_of(MASTER)
        self.assertEquals(balance, 10**26)


class TestERC20TokenTransfers(unittest.TestCase):
    """
    TODO: check recent golem exploit involving addresses with trailing 0s?
      - http://vessenes.com/the-erc20-short-address-attack-explained/
      - Seems to be first account gives an allowance -> address with trailing 0s
      - That address then sends a transfer to himself/some other wallet (excluding his trailing 0s)
      - As long as there is enough balance in the first account (one that gave allowance) more than
        the allowance can be transferred
    """
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20token = attempt_deploy(compiled, 'ERC20Token', MASTER, ["Test token", "TEST", 10**26, MASTER])

        # Helper functions
        cls.transfer_to = lambda self, from_acc, to_acc, amt: mine_tx(
            self.erc20token.functions.transfer(to_acc, amt).transact({'from': from_acc})
        )
        cls.balance_of = lambda self, acc: self.erc20token.functions.balanceOf(acc).call()

    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balance_of(sender)
        receiver = W3.eth.accounts[1]
        receiver_balance = self.balance_of(receiver)
        transfer_amount = 10**25
        self.transfer_to(sender, receiver, transfer_amount)
        self.assertEquals(self.balance_of(receiver), receiver_balance+transfer_amount)
        self.assertEquals(self.balance_of(sender), sender_balance-transfer_amount)

    def test_succeed_transfer_0_value(self):
        """Test checking for success on a 0 value transfer"""
        pass

    def test_fail_transfer_0_balance(self):
        """Test failing a transfer of some value with 0 balance"""
        sender = W3.eth.accounts[2]
        sender_balance = self.balance_of(sender)
        self.assertEqual(sender_balance, 0)
        transfer_amount = 1
        receiver = MASTER

        assertTransactionReverts(self, self.erc20token.functions.transfer(receiver, transfer_amount), sender)


if __name__ == '__main__':
    unittest.main()

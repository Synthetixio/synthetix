import unittest
from deploy import MASTER
from deployutils import W3, compile_contracts, attempt_deploy, mine_tx
from testutils import assertTransactionReverts

ERC20Token_SOURCE = "contracts/ERC20Token.sol"


def setUpModule():
    print("Testing ERC20Token...")


def tearDownModule():
    print()


class TestERC20Token(unittest.TestCase):
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

    def test_transfer(self):
        initial_balance_a = self.balance_of(MASTER)
        transfer_to = W3.eth.accounts[1]
        initial_balance_b = self.balance_of(transfer_to)
        transfer_amount = 10**25
        self.transfer_to(MASTER, transfer_to, transfer_amount)
        self.assertEquals(self.balance_of(transfer_to), initial_balance_b+transfer_amount)
        self.assertEquals(self.balance_of(MASTER), initial_balance_a-transfer_amount)


if __name__ == '__main__':
    unittest.main()

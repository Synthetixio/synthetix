import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, ETHER
from utils.testutils import assertTransactionReverts, assertCallReverts

ERC20Token_SOURCE = "contracts/ERC20Token.sol"

def setUpModule():
    print("Testing ERC20Token...")

def tearDownModule():
    print()

class TestERC20Token(unittest.TestCase):
    """
    Test the basic ERC20 Token contract
    TODO: Add more edge case tests. Comment more. Still in progress.
      - check recent golem exploit involving addresses with trailing 0s?
      - http://vessenes.com/the-erc20-short-address-attack-explained/
      - Seems to be first account gives an allowance -> address with trailing 0s
      - That address then sends a transfer to himself/some other wallet (excluding his trailing 0s)
      - As long as there is enough balance in the first account (one that gave allowance) more than
        the allowance can be transferred    @classmethod
    """
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20token, cls.construction_txr = attempt_deploy(compiled, 'ERC20Token', 
                                                              MASTER, ["Test Token", "TEST", 
                                                              1000 * UNIT, MASTER])
        cls.totalSupply = lambda self: cls.erc20token.functions.totalSupply()
        cls.name = lambda self: cls.erc20token.functions.name()
        cls.symbol = lambda self: cls.erc20token.functions.symbol()
        cls.balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account)
        cls.allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender)

        cls.transfer = lambda self, to_acc, amt: cls.erc20token.functions.transfer(to_acc, amt)
        cls.approve = lambda self, spender, value: cls.erc20token.functions.approve(spender, value)
        cls.transferFrom = lambda self, onbehalf_acc, to, value: cls.erc20token.functions.transferFrom(onbehalf_acc, to, value)

    def test_constructor(self):
        self.assertEqual(self.name().call(), "Test Token")
        self.assertEqual(self.symbol().call(), "TEST")
        self.assertEqual(self.totalSupply().call(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(MASTER).call(), 1000 * UNIT)

    def test_getName(self):
        self.assertEqual(self.name().call(), "Test Token")

    def test_getSymbol(self):
        self.assertEqual(self.symbol().call(), "TEST")

    def test_getTotalSupply(self):
        self.assertEqual(self.totalSupply().call(), 1000 * UNIT)

    # Transfer 10 token from sender to receiver, then send 1 back - accounts[1]
    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender).call()

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver).call()

        value = 10 * UNIT
        total_supply = self.totalSupply().call()

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender).call(), sender_balance-value)
        self.assertEquals(self.totalSupply().call(), total_supply)

        sender = W3.eth.accounts[1]
        sender_balance = self.balanceOf(sender).call()

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 1 * UNIT
        total_supply = self.totalSupply().call()

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender).call(), sender_balance-value)
        self.assertEquals(self.totalSupply().call(), total_supply)

    # Attempt transfers from accounts where balance < value - accounts[2]
    def test_fail_transfer(self):
        sender = W3.eth.accounts[2]
        sender_balance = self.balanceOf(sender).call()

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 1 * UNIT

        assertTransactionReverts(self, self.transfer(receiver, value), sender)

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)

        sender = MASTER
        sender_balance = self.balanceOf(sender).call()

        receiver = W3.eth.accounts[2]
        receiver_balance = self.balanceOf(receiver).call()
        #value > total_supply
        value = 1001 * UNIT

        assertTransactionReverts(self, self.transfer(receiver, value), sender)

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)

    # Transfer 0 value from sender to receiver. No fee should be charged - accounts[3]
    def test_succeed_transfer_0_value(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender).call()

        receiver = W3.eth.accounts[3]
        receiver_balance = self.balanceOf(receiver).call()

        value = 0

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender).call(), sender_balance-value)

    # Transfer 0 value from sender to receiver with 0 balance. No fee should be charged - accounts[4]
    def test_succeed_transfer_0_balance(self):
        sender = W3.eth.accounts[4]
        sender_balance = self.balanceOf(sender).call()

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 0

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)  

    # Approval can be greater than totalSupply - accounts[5]
    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[5]
        approval_amount = 1 * UNIT
        total_supply = self.totalSupply().call()

        mine_tx(self.approve(spender, approval_amount).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), approval_amount)

        approval_amount = total_supply * 100

        mine_tx(self.approve(spender, approval_amount).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), approval_amount)

    # Transfer 10 tokens from spender to receiver on behalf of approver then send 1 back - accounts[6,7]
    def test_transferFrom(self):
        approver = MASTER
        spender = W3.eth.accounts[6]
        receiver = W3.eth.accounts[7]

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()
        total_supply = self.totalSupply().call()

        value = 10 * UNIT

        mine_tx(self.approve(spender, value).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), value)

        mine_tx(self.transferFrom(approver, receiver, value).transact({'from' : spender}))

        self.assertEqual(self.balanceOf(approver).call(), approver_balance - value)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEqual(self.totalSupply().call(), total_supply)

        approver = W3.eth.accounts[7]
        spender = W3.eth.accounts[6]
        receiver = MASTER

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()
        total_supply = self.totalSupply().call()

        value = 1 * UNIT

        mine_tx(self.approve(spender, value).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), value)

        mine_tx(self.transferFrom(approver, receiver, value).transact({'from' : spender}))

        self.assertEqual(self.balanceOf(approver).call(), approver_balance - value)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEqual(self.totalSupply().call(), total_supply)

    # Attempt to transfer 10 token from spender to receiver on behalf of approver with insufficient funds - accounts[8,9,10]
    def test_transferFrom_invalid(self):
        approver = W3.eth.accounts[8]
        spender = W3.eth.accounts[9]
        receiver = W3.eth.accounts[10]

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()

        value = 10 * UNIT

        mine_tx(self.approve(spender, value).transact({'from': approver}))

        assertTransactionReverts(self, self.transferFrom(approver, receiver, value), spender)

        self.assertEqual(self.balanceOf(approver).call(), approver_balance)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance)

        approver = W3.eth.accounts[10]
        spender = W3.eth.accounts[9]
        receiver = W3.eth.accounts[8]

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()
        
        value = 10 * UNIT

        mine_tx(self.approve(spender, value).transact({'from': approver}))

        assertTransactionReverts(self, self.transferFrom(approver, receiver, value), spender)

        self.assertEqual(self.balanceOf(approver).call(), approver_balance)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance)

if __name__ == '__main__':
    unittest.main()
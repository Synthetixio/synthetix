import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, ETHER, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, assertCallReverts

ERC20Token_SOURCE = "contracts/ERC20Token.sol"

def setUpModule():
    print("Testing ERC20Token...")

def tearDownModule():
    print()

class TestERC20Token(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)
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
        cls.totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.name = lambda self: cls.erc20token.functions.name().call()
        cls.symbol = lambda self: cls.erc20token.functions.symbol().call()
        cls.balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account).call()
        cls.allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender).call()

        cls.transfer = lambda self, sender, to, value: cls.erc20token.functions.transfer(to, value).transact({'from' : sender})
        cls.approve = lambda self, sender, spender, value: cls.erc20token.functions.approve(spender, value).transact({'from' : sender})
        cls.transferFrom = lambda self, sender, fromAccount, to, value: cls.erc20token.functions.transferFrom(fromAccount, to, value).transact({'from' : sender})

    def test_constructor(self):
        self.assertEqual(self.name(), "Test Token")
        self.assertEqual(self.symbol(), "TEST")
        self.assertEqual(self.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(MASTER), 1000 * UNIT)

    def test_getName(self):
        self.assertEqual(self.name(), "Test Token")

    def test_getSymbol(self):
        self.assertEqual(self.symbol(), "TEST")

    def test_getTotalSupply(self):
        self.assertEqual(self.totalSupply(), 1000 * UNIT)

    # Transfer 10 token from sender to receiver, then send 1 back.
    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender), sender_balance-value)
        self.assertEquals(self.totalSupply(), total_supply)

        sender = W3.eth.accounts[1]
        sender_balance = self.balanceOf(sender)

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver)

        value = 1 * UNIT
        total_supply = self.totalSupply()

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender), sender_balance-value)
        self.assertEquals(self.totalSupply(), total_supply)

    # Attempt transfers from accounts where balance < value
    def test_fail_transfer(self):
        sender = W3.eth.accounts[1]
        sender_balance = self.balanceOf(sender)

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver)

        value = 1 * UNIT

        assertReverts(self, self.transfer, [sender, receiver, value])

        self.assertEquals(self.balanceOf(sender), sender_balance)
        self.assertEquals(self.balanceOf(receiver), receiver_balance)

        sender = MASTER
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[2]
        receiver_balance = self.balanceOf(receiver)
        #value > total_supply
        value = 1001 * UNIT

        assertReverts(self, self.transfer, [sender, receiver, value])

        self.assertEquals(self.balanceOf(sender), sender_balance)
        self.assertEquals(self.balanceOf(receiver), receiver_balance)

    # Transfer 0 value from sender to receiver. No fee should be charged.
    def test_succeed_transfer_0_value(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver)

        value = 0

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance + value)
        self.assertEquals(self.balanceOf(sender), sender_balance - value)

    # Transfer 0 value from sender to receiver with 0 balance. No fee should be charged.
    def test_succeed_transfer_0_balance(self):
        sender = W3.eth.accounts[1]
        sender_balance = self.balanceOf(sender)

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver)

        value = 0

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(sender), sender_balance)
        self.assertEquals(self.balanceOf(receiver), receiver_balance)  

    # Approval can be greater than totalSupply.
    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        approval_amount = 1 * UNIT
        total_supply = self.totalSupply()

        mine_tx(self.approve(approver, spender, approval_amount))

        self.assertEqual(self.allowance(approver, spender), approval_amount)

        approval_amount = total_supply * 100

        mine_tx(self.approve(approver, spender, approval_amount))

        self.assertEqual(self.allowance(approver, spender), approval_amount)

    # Transfer 10 tokens from spender to receiver on behalf of approver then send 1 back.
    def test_transferFrom(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        receiver = W3.eth.accounts[2]

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver) 
        total_supply = self.totalSupply()

        value = 10 * UNIT

        mine_tx(self.approve(approver, spender, value))

        self.assertEqual(self.allowance(approver, spender), value)

        mine_tx(self.transferFrom(spender, approver, receiver, value))

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)

        approver = W3.eth.accounts[2]
        spender = W3.eth.accounts[1]
        receiver = MASTER

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)
        total_supply = self.totalSupply()

        value = 1 * UNIT

        mine_tx(self.approve(approver, spender, value))

        self.assertEqual(self.allowance(approver, spender), value)

        mine_tx(self.transferFrom(spender, approver, receiver, value))

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)

    # Attempt to transfer 10 token from spender to receiver on behalf of approver with insufficient funds.
    def test_transferFrom_invalid(self):
        approver = W3.eth.accounts[1]
        spender = W3.eth.accounts[2]
        receiver = W3.eth.accounts[3]

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT

        mine_tx(self.approve(approver, spender, value))

        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

        self.assertEqual(self.balanceOf(approver), approver_balance)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance)

        approver = W3.eth.accounts[3]
        spender = W3.eth.accounts[2]
        receiver = W3.eth.accounts[1]

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)
        
        value = 10 * UNIT

        mine_tx(self.approve(approver, spender, value))

        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

        self.assertEqual(self.balanceOf(approver), approver_balance)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance)

if __name__ == '__main__':
    unittest.main()
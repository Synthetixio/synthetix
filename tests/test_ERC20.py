import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, ETHER, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, assertCallReverts

ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"

def setUpModule():
    print("Testing ERC20...")

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
        the allowance can be transferred
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

    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This should fail because receiver has no tokens
        assertReverts(self, self.transfer, [receiver, sender, value])
        self.assertEqual(receiver_balance, 0)

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance+value)
        self.assertEquals(self.balanceOf(sender), sender_balance-value)
        self.assertEquals(self.totalSupply(), total_supply)

        value = 1001 * UNIT
        total_supply = self.totalSupply()

        # This should fail because balance < value and balance > totalSupply
        assertReverts(self, self.transfer, [sender, receiver, value])

        # 0 value transfers are allowed.
        value = 0
        mine_tx(self.transfer(sender, receiver, value))

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = W3.eth.accounts[2]
        mine_tx(self.transfer(no_tokens, receiver, value))

    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        approval_amount = 1 * UNIT

        mine_tx(self.approve(approver, spender, approval_amount))
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        mine_tx(self.approve(approver, spender, approval_amount))
        self.assertEqual(self.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        receiver = W3.eth.accounts[2]

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver) 

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This fails because there has been no approval yet
        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

        mine_tx(self.approve(approver, spender, value))
        self.assertEqual(self.allowance(approver, spender), value)
        mine_tx(self.transferFrom(spender, approver, receiver, value))

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)

        approver = W3.eth.accounts[4]
        # This account has no tokens
        approver_balance = self.balanceOf(approver) 
        self.assertEqual(approver_balance, 0)

        mine_tx(self.approve(approver, spender, value))
        self.assertEqual(self.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

class TestERC20FeeToken(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)
    """
    Test the basic ERC20 Fee Token contract
    """
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ERC20FeeToken_SOURCE])
        cls.erc20feetoken, cls.construction_txr = attempt_deploy(compiled, "ERC20FeeToken", MASTER, 
                                                                 ["Test Fee Token", "FEE", 1000 * UNIT, 
                                                                  MASTER, UNIT//20, MASTER, MASTER])
        cls.owner = lambda self: cls.erc20feetoken.functions.owner().call()
        cls.totalSupply = lambda self: cls.erc20feetoken.functions.totalSupply().call()
        cls.name = lambda self: cls.erc20feetoken.functions.name().call()
        cls.symbol = lambda self: cls.erc20feetoken.functions.symbol().call()
        cls.balanceOf = lambda self, account: self.erc20feetoken.functions.balanceOf(account).call()
        cls.allowance = lambda self, account, spender: self.erc20feetoken.functions.allowance(account, spender).call()
        cls.transferFeeRate = lambda self: cls.erc20feetoken.functions.transferFeeRate().call()
        cls.maxTransferFeeRate = lambda self: cls.erc20feetoken.functions.maxTransferFeeRate().call()
        cls.feePool = lambda self: cls.erc20feetoken.functions.feePool().call()
        cls.feeAuthority = lambda self: cls.erc20feetoken.functions.feeAuthority().call()

        cls.transferFeeIncurred = lambda self, value: cls.erc20feetoken.functions.transferFeeIncurred(value).call()
        cls.transferPlusFee = lambda self, value: cls.erc20feetoken.functions.transferPlusFee(value).call()

        cls.setOwner = lambda self, sender, address: cls.erc20feetoken.functions.setOwner(address).transact({'from': sender})
        cls.setTransferFeeRate = lambda self, sender, new_fee_rate: cls.erc20feetoken.functions.setTransferFeeRate(new_fee_rate).transact({'from': sender})
        cls.transfer = lambda self, sender, to, value: cls.erc20feetoken.functions.transfer(to, value).transact({'from': sender})
        cls.approve = lambda self, sender, spender, value: cls.erc20feetoken.functions.approve(spender, value).transact({'from': sender})
        cls.transferFrom = lambda self, sender, fromAccount, to, value: cls.erc20feetoken.functions.transferFrom(fromAccount, to, value).transact({'from': sender})

        cls.withdrawFee = lambda self, sender, account, value: cls.erc20feetoken.functions.withdrawFee(account, value).transact({'from' : sender})

    def test_constructor(self):
        self.assertEqual(self.name(), "Test Fee Token")
        self.assertEqual(self.symbol(), "FEE")
        self.assertEqual(self.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(self.transferFeeRate(), UNIT//20)
        self.assertEqual(self.feeAuthority(), MASTER)

    def test_getSetOwner(self):
        owner = self.owner()
        new_owner = W3.eth.accounts[1]

        # Only the owner must be able to change the new owner.
        assertReverts(self, self.setOwner, [new_owner, new_owner])

        mine_tx(self.setOwner(owner, new_owner))
        self.assertEqual(self.owner(), new_owner)
        mine_tx(self.setOwner(new_owner, owner))

    def test_getSetTransferFeeRate(self):
        transfer_fee_rate = self.transferFeeRate()
        new_transfer_fee_rate = transfer_fee_rate + UNIT//20
        owner = self.owner()
        fake_owner = W3.eth.accounts[1]

        # Only the owner is able to set the Transfer Fee Rate
        assertReverts(self, self.setTransferFeeRate, [fake_owner, new_transfer_fee_rate])
        mine_tx(self.setTransferFeeRate(owner, new_transfer_fee_rate))
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

        # Maximum fee rate is UNIT /10
        bad_transfer_fee_rate = UNIT
        assertReverts(self, self.setTransferFeeRate, [owner, bad_transfer_fee_rate])
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

    def test_getTransferFeeIncurred(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate() / UNIT
        self.assertEqual(self.transferFeeIncurred(value), fee)

        value = 0 
        fee = value * self.transferFeeRate() / UNIT
        self.assertEqual(self.transferFeeIncurred(value), fee)

    def test_getTransferPlusFee(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate() / UNIT
        total = value + fee
        self.assertEqual(self.transferPlusFee(value), total)

        value = 0
        fee = value * self.transferFeeRate() / UNIT
        total = value + fee
        self.assertEqual(self.transferPlusFee(value), total)

    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This should fail becasue receiver has no tokens
        assertReverts(self, self.transfer, [receiver, sender, value])
        self.assertEqual(receiver_balance, 0)

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance + value)
        self.assertEquals(self.balanceOf(sender), sender_balance - total_value)
        self.assertEquals(self.totalSupply(), total_supply)
        self.assertEquals(self.feePool(), fee_pool + fee)

        value = 1001 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This should fail because balance < value
        assertReverts(self, self.transfer, [sender, receiver, value])

        # 0 Value transfers are allowed and incur no fee.
        value = 0
        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        mine_tx(self.transfer(sender, receiver, value))

        self.assertEquals(self.totalSupply(), total_supply)
        self.assertEquals(self.feePool(), fee_pool)

        # It is also possible to send 0 value transfer from an account with 0 balance
        value = 0
        no_tokens = W3.eth.accounts[2]
        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        mine_tx(self.transfer(no_tokens, receiver, value))

        self.assertEquals(self.totalSupply(), total_supply)
        self.assertEquals(self.feePool(), fee_pool)

    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        approval_amount = 1 * UNIT

        mine_tx(self.approve(approver, spender, approval_amount))
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        mine_tx(self.approve(approver, spender, approval_amount))
        self.assertEqual(self.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        receiver = W3.eth.accounts[2]

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This fails because there has been no approval yet
        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

        # Approve total amount inclusive of fee
        mine_tx(self.approve(approver, spender, total_value))
        self.assertEqual(self.allowance(approver, spender), total_value)
        mine_tx(self.transferFrom(spender, approver, receiver, value))

        self.assertEqual(self.balanceOf(approver), approver_balance - total_value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        approver = W3.eth.accounts[4]
        # This account has no tokens
        approver_balance = self.balanceOf(approver) 
        self.assertEqual(approver_balance, 0)

        mine_tx(self.approve(approver, spender, total_value))

        # This should fail because the approver has no tokens.
        assertReverts(self, self.transferFrom, [spender, approver, receiver, value])

    def test_withdrawFee(self): 
        fee_authority = MASTER
        receiver = W3.eth.accounts[1]
        fee_receiver = W3.eth.accounts[2]
        not_fee_authority = W3.eth.accounts[3]

        fee_authority_balance = self.balanceOf(fee_authority)
        receiver_balance = self.balanceOf(receiver)
        fee_receiver_balance = self.balanceOf(fee_receiver)

        value = 500 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        mine_tx(self.transfer(fee_authority, receiver, value))

        self.assertEquals(self.balanceOf(receiver), receiver_balance + value)
        self.assertEquals(self.balanceOf(fee_authority), fee_authority_balance - total_value)
        self.assertEquals(self.totalSupply(), total_supply)
        self.assertEquals(self.feePool(), fee_pool + fee)

        fee_pool = self.feePool()

        # This should fail because only the Fee Authority can withdraw fees
        assertReverts(self, self.withdrawFee, [not_fee_authority, not_fee_authority, fee_pool])

        mine_tx(self.withdrawFee(fee_authority, fee_receiver, fee_pool))

        self.assertEquals(self.balanceOf(fee_receiver), fee_receiver_balance + fee_pool)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEquals(self.feePool(), 0)

if __name__ == '__main__':
    unittest.main()
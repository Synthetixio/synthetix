import unittest

from utils.deployutils import W3, UNIT, MASTER, ETHER
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts


ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"


def setUpModule():
    print("Testing ERC20Tokens...")


def tearDownModule():
    print()


class TestERC20Token(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20token, cls.construction_txr = attempt_deploy(compiled, 'ERC20Token', 
                                                              MASTER, ["Test Token", "TEST", 
                                                              1000 * UNIT, MASTER])

        cls.totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.name = lambda self: cls.erc20token.functions.name().call()
        cls.symbol = lambda self: cls.erc20token.functions.symbol().call()
        cls.balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account).call()
        cls.allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender).call()

        cls.transfer = lambda self, sender, to, value: mine_tx(cls.erc20token.functions.transfer(to, value).transact({'from' : sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(cls.erc20token.functions.approve(spender, value).transact({'from' : sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(cls.erc20token.functions.transferFrom(fromAccount, to, value).transact({'from' : sender}))

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
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer, receiver, sender, value)

        self.transfer(sender, receiver, value)
        self.assertEqual(self.balanceOf(receiver), receiver_balance+value)
        self.assertEqual(self.balanceOf(sender), sender_balance-value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.transfer, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.balanceOf(sender)
        pre_receiver_balance = self.balanceOf(receiver)
        self.transfer(sender, receiver, value)
        self.assertEqual(self.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = W3.eth.accounts[2]
        self.assertEqual(self.balanceOf(no_tokens), 0)
        self.transfer(no_tokens, receiver, value)
        self.assertEqual(self.balanceOf(no_tokens), 0)

    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        approval_amount = 1 * UNIT

        self.approve(approver, spender, approval_amount)
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        self.approve(approver, spender, approval_amount)
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
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

        self.approve(approver, spender, 2 * value)
        self.assertEqual(self.allowance(approver, spender), 2 * value)

        self.assertReverts(self.transferFrom, spender, approver, receiver, 2 * value + 1)
        self.transferFrom(spender, approver, receiver, value)

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.allowance(approver, spender), value)
        self.assertEqual(self.totalSupply(), total_supply)

        # Empty the account
        self.transferFrom(spender, approver, receiver, value)

        approver = W3.eth.accounts[4]
        # This account has no tokens
        approver_balance = self.balanceOf(approver) 
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.allowance(approver, spender), 0)

        self.approve(approver, spender, value)
        self.assertEqual(self.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)


class TestERC20FeeToken(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)
    
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.initial_beneficiary = W3.eth.accounts[2]
        cls.fee_authority = W3.eth.accounts[3]
        cls.token_owner = W3.eth.accounts[4]

        compiled = compile_contracts([ERC20FeeToken_SOURCE])
        cls.erc20feetoken, cls.construction_txr = attempt_deploy(compiled, "ERC20FeeToken", MASTER, 
                                                                 ["Test Fee Token", "FEE", 1000 * UNIT, 
                                                                  cls.initial_beneficiary, UNIT // 20,
                                                                  cls.fee_authority, cls.token_owner])

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

        cls.setOwner = lambda self, sender, address: mine_tx(cls.erc20feetoken.functions.setOwner(address).transact({'from': sender}))
        cls.setTransferFeeRate = lambda self, sender, new_fee_rate: mine_tx(cls.erc20feetoken.functions.setTransferFeeRate(new_fee_rate).transact({'from': sender}))
        cls.transfer = lambda self, sender, to, value: mine_tx(cls.erc20feetoken.functions.transfer(to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(cls.erc20feetoken.functions.approve(spender, value).transact({'from': sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(cls.erc20feetoken.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.withdrawFee = lambda self, sender, account, value: cls.erc20feetoken.functions.withdrawFee(account, value).transact({'from' : sender})

    def test_constructor(self):
        self.assertEqual(self.name(), "Test Fee Token")
        self.assertEqual(self.symbol(), "FEE")
        self.assertEqual(self.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(self.initial_beneficiary), 1000 * UNIT)
        self.assertEqual(self.transferFeeRate(), UNIT // 20)
        self.assertEqual(self.feeAuthority(), self.fee_authority)

    def test_getSetOwner(self):
        owner = self.owner()
        new_owner = W3.eth.accounts[1]
        self.assertNotEqual(owner, new_owner)

        # Only the owner must be able to change the new owner.
        self.assertReverts(self.setOwner, new_owner, new_owner)

        self.setOwner(owner, new_owner)
        self.assertEqual(self.owner(), new_owner)
        self.setOwner(new_owner, owner)

    def test_getSetTransferFeeRate(self):
        transfer_fee_rate = self.transferFeeRate()
        new_transfer_fee_rate = transfer_fee_rate + UNIT // 20
        owner = self.owner()
        fake_owner = W3.eth.accounts[1]
        self.assertNotEqual(owner, fake_owner)

        # Only the owner is able to set the Transfer Fee Rate
        self.assertReverts(self.setTransferFeeRate, fake_owner, new_transfer_fee_rate)
        self.setTransferFeeRate(owner, new_transfer_fee_rate)
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

        # Maximum fee rate is UNIT /10
        bad_transfer_fee_rate = UNIT
        self.assertReverts(self.setTransferFeeRate, owner, bad_transfer_fee_rate)
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

    def test_getTransferFeeIncurred(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate() // UNIT
        self.assertEqual(self.transferFeeIncurred(value), fee)

        self.assertEqual(self.transferFeeIncurred(0), 0)

    def test_getTransferPlusFee(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate() // UNIT
        total = value + fee
        self.assertEqual(self.transferPlusFee(value), total)

        self.assertEqual(self.transferPlusFee(0), 0)

    def test_transfer(self):
        sender = self.initial_beneficiary
        sender_balance = self.balanceOf(sender)

        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer, receiver, sender, value)

        self.transfer(sender, receiver, value)

        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.balanceOf(sender), sender_balance - total_value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        value = 1001 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This should fail because balance < value
        self.assertReverts(self.transfer, sender, receiver, value)

        # 0 Value transfers are allowed and incur no fee.
        value = 0
        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        self.transfer(sender, receiver, value)

        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool)

        # It is also possible to send 0 value transfer from an account with 0 balance
        value = 0
        no_tokens = W3.eth.accounts[4]
        self.assertEqual(self.balanceOf(no_tokens), 0)
        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        self.transfer(no_tokens, receiver, value)

        self.assertEqual(self.balanceOf(no_tokens), 0)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool)

    def test_approve(self):
        approver = MASTER
        spender = W3.eth.accounts[1]
        approval_amount = 1 * UNIT

        self.approve(approver, spender, approval_amount)
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        self.approve(approver, spender, approval_amount)
        self.assertEqual(self.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = self.initial_beneficiary
        spender = W3.eth.accounts[0]
        receiver = W3.eth.accounts[1]
        self.assertNotEqual(approver, spender)
        self.assertNotEqual(approver, receiver)

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver)

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This fails because there has been no approval yet
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

        # Approve total amount inclusive of fee
        self.approve(approver, spender, total_value)
        self.assertEqual(self.allowance(approver, spender), total_value)

        self.transferFrom(spender, approver, receiver, value // 10)
        self.assertEqual(self.allowance(approver, spender), 9 * total_value // 10)

        self.assertEqual(self.balanceOf(approver), approver_balance - total_value // 10)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value // 10)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee // 10)

        self.transferFrom(spender, approver, receiver, 9 * value // 10)

        self.assertEqual(self.allowance(approver, spender), 0)
        self.assertEqual(self.balanceOf(approver), approver_balance - total_value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        approver = W3.eth.accounts[4]
        # This account has no tokens
        approver_balance = self.balanceOf(approver) 
        self.assertEqual(approver_balance, 0)

        self.approve(approver, spender, total_value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

    def test_withdrawFee(self): 
        receiver = W3.eth.accounts[1]
        fee_receiver = W3.eth.accounts[2]
        not_fee_authority = W3.eth.accounts[4]
        self.assertNotEqual(self.fee_authority, not_fee_authority)
        self.assertNotEqual(self.fee_authority, receiver)
        self.assertNotEqual(self.fee_authority, fee_receiver)


        value = 500 * UNIT
        total_value = self.transferPlusFee(value)
        self.transfer(self.initial_beneficiary, self.fee_authority, total_value)
        self.assertEqual(self.balanceOf(self.fee_authority), total_value)

        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        fee_authority_balance = self.balanceOf(self.fee_authority)
        receiver_balance = self.balanceOf(receiver)
        fee_receiver_balance = self.balanceOf(fee_receiver)

        self.transfer(self.fee_authority, receiver, value)

        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.balanceOf(self.fee_authority), fee_authority_balance - total_value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        fee_pool = self.feePool()

        # This should fail because only the Fee Authority can withdraw fees
        self.assertReverts(self.withdrawFee, not_fee_authority, not_fee_authority, fee_pool)

        # Failure due to too-large a withdrawal.
        self.assertReverts(self.withdrawFee, self.fee_authority, fee_receiver, fee_pool + 1)

        # Partial withdrawal leaves stuff in the pool
        self.withdrawFee(self.fee_authority, fee_receiver, fee_pool // 4)
        self.assertEqual(3 * fee_pool // 4, self.feePool())
        self.assertEqual(self.balanceOf(fee_receiver), fee_receiver_balance + fee_pool // 4)

        # Withdraw the rest
        self.withdrawFee(self.fee_authority, fee_receiver, 3 * fee_pool // 4)

        self.assertEqual(self.balanceOf(fee_receiver), fee_receiver_balance + fee_pool)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), 0)

if __name__ == '__main__':
    unittest.main()
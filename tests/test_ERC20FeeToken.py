import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, ETHER
from utils.testutils import assertTransactionReverts, assertCallReverts

ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"

def setUpModule():
    print("Testing ERC20FeeToken...")

def tearDownModule():
    print()

class TestERC20FeeToken(unittest.TestCase):
    """
    Test the basic ERC20 Fee Token contract
    TODO: Add more edge case tests. Comment more. Still in progress.
    """
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ERC20FeeToken_SOURCE])
        cls.erc20feetoken, cls.construction_txr = attempt_deploy(compiled, "ERC20FeeToken", MASTER, 
                                                                 ["Test Fee Token", "FEE", 1000 * UNIT, 
                                                                  MASTER, UNIT//20, MASTER, MASTER])
        cls.owner = lambda self: cls.erc20feetoken.functions.owner()
        cls.totalSupply = lambda self: cls.erc20feetoken.functions.totalSupply()
        cls.name = lambda self: cls.erc20feetoken.functions.name()
        cls.symbol = lambda self: cls.erc20feetoken.functions.symbol()
        cls.balanceOf = lambda self, account: self.erc20feetoken.functions.balanceOf(account)
        cls.allowance = lambda self, account, spender: self.erc20feetoken.functions.allowance(account, spender)
        cls.transferFeeRate = lambda self: cls.erc20feetoken.functions.transferFeeRate()
        cls.maxTransferFeeRate = lambda self: cls.erc20feetoken.functions.maxTransferFeeRate()
        cls.feePool = lambda self: cls.erc20feetoken.functions.feePool()
        cls.feeAuthority = lambda self: cls.erc20feetoken.functions.feeAuthority()

        cls.setOwner = lambda self, address: cls.erc20feetoken.functions.setOwner(address)
        cls.setTransferFeeRate = lambda self, new_fee_rate: cls.erc20feetoken.functions.setTransferFeeRate(new_fee_rate)
        cls.transferFeeIncurred = lambda self, value: cls.erc20feetoken.functions.transferFeeIncurred(value)
        cls.transferPlusFee = lambda self, value: cls.erc20feetoken.functions.transferPlusFee(value)

        cls.transfer = lambda self, to, value: cls.erc20feetoken.functions.transfer(to, value)
        cls.approve = lambda self, spender, value: cls.erc20feetoken.functions.approve(spender, value)
        cls.transferFrom = lambda self, fromAccount, to, value: cls.erc20feetoken.functions.transferFrom(fromAccount, to, value)

        cls.withdrawFee = lambda self, account, value: cls.erc20feetoken.functions.withdrawFee(account, value)

    def test_constructor(self):
        self.assertEqual(self.name().call(), "Test Fee Token")
        self.assertEqual(self.symbol().call(), "FEE")
        self.assertEqual(self.totalSupply().call(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(MASTER).call(), 1000 * UNIT)
        self.assertEqual(self.transferFeeRate().call(), UNIT//20)
        self.assertEqual(self.feeAuthority().call(), MASTER)

    def test_getName(self):
        self.assertEqual(self.name().call(), "Test Fee Token")

    def test_getSymbol(self):
        self.assertEqual(self.symbol().call(), "FEE")

    def test_getTotalSupply(self):
        self.assertEqual(self.totalSupply().call(), 1000 * UNIT)

    def test_getFeeAuthority(self):
        self.assertEqual(self.feeAuthority().call(), MASTER)

    # - accounts[1]
    def test_getSetOwner(self):
        owner = self.owner().call()
        # Owner should be MASTER to begin with.
        self.assertEqual(owner, MASTER)
        new_owner = W3.eth.accounts[1]

        # Only the owner must be able to change the new owner.
        assertTransactionReverts(self, self.setOwner(new_owner), new_owner)

        mine_tx(self.setOwner(new_owner).transact({'from': owner}))
        self.assertEqual(self.owner().call(), new_owner)
        mine_tx(self.setOwner(owner).transact({'from': new_owner}))

    # - accounts[1]
    def test_getSetTransferFeeRate(self):
        transfer_fee_rate = self.transferFeeRate().call()
        new_transfer_fee_rate = transfer_fee_rate + UNIT//20
        owner = self.owner().call()
        fake_owner = W3.eth.accounts[1]

        # Only the owner is able to set the Transfer Fee Rate
        assertTransactionReverts(self, self.setTransferFeeRate(new_transfer_fee_rate), fake_owner)

        mine_tx(self.setTransferFeeRate(new_transfer_fee_rate).transact({'from': owner}))

        self.assertEqual(self.transferFeeRate().call(), new_transfer_fee_rate)

        # Maximum fee rate is UNIT /10
        bad_transfer_fee_rate = UNIT
        assertTransactionReverts(self, self.setTransferFeeRate(bad_transfer_fee_rate), owner)

        self.assertEqual(self.transferFeeRate().call(), new_transfer_fee_rate)

    def test_transferFeeIncurred(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate().call() / UNIT
        self.assertEqual(self.transferFeeIncurred(value).call(), fee)

        value = 0 
        fee = value * self.transferFeeRate().call() / UNIT
        self.assertEqual(self.transferFeeIncurred(value).call(), fee)

    def test_transferPlusFee(self):
        value = 10 * UNIT
        fee = value * self.transferFeeRate().call() / UNIT
        total = value + fee
        self.assertEqual(self.transferPlusFee(value).call(), total)

        value = 0
        fee = value * self.transferFeeRate().call() / UNIT
        total = value + fee
        self.assertEqual(self.transferPlusFee(value).call(), total)

    # Send 10 tokens from sender to reciver, then send 1 back - accounts[1].
    def test_transfer(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender).call()
        receiver = W3.eth.accounts[1]
        receiver_balance = self.balanceOf(receiver).call()

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEquals(self.balanceOf(sender).call(), sender_balance - total_value)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool + fee)

        sender = W3.eth.accounts[1]
        sender_balance = self.balanceOf(sender).call()
        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 1 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEquals(self.balanceOf(sender).call(), sender_balance - total_value)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool + fee)

    # Attempt transfers from accounts where balance < amount - accounts[2].
    def test_fail_transfer(self):
        sender = W3.eth.accounts[2]
        sender_balance = self.balanceOf(sender).call()
        self.assertEqual(sender_balance, 0)

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 1 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()
        
        # This should fail because sender has no tokens
        assertTransactionReverts(self, self.transfer(receiver, value), sender)

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool)

        sender = MASTER
        sender_balance = self.balanceOf(sender).call()

        receiver = W3.eth.accounts[2]
        receiver_balance = self.balanceOf(receiver).call()

        # This should fail because trying to send more than total_supply
        value = 1001 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        assertTransactionReverts(self, self.transfer(receiver, value), sender)

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool)

    # Transfer 0 value from sender to receiver. No fee should be charged - accounts[3].
    def test_succeed_transfer_0_value(self):
        sender = MASTER
        sender_balance = self.balanceOf(sender).call()

        receiver = W3.eth.accounts[3]
        receiver_balance = self.balanceOf(receiver).call()

        value = 0
        fee = self.transferFeeIncurred(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool)

    # Transfer 0 value from sender to receiver with 0 balance. No fee is charged - accounts[4]
    def test_succeed_transfer_0_balance(self):
        sender = W3.eth.accounts[4]
        sender_balance = self.balanceOf(sender).call()

        receiver = MASTER
        receiver_balance = self.balanceOf(receiver).call()

        value = 0

        mine_tx(self.transfer(receiver, value).transact({'from': sender}))

        self.assertEquals(self.balanceOf(sender).call(), sender_balance)
        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance)  

    # Any positive approval amount is valid, even greater than total_supply  - accounts[5]
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

    # Transfer 10 tokens from spender to receiver on behalf of approver, then send 1 back - accounts[6,7]
    def test_transferFrom(self):
        approver = MASTER
        spender = W3.eth.accounts[6]
        receiver = W3.eth.accounts[7]

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        # Approve total amount inclusive of fee
        mine_tx(self.approve(spender, total_value).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), total_value)

        mine_tx(self.transferFrom(approver, receiver, value).transact({'from': spender}))

        self.assertEqual(self.balanceOf(approver).call(), approver_balance - total_value)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEqual(self.totalSupply().call(), total_supply)
        self.assertEqual(self.feePool().call(), fee_pool + fee)

        approver = W3.eth.accounts[7]
        spender = W3.eth.accounts[6]
        receiver = MASTER

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()

        value = 1 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.approve(spender, total_value).transact({'from': approver}))

        self.assertEqual(self.allowance(approver, spender).call(), total_value)

        mine_tx(self.transferFrom(approver, receiver, value).transact({'from' : spender}))

        self.assertEqual(self.balanceOf(approver).call(), approver_balance - total_value)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEqual(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool + fee)

    # Attempt to transfer 10 token from spender to receiver on behalf of approver with insufficient funds - accounts[8,9,10]
    def test_transferFrom_invalid(self):
        approver = W3.eth.accounts[8]
        spender = W3.eth.accounts[9]
        receiver = W3.eth.accounts[10]

        approver_balance = self.balanceOf(approver).call()
        spender_balance = self.balanceOf(spender).call()
        receiver_balance = self.balanceOf(receiver).call()

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.approve(spender, value).transact({'from': approver}))

        assertTransactionReverts(self, self.transferFrom(approver, receiver, value), spender)

        self.assertEqual(self.balanceOf(approver).call(), approver_balance)
        self.assertEqual(self.balanceOf(spender).call(), spender_balance)
        self.assertEqual(self.balanceOf(receiver).call(), receiver_balance)
        self.assertEqual(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool)

    # accounts[11, 12, 13]
    def test_withdrawFee(self): 
        fee_authority = MASTER
        receiver = W3.eth.accounts[11]
        fee_receiver = W3.eth.accounts[12]
        not_fee_authority = W3.eth.accounts[13]

        fee_authority_balance = self.balanceOf(fee_authority).call()
        receiver_balance = self.balanceOf(receiver).call()
        fee_receiver_balance = self.balanceOf(fee_receiver).call()

        value = 500 * UNIT
        fee = self.transferFeeIncurred(value).call()
        total_value = self.transferPlusFee(value).call()
        total_supply = self.totalSupply().call()
        fee_pool = self.feePool().call()

        mine_tx(self.transfer(receiver, value).transact({'from': fee_authority}))

        self.assertEquals(self.balanceOf(receiver).call(), receiver_balance + value)
        self.assertEquals(self.balanceOf(fee_authority).call(), fee_authority_balance - total_value)
        self.assertEquals(self.totalSupply().call(), total_supply)
        self.assertEquals(self.feePool().call(), fee_pool + fee)

        fee_pool = self.feePool().call()

        # Only the Fee Authority can withdraw fees
        assertTransactionReverts(self, self.withdrawFee(not_fee_authority, fee_pool), not_fee_authority)

        mine_tx(self.withdrawFee(fee_receiver, fee_pool).transact({'from': fee_authority}))

        self.assertEquals(self.feePool().call(), 0)
        self.assertEquals(self.balanceOf(fee_receiver).call(), fee_receiver_balance + fee_pool)
        self.assertEqual(self.totalSupply().call(), total_supply)

if __name__ == '__main__':
    unittest.main()
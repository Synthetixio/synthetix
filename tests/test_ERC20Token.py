import unittest

from utils.deployutils import W3, UNIT, MASTER, DUMMY, fresh_account, fresh_accounts
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS


ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20State_SOURCE = "contracts/ERC20State.sol"


def setUpModule():
    print("Testing ERC20Token...")


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

        cls.the_owner = DUMMY

        cls.compiled = compile_contracts([ERC20Token_SOURCE, ERC20State_SOURCE])
        cls.erc20_abi = cls.compiled['ERC20Token']['abi']
        cls.erc20_event_dict = generate_topic_event_map(cls.erc20_abi)
        cls.erc20token, cls.construction_txr = attempt_deploy(cls.compiled, 'ERC20Token', 
                                                              MASTER,
                                                              ["Test Token", "TEST", 
                                                               0, cls.the_owner,
                                                               ZERO_ADDRESS, cls.the_owner])
        cls.erc20state, _ = attempt_deploy(cls.compiled, 'ERC20State',
                                           MASTER,
                                           [cls.the_owner, 1000 * UNIT, cls.the_owner, cls.erc20token.address])

        mine_tx(cls.erc20token.functions.setState(cls.erc20state.address).transact({'from': cls.the_owner}))

        cls.totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.state = lambda self: cls.erc20token.functions.state().call()
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
        self.assertEqual(self.balanceOf(self.the_owner), 1000 * UNIT)
        self.assertEqual(self.state(), self.erc20state.address)
        self.assertEqual(self.erc20state.functions.associatedContract().call(), self.erc20token.address)

    def test_provide_state(self):
        erc20state, _ = attempt_deploy(self.compiled, 'ERC20State',
                                       MASTER,
                                       [self.the_owner, 0,
                                       self.the_owner, self.erc20token.address])

        erc20token, _ = attempt_deploy(self.compiled, 'ERC20Token', 
                                       MASTER,
                                      ["Test Token", "TEST", 
                                       1000 * UNIT, MASTER,
                                       ZERO_ADDRESS, DUMMY])
        self.assertNotEqual(erc20token.functions.state().call(), ZERO_ADDRESS)
  
        erc20token, _ = attempt_deploy(self.compiled, 'ERC20Token', 
                                       MASTER,
                                      ["Test Token", "TEST", 
                                       1000 * UNIT, MASTER,
                                       erc20state.address, DUMMY])
        self.assertEqual(erc20token.functions.state().call(), erc20state.address)

    def test_transfer(self):
        sender = self.the_owner
        sender_balance = self.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer, receiver, sender, value)
        tx_receipt = self.transfer(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Transfer")
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
        tx_receipt = self.transfer(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = fresh_account()
        self.assertEqual(self.balanceOf(no_tokens), 0)
        tx_receipt = self.transfer(no_tokens, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.balanceOf(no_tokens), 0)

    def test_approve(self):
        approver, spender = fresh_accounts(2)
        approval_amount = 1 * UNIT

        tx_receipt = self.approve(approver, spender, approval_amount)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        tx_receipt = self.approve(approver, spender, approval_amount)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = self.the_owner
        spender, receiver = fresh_accounts(2)

        approver_balance = self.balanceOf(approver)
        spender_balance = self.balanceOf(spender)
        receiver_balance = self.balanceOf(receiver) 

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

        tx_receipt = self.approve(approver, spender, 2 * value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), 2 * value)

        self.assertReverts(self.transferFrom, spender, approver, receiver, 2 * value + 1)
        tx_receipt = self.transferFrom(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.allowance(approver, spender), value)
        self.assertEqual(self.totalSupply(), total_supply)

        # Empty the account
        tx_receipt = self.transferFrom(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        approver = fresh_account()
        # This account has no tokens
        approver_balance = self.balanceOf(approver) 
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.allowance(approver, spender), 0)

        tx_receipt = self.approve(approver, spender, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)


if __name__ == '__main__':
    unittest.main()
import unittest

from utils.deployutils import W3, UNIT, MASTER, DUMMY, fresh_account, fresh_accounts
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

ExternStateProxyToken_SOURCE = "tests/contracts/PublicExternStateProxyToken.sol"
TokenState_SOURCE = "contracts/TokenState.sol"
Proxy_SOURCE = "contracts/Proxy.sol"


def setUpModule():
    print("Testing ExternStateProxyToken...")


def tearDownModule():
    print()


class TestExternStateProxyToken(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.the_owner = DUMMY

        cls.compiled = compile_contracts([ExternStateProxyToken_SOURCE, TokenState_SOURCE, Proxy_SOURCE],
                                         remappings=['""=contracts'])
        cls.token_abi = cls.compiled['PublicExternStateProxyToken']['abi']
        cls.token_event_dict = generate_topic_event_map(cls.token_abi)
        cls.token_real, cls.construction_txr = attempt_deploy(cls.compiled, 'PublicExternStateProxyToken',
                                                                   MASTER,
                                                                   ["Test Token", "TEST",
                                                                    1000 * UNIT, cls.the_owner,
                                                                    ZERO_ADDRESS, cls.the_owner])

        cls.tokenstate = W3.eth.contract(address=cls.token_real.functions.state().call(),
                                         abi=cls.compiled['TokenState']['abi'])

        mine_tx(cls.token_real.functions.setState(cls.tokenstate.address).transact({'from': cls.the_owner}))

        cls.tokenproxy, _ = attempt_deploy(cls.compiled, 'Proxy',
                                           MASTER, [cls.token_real.address, cls.the_owner])
        mine_tx(cls.token_real.functions.setProxy(cls.tokenproxy.address).transact({'from': cls.the_owner}))
        cls.token = W3.eth.contract(address=cls.tokenproxy.address, abi=cls.compiled['PublicExternStateProxyToken']['abi'])

        cls.owner = lambda self: cls.token.functions.owner().call()
        cls.totalSupply = lambda self: cls.token.functions.totalSupply().call()
        cls.state = lambda self: cls.token.functions.state().call()
        cls.name = lambda self: cls.token.functions.name().call()
        cls.symbol = lambda self: cls.token.functions.symbol().call()
        cls.balanceOf = lambda self, account: cls.token.functions.balanceOf(account).call()
        cls.allowance = lambda self, account, spender: cls.token.functions.allowance(account, spender).call()

        cls.setState = lambda self, sender, new_state: mine_tx(
            cls.token.functions.setState(new_state).transact({'from': sender}))
        cls.transfer_byProxy = lambda self, sender, to, value: mine_tx(
            cls.token.functions.transfer_byProxy(to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(
            cls.token.functions.approve(spender, value).transact({'from': sender}))
        cls.transferFrom_byProxy = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.token.functions.transferFrom_byProxy(fromAccount, to, value).transact({'from': sender}))

    def test_constructor(self):
        self.assertEqual(self.name(), "Test Token")
        self.assertEqual(self.symbol(), "TEST")
        self.assertEqual(self.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(self.the_owner), 1000 * UNIT)
        self.assertEqual(self.state(), self.tokenstate.address)
        self.assertEqual(self.tokenstate.functions.associatedContract().call(), self.token_real.address)

    def test_provide_state(self):
        tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                       MASTER,
                                       [self.the_owner, self.token_real.address])

        token, _ = attempt_deploy(self.compiled, 'PublicExternStateProxyToken',
                                       MASTER,
                                       ["Test Token", "TEST",
                                        1000 * UNIT, MASTER,
                                        ZERO_ADDRESS, DUMMY])
        self.assertNotEqual(token.functions.state().call(), ZERO_ADDRESS)

        token, _ = attempt_deploy(self.compiled, 'PublicExternStateProxyToken',
                                       MASTER,
                                       ["Test Token", "TEST",
                                        1000 * UNIT, MASTER,
                                        tokenstate.address, DUMMY])
        self.assertEqual(token.functions.state().call(), tokenstate.address)

    def test_getSetState(self):
        new_state = fresh_account()
        owner = self.owner()
        self.assertNotEqual(new_state, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.setState, new_state, new_state)
        tx_receipt = self.setState(owner, new_state)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'],
                         "StateUpdated")
        self.assertEqual(self.state(), new_state)

    def test_transfer(self):
        sender = self.the_owner
        sender_balance = self.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer_byProxy, receiver, sender, value)
        tx_receipt = self.transfer_byProxy(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.balanceOf(sender), sender_balance - value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.transfer_byProxy, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.balanceOf(sender)
        pre_receiver_balance = self.balanceOf(receiver)
        tx_receipt = self.transfer_byProxy(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = fresh_account()
        self.assertEqual(self.balanceOf(no_tokens), 0)
        tx_receipt = self.transfer_byProxy(no_tokens, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.balanceOf(no_tokens), 0)

    def test_approve(self):
        approver, spender = fresh_accounts(2)
        approval_amount = 1 * UNIT

        tx_receipt = self.approve(approver, spender, approval_amount)

        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        tx_receipt = self.approve(approver, spender, approval_amount)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
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
        self.assertReverts(self.transferFrom_byProxy, spender, approver, receiver, value)

        tx_receipt = self.approve(approver, spender, 2 * value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), 2 * value)

        self.assertReverts(self.transferFrom_byProxy, spender, approver, receiver, 2 * value + 1)
        tx_receipt = self.transferFrom_byProxy(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.allowance(approver, spender), value)
        self.assertEqual(self.totalSupply(), total_supply)

        # Empty the account
        tx_receipt = self.transferFrom_byProxy(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        approver = fresh_account()
        # This account has no tokens
        approver_balance = self.balanceOf(approver)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.allowance(approver, spender), 0)

        tx_receipt = self.approve(approver, spender, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom_byProxy, spender, approver, receiver, value)

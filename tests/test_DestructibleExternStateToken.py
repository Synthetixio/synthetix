from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    compile_contracts, attempt_deploy, attempt,
    mine_tx, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.destructible_extern_state_token_interface import DestructibleExternStateTokenInterface


def setUpModule():
    print("Testing DestructibleExternStateToken...")


def tearDownModule():
    print()


class TestDestructibleExternStateToken(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deploy_contracts(cls):
        sources = ['contracts/DestructibleExternStateToken.sol',
                   'contracts/TokenState.sol']
        cls.compiled, cls.event_maps = cls.compileAndMapEvents(sources, remappings=['""=contracts'])
        cls.token_event_dict = cls.event_maps['DestructibleExternStateToken']
        cls.token_contract, construction_txr = attempt_deploy(
            cls.compiled, 'DestructibleExternStateToken', MASTER,
            ["Test Token", "TEST", 1000 * UNIT, MASTER, ZERO_ADDRESS, MASTER]
        )
        cls.tokenstate = W3.eth.contract(address=cls.token_contract.functions.state().call(),
                                     abi=cls.compiled['TokenState']['abi'])
        mine_tx(cls.token_contract.functions.setState(cls.tokenstate.address).transact({'from': MASTER}),
                "setState", "DestructibleExternStateToken")

    @classmethod
    def setUpClass(cls):
        cls.deploy_contracts()
        cls.token = DestructibleExternStateTokenInterface(cls.token_contract, "DestructibleExternStateToken")

    def test_constructor(self):
        self.assertEqual(self.token.name(), "Test Token")
        self.assertEqual(self.token.symbol(), "TEST")
        self.assertEqual(self.token.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.token.balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(self.token.state(), self.tokenstate.address)
        self.assertEqual(self.tokenstate.functions.associatedContract().call(), self.token_contract.address)

    def test_provide_state(self):
        tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                       MASTER,
                                       [MASTER, self.token_contract.address])

        token, _ = attempt_deploy(self.compiled, 'DestructibleExternStateToken',
                                       MASTER,
                                       ["Test Token", "TEST",
                                        1000 * UNIT, MASTER,
                                        ZERO_ADDRESS, DUMMY])
        self.assertNotEqual(token.functions.state().call(), ZERO_ADDRESS)

        token, _ = attempt_deploy(self.compiled, 'DestructibleExternStateToken',
                                       MASTER,
                                       ["Test Token", "TEST",
                                        1000 * UNIT, MASTER,
                                        tokenstate.address, DUMMY])
        self.assertEqual(token.functions.state().call(), tokenstate.address)

    def test_getSetState(self):
        new_state = fresh_account()
        owner = self.token.owner()
        self.assertNotEqual(new_state, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.token.setState, new_state, new_state)
        tx_receipt = self.token.setState(owner, new_state)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'],
                         "StateUpdated")
        self.assertEqual(self.token.state(), new_state)

    def test_transfer(self):
        sender = MASTER
        sender_balance = self.token.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.token.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.token.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.token.transfer, receiver, sender, value)
        tx_receipt = self.token.transfer(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.token.balanceOf(sender), sender_balance - value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.token.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.token.transfer, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.token.balanceOf(sender)
        pre_receiver_balance = self.token.balanceOf(receiver)
        tx_receipt = self.token.transfer(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.token.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = fresh_account()
        self.assertEqual(self.token.balanceOf(no_tokens), 0)
        tx_receipt = self.token.transfer(no_tokens, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(no_tokens), 0)

    def test_approve(self):
        approver, spender = fresh_accounts(2)
        approval_amount = 1 * UNIT

        tx_receipt = self.token.approve(approver, spender, approval_amount)

        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.token.totalSupply() * 100
        tx_receipt = self.token.approve(approver, spender, approval_amount)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = MASTER
        spender, receiver = fresh_accounts(2)

        approver_balance = self.token.balanceOf(approver)
        spender_balance = self.token.balanceOf(spender)
        receiver_balance = self.token.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.token.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.token.transferFrom, spender, approver, receiver, value)

        tx_receipt = self.token.approve(approver, spender, 2 * value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), 2 * value)

        self.assertReverts(self.token.transferFrom, spender, approver, receiver, 2 * value + 1)
        tx_receipt = self.token.transferFrom(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.token.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.token.balanceOf(spender), spender_balance)
        self.assertEqual(self.token.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.token.allowance(approver, spender), value)
        self.assertEqual(self.token.totalSupply(), total_supply)

        # Empty the account
        tx_receipt = self.token.transferFrom(spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        approver = fresh_account()
        # This account has no tokens
        approver_balance = self.token.balanceOf(approver)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.token.allowance(approver, spender), 0)

        tx_receipt = self.token.approve(approver, spender, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.token.transferFrom, spender, approver, receiver, value)

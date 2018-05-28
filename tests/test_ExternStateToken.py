from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    attempt_deploy,
    mine_txs, take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.extern_state_token_interface import ExternStateTokenInterface


def setUpModule():
    print("Testing ExternStateToken...")
    print("=======================================")
    print()


def tearDownModule():
    print()
    print()


class TestExternStateToken(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deploy_contracts(cls):
        sources = ['tests/contracts/PublicEST.sol',
                   'contracts/ExternStateToken.sol',
                   'contracts/TokenState.sol', 'contracts/Proxy.sol']

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        proxy_contract, _ = attempt_deploy(
            compiled, "Proxy", MASTER, [MASTER]
        )

        tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                       MASTER, [MASTER, MASTER])

        token_contract, construction_txr = attempt_deploy(
            compiled, 'PublicEST', MASTER,
            [proxy_contract.address, "Test Token", "TEST", 1000 * UNIT, tokenstate.address, MASTER]
        )

        token_abi = compiled['PublicEST']['abi']
        token_event_dict = generate_topic_event_map(token_abi)

        proxied_token = W3.eth.contract(address=proxy_contract.address, abi=token_abi)

        mine_txs([
            tokenstate.functions.setBalanceOf(MASTER, 1000 * UNIT).transact({'from': MASTER}),
            tokenstate.functions.setAssociatedContract(token_contract.address).transact({'from': MASTER}),
            proxy_contract.functions.setTarget(token_contract.address).transact({'from': MASTER})
        ])
        return proxy_contract, proxied_token, compiled, token_contract, token_abi, token_event_dict, tokenstate

    @classmethod
    def setUpClass(cls):
        cls.proxy, cls.proxied_token, cls.compiled, cls.token_contract, cls.token_abi, cls.token_event_dict, cls.tokenstate = cls.deploy_contracts()
        cls.event_map = cls.event_maps['ExternStateToken']
        cls.token = ExternStateTokenInterface(cls.proxied_token, "ExternStateToken")

    def test_constructor(self):
        self.assertEqual(self.token.name(), "Test Token")
        self.assertEqual(self.token.symbol(), "TEST")
        self.assertEqual(self.token.decimals(), 18)
        self.assertEqual(self.token.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.token.balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(self.token.tokenState(), self.tokenstate.address)
        self.assertEqual(self.tokenstate.functions.associatedContract().call(), self.token_contract.address)

    def test_provide_state(self):
        tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                       MASTER,
                                       [MASTER, self.token_contract.address])
        token, _ = attempt_deploy(self.compiled, 'ExternStateToken',
                                  MASTER,
                                  [self.proxy.address, "Test Token", "TEST",
                                   1000 * UNIT,
                                   tokenstate.address, DUMMY])
        self.assertEqual(token.functions.tokenState().call(), tokenstate.address)

    def test_getSetTokenState(self):
        new_tokenstate = fresh_account()
        owner = self.token.owner()
        self.assertNotEqual(new_tokenstate, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.token.setTokenState, new_tokenstate, new_tokenstate)
        tx_receipt = self.token.setTokenState(owner, new_tokenstate)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.token_event_dict, tx_receipt.logs[0])['event'],
                         "TokenStateUpdated")
        self.assertEqual(self.token.tokenState(), new_tokenstate)

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

    def test_event_Transfer(self):
        receiver = fresh_account()
        self.assertNotEqual(receiver, MASTER)
        tx = self.token.transfer(MASTER, receiver, 10 * UNIT)
        self.assertEventEquals(self.token_event_dict,
                               tx.logs[0], "Transfer",
                               {"from": MASTER,
                                "to": receiver,
                                "value": 10 * UNIT},
                                self.proxy.address)

    def test_event_Approval(self):
        receiver = fresh_account()
        self.assertNotEqual(receiver, MASTER)
        tx = self.token.approve(MASTER, receiver, 10 * UNIT)
        self.assertEventEquals(self.token_event_dict,
                               tx.logs[0], "Approval",
                               {"owner": MASTER,
                                "spender": receiver,
                                "value": 10 * UNIT},
                                self.proxy.address)

    def test_event_StateUpdated(self):
        new_tokenstate = fresh_account()
        tx = self.token.setTokenState(MASTER, new_tokenstate)
        self.assertEventEquals(self.token_event_dict,
                               tx.logs[0], "TokenStateUpdated",
                               {"newTokenState": new_tokenstate},
                                self.proxy.address)

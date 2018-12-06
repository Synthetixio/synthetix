from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    attempt_deploy, mine_tx, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.extern_state_token_interface import ExternStateTokenInterface
from tests.contract_interfaces.token_state_interface import TokenStateInterface


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
        sources = ['tests/contracts/PublicEST.sol', 'contracts/ExternStateToken.sol',
                   'contracts/TokenState.sol', 'contracts/Proxy.sol',
                   'tests/contracts/TokenRecipient.sol', 'tests/contracts/EmptyTokenRecipient.sol',
                   'tests/contracts/ReEntrantTokenRecipient.sol']

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        proxy_contract, _ = attempt_deploy(
            compiled, "Proxy", MASTER, [MASTER]
        )

        tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                       MASTER, [MASTER, MASTER])

        token_contract, construction_txr = attempt_deploy(
            compiled, 'PublicEST', MASTER,
            [proxy_contract.address, tokenstate.address,
                "Test Token", "TEST", 1000 * UNIT, MASTER]
        )

        token_recipient_contract, _ = attempt_deploy(
            compiled, 'TokenRecipient', MASTER, []
        )
        token_recipient_abi = compiled['TokenRecipient']['abi']
        token_recipient = W3.eth.contract(
            address=token_recipient_contract.address, abi=token_recipient_abi)
        token_recipient_event_dict = generate_topic_event_map(
            token_recipient_abi)

        empty_token_recipient, _ = attempt_deploy(
            compiled, 'EmptyTokenRecipient', MASTER, []
        )

        re_entrant_token_recipient, _ = attempt_deploy(
            compiled, 'ReEntrantTokenRecipient', MASTER, []
        )

        token_abi = compiled['PublicEST']['abi']
        token_event_dict = generate_topic_event_map(token_abi)

        proxied_token = W3.eth.contract(
            address=proxy_contract.address, abi=token_abi)

        mine_txs([
            tokenstate.functions.setBalanceOf(
                MASTER, 1000 * UNIT).transact({'from': MASTER}),
            tokenstate.functions.setAssociatedContract(
                token_contract.address).transact({'from': MASTER}),
            proxy_contract.functions.setTarget(
                token_contract.address).transact({'from': MASTER})
        ])
        return proxy_contract, proxied_token, compiled, token_contract, token_abi, token_event_dict, tokenstate, token_recipient, token_recipient_event_dict, empty_token_recipient, re_entrant_token_recipient

    @classmethod
    def setUpClass(cls):
        cls.proxy, cls.proxied_token, cls.compiled, cls.token_contract, cls.token_abi, cls.token_event_dict, cls.tokenstate, cls.token_recipient, cls.token_recipient_event_dict, cls.empty_token_recipient, cls.re_entrant_token_recipient = cls.deploy_contracts()
        cls.event_map = cls.event_maps['ExternStateToken']
        cls.token = ExternStateTokenInterface(
            cls.proxied_token, "ExternStateToken")

    def test_constructor(self):
        self.assertEqual(self.token.name(), "Test Token")
        self.assertEqual(self.token.symbol(), "TEST")
        self.assertEqual(self.token.decimals(), 18)
        self.assertEqual(self.token.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.token.balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(self.token.tokenState(), self.tokenstate.address)
        self.assertEqual(self.tokenstate.functions.associatedContract(
        ).call(), self.token_contract.address)

    def test_change_state(self):
        lucky_one = fresh_account()

        print()
        # Deploy contract and old tokenstate
        _old_tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                            MASTER,
                                            [MASTER, MASTER])
        old_tokenstate = TokenStateInterface(_old_tokenstate, 'TokenState')
        _token, _ = attempt_deploy(self.compiled, 'ExternStateToken',
                                   MASTER,
                                   [self.proxy.address, old_tokenstate.contract.address,
                                    "Test Token", "TEST", 1000 * UNIT, 18, MASTER])
        token = ExternStateTokenInterface(_token, 'ExternStateToken')
        mine_txs([self.proxy.functions.setTarget(
            token.contract.address).transact({"from": MASTER})])

        old_tokenstate.setAssociatedContract(MASTER, token.contract.address)
        self.assertEqual(token.balanceOf(lucky_one), 0)
        self.assertEqual(old_tokenstate.balanceOf(lucky_one), 0)

        # Deploy new tokenstate and swap it out with the existing one.
        _new_tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                            MASTER,
                                            [MASTER, MASTER])
        new_tokenstate = TokenStateInterface(_new_tokenstate, 'TokenState')
        new_tokenstate.setBalanceOf(MASTER, lucky_one, UNIT)
        new_tokenstate.setAssociatedContract(MASTER, token.contract.address)
        token.setTokenState(MASTER, new_tokenstate.contract.address)

        self.assertEqual(token.tokenState(), new_tokenstate.contract.address)
        self.assertEqual(token.balanceOf(lucky_one), UNIT)
        self.assertEqual(new_tokenstate.balanceOf(lucky_one), UNIT)

    def test_getSetTokenState(self):
        new_tokenstate = fresh_account()
        owner = self.token.owner()
        self.assertNotEqual(new_tokenstate, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.token.setTokenState,
                           new_tokenstate, new_tokenstate)
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
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(
            receiver), receiver_balance + value)
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

        # Disallow transfers to zero, to the contract itself, and to its proxy.
        self.assertReverts(self.token.transfer, sender, ZERO_ADDRESS, value)
        self.assertReverts(self.token.transfer, sender,
                           self.token_contract.address, value)
        self.assertReverts(self.token.transfer, sender,
                           self.proxy.address, value)

        tx_receipt = self.token.transfer(sender, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.token.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        no_tokens = fresh_account()
        self.assertEqual(self.token.balanceOf(no_tokens), 0)
        tx_receipt = self.token.transfer(no_tokens, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(no_tokens), 0)

    def test_approve(self):
        approver, spender = fresh_accounts(2)
        approval_amount = 1 * UNIT

        tx_receipt = self.token.approve(approver, spender, approval_amount)

        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(
            approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.token.totalSupply() * 100
        tx_receipt = self.token.approve(approver, spender, approval_amount)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(
            approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = MASTER
        spender, receiver = fresh_accounts(2)

        approver_balance = self.token.balanceOf(approver)
        spender_balance = self.token.balanceOf(spender)
        receiver_balance = self.token.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.token.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.token.transferFrom, spender,
                           approver, receiver, value)

        tx_receipt = self.token.approve(approver, spender, 2 * value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), 2 * value)

        self.assertReverts(self.token.transferFrom, spender,
                           approver, receiver, 2 * value + 1)
        tx_receipt = self.token.transferFrom(
            spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.token.balanceOf(
            approver), approver_balance - value)
        self.assertEqual(self.token.balanceOf(spender), spender_balance)
        self.assertEqual(self.token.balanceOf(
            receiver), receiver_balance + value)
        self.assertEqual(self.token.allowance(approver, spender), value)
        self.assertEqual(self.token.totalSupply(), total_supply)

        # Empty the account
        tx_receipt = self.token.transferFrom(
            spender, approver, receiver, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        approver = fresh_account()
        # This account has no tokens
        approver_balance = self.token.balanceOf(approver)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.token.allowance(approver, spender), 0)

        tx_receipt = self.token.approve(approver, spender, value)
        # Check event is emitted properly.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.token.allowance(approver, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.token.transferFrom, spender,
                           approver, receiver, value)

    def test_tokenFallbackOnTransfer(self):
        # Ensure the default state is correct
        sender = MASTER
        sender_balance = self.token.balanceOf(sender)
        value = 10 * UNIT

        # Transfer to the contract
        tx_receipt = self.token.transfer(
            sender, self.token_recipient.address, value)

        self.assertEventEquals(
            self.token_recipient_event_dict, tx_receipt.logs[0], 'TokenFallbackCalled',
            fields={
                "from": sender,
                "value": value,
                "data": b''
            },
            location=self.token_recipient.address
        )

    def test_emptyTokenRecipientTransfer(self):
        # Ensure the default state is correct
        sender = MASTER
        sender_balance = self.token.balanceOf(sender)
        value = 10 * UNIT

        # Transfer to the contract
        tx_receipt = self.token.transfer(
            sender, self.empty_token_recipient.address, value)

        # Assert that there's only the Transfer event, and we know the transfer succeeded above or we would have gotten an error.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(len(tx_receipt.logs), 1)

    # Assert you can't do a reentrancy attack with tokenFallback
    def test_reentrantTokenRecipientTransfer(self):
        # Ensure the default state is correct
        sender = MASTER
        sender_balance = self.token.balanceOf(sender)
        value = 10 * UNIT

        # Approve a bunch of limit to play with.
        tx_receipt = self.token.approve(
            sender, self.re_entrant_token_recipient.address, 10 * value)

        # Kick off a re-entrant transfer
        tx_receipt = self.token.transfer(
            sender, self.re_entrant_token_recipient.address, value)

        # Assert that only the first transfer happened, and the tokenFallback call reverted.
        self.assertEqual(get_event_data_from_log(
            self.token_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.token.balanceOf(
            self.re_entrant_token_recipient.address), value)
        self.assertEqual(self.token.balanceOf(sender), sender_balance - value)

    # Assert
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

    def test_event_TokenStateUpdated(self):
        new_tokenstate = fresh_account()
        tx = self.token.setTokenState(MASTER, new_tokenstate)
        self.assertEventEquals(self.token_event_dict,
                               tx.logs[0], "TokenStateUpdated",
                               {"newTokenState": new_tokenstate},
                               self.proxy.address)

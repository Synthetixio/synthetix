from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY, fresh_account, fresh_accounts,
    attempt_deploy, mine_txs, mine_tx,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.fee_token_interface import PublicFeeTokenInterface
from tests.contract_interfaces.token_state_interface import TokenStateInterface


def setUpModule():
    print("Testing FeeToken...")
    print("==============================")
    print()


def tearDownModule():
    print()
    print()


class TestFeeToken(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = ["contracts/FeeToken.sol",
                   "contracts/TokenState.sol",
                   "tests/contracts/PublicFeeToken.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        feetoken_abi = compiled['PublicFeeToken']['abi']

        proxy, _ = attempt_deploy(
            compiled, "Proxy", MASTER, [MASTER]
        )
        proxied_feetoken = W3.eth.contract(address=proxy.address, abi=feetoken_abi)

        feestate, txr = attempt_deploy(
            compiled, "TokenState", MASTER,
            [MASTER, MASTER]
        )

        feetoken_event_dict = generate_topic_event_map(feetoken_abi)
        feetoken_contract, construction_txr = attempt_deploy(
            compiled, "PublicFeeToken", MASTER,
            [proxy.address, feestate.address, "Test Fee Token", "FEE", 1000 * UNIT, UNIT // 20, MASTER, MASTER]
        )

        mine_txs([
            proxy.functions.setTarget(feetoken_contract.address).transact({'from': MASTER}),
            feestate.functions.setBalanceOf(DUMMY, 1000 * UNIT).transact({'from': MASTER}),
            feestate.functions.setAssociatedContract(feetoken_contract.address).transact({'from': MASTER}),
            feetoken_contract.functions.setTokenState(feestate.address).transact({'from': MASTER})]
        )

        return compiled, proxy, proxied_feetoken, feetoken_contract, feetoken_event_dict, feestate

    @classmethod
    def setUpClass(cls):
        cls.compiled, cls.proxy, cls.proxied_feetoken, cls.feetoken_contract, cls.feetoken_event_dict, cls.feestate = cls.deployContracts()
        cls.event_map = cls.event_maps['FeeToken']

        cls.initial_beneficiary = DUMMY
        cls.fee_authority = fresh_account()

        cls.feetoken = PublicFeeTokenInterface(cls.proxied_feetoken, "FeeToken")
        cls.feetoken.setFeeAuthority(MASTER, cls.fee_authority)

    def feetoken_withdrawFees(self, sender, beneficiary, quantity):
        return mine_tx(self.feetoken_contract.functions.withdrawFees(beneficiary, quantity).transact({'from': sender}), "withdrawFees", self.feetoken.contract_name)

    def test_constructor(self):
        self.assertEqual(self.feetoken.name(), "Test Fee Token")
        self.assertEqual(self.feetoken.symbol(), "FEE")
        self.assertEqual(self.feetoken.decimals(), 18)
        self.assertEqual(self.feetoken.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.feetoken.transferFeeRate(), UNIT // 20)
        self.assertEqual(self.feetoken.feeAuthority(), self.fee_authority)
        self.assertEqual(self.feetoken.tokenState(), self.feestate.address)
        self.assertEqual(self.feestate.functions.associatedContract().call(), self.feetoken_contract.address)

    def test_change_state(self):
        lucky_one = fresh_account()

        print()
        # Deploy contract and old tokenstate
        _old_tokenstate, _ = attempt_deploy(self.compiled, 'TokenState',
                                       MASTER,
                                       [MASTER, MASTER])
        old_tokenstate = TokenStateInterface(_old_tokenstate, 'TokenState')
        _token, _ = attempt_deploy(self.compiled, 'FeeToken',
                                  MASTER,
                                  [self.proxy.address, old_tokenstate.contract.address,
                                   "Test Fee Token", "FEE", 0, UNIT // 20, self.fee_authority,
                                   MASTER])
        token = PublicFeeTokenInterface(_token, 'FeeToken')
        mine_txs([self.proxy.functions.setTarget(token.contract.address).transact({"from": MASTER})])

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

    def test_getSetOwner(self):
        owner = self.feetoken.owner()
        new_owner = DUMMY
        self.assertNotEqual(owner, new_owner)

        # Only the owner must be able to change the new owner.
        self.assertReverts(self.feetoken.nominateNewOwner, new_owner, new_owner)

        self.feetoken.nominateNewOwner(owner, new_owner)
        self.feetoken.acceptOwnership(new_owner)
        self.assertEqual(self.feetoken.owner(), new_owner)
        self.feetoken.nominateNewOwner(new_owner, owner)
        self.feetoken.acceptOwnership(owner)

    def test_getSetTransferFeeRate(self):
        transfer_fee_rate = self.feetoken.transferFeeRate()
        new_transfer_fee_rate = transfer_fee_rate + UNIT // 20
        owner = self.feetoken.owner()
        fake_owner = DUMMY
        self.assertNotEqual(owner, fake_owner)

        # Only the owner is able to set the Transfer Fee Rate.
        self.assertReverts(self.feetoken.setTransferFeeRate, fake_owner, new_transfer_fee_rate)
        tx_receipt = self.feetoken.setTransferFeeRate(owner, new_transfer_fee_rate)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "TransferFeeRateUpdated")
        self.assertEqual(self.feetoken.transferFeeRate(), new_transfer_fee_rate)

        # Maximum fee rate is UNIT /10.
        bad_transfer_fee_rate = UNIT
        self.assertReverts(self.feetoken.setTransferFeeRate, owner, bad_transfer_fee_rate)
        self.assertEqual(self.feetoken.transferFeeRate(), new_transfer_fee_rate)

    def test_getSetFeeAuthority(self):
        new_fee_authority = fresh_account()
        owner = self.feetoken.owner()

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.feetoken.setFeeAuthority, new_fee_authority, new_fee_authority)
        tx_receipt = self.feetoken.setFeeAuthority(owner, new_fee_authority)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "FeeAuthorityUpdated")
        self.assertEqual(self.feetoken.feeAuthority(), new_fee_authority)

    def test_getSetTokenState(self):
        _, new_tokenstate = fresh_accounts(2)
        owner = self.feetoken.owner()
        self.assertNotEqual(new_tokenstate, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.feetoken.setTokenState, new_tokenstate, new_tokenstate)
        tx_receipt = self.feetoken.setTokenState(owner, new_tokenstate)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "TokenStateUpdated")
        self.assertEqual(self.feetoken.tokenState(), new_tokenstate)

    def test_balanceOf(self):
        self.assertEqual(self.feetoken.balanceOf(ZERO_ADDRESS), 0)
        self.assertEqual(self.feetoken.balanceOf(self.initial_beneficiary), 1000 * UNIT)
        self.feetoken.setTokenState(self.feetoken.owner(), ZERO_ADDRESS)
        self.assertReverts(self.feetoken.balanceOf, ZERO_ADDRESS)

    def test_allowance(self):
        self.assertEqual(self.feetoken.allowance(self.initial_beneficiary, ZERO_ADDRESS), 0)
        self.assertEqual(self.feetoken.allowance(ZERO_ADDRESS, self.initial_beneficiary), 0)
        self.feetoken.approve(self.initial_beneficiary, ZERO_ADDRESS, 1000)
        self.assertEqual(self.feetoken.allowance(self.initial_beneficiary, ZERO_ADDRESS), 1000)
        self.assertEqual(self.feetoken.allowance(ZERO_ADDRESS, self.initial_beneficiary), 0)
        self.feetoken.setTokenState(self.feetoken.owner(), ZERO_ADDRESS)
        self.assertReverts(self.feetoken.allowance, self.initial_beneficiary, ZERO_ADDRESS)

    def test_getTransferFeeIncurred(self):
        value = 10 * UNIT
        fee = value * self.feetoken.transferFeeRate() // UNIT
        self.assertEqual(self.feetoken.transferFeeIncurred(value), fee)

        self.assertEqual(self.feetoken.transferFeeIncurred(0), 0)

    def test_getTransferPlusFee(self):
        value = 10 * UNIT
        fee = value * self.feetoken.transferFeeRate() // UNIT
        total = value + fee
        self.assertEqual(self.feetoken.transferPlusFee(value), total)

        self.assertEqual(self.feetoken.transferPlusFee(0), 0)

    def test_amountReceived(self):
        value = 10 * UNIT
        self.assertEqual(self.feetoken.amountReceived(0), 0)
        fee_rate = self.feetoken.transferFeeRate()
        self.assertEqual(self.feetoken.amountReceived(value), (UNIT * value) // (UNIT + fee_rate))
        fee_rate = 13 * UNIT // 10000
        self.feetoken.setTransferFeeRate(MASTER, fee_rate)
        self.assertEqual(self.feetoken.amountReceived(value), (UNIT * value) // (UNIT + fee_rate))

    def test_transfer(self):
        sender = self.initial_beneficiary
        sender_balance = self.feetoken.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.feetoken.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()
        value = 10 * UNIT
        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived

        # This should fail because receiver has no tokens
        self.assertReverts(self.feetoken.transfer, receiver, sender, value)

        tx_receipt = self.feetoken.transfer(sender, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + amountReceived)
        self.assertEqual(self.feetoken.balanceOf(sender), sender_balance - value)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool + fee)

        value = 1001 * UNIT

        # This should fail because balance < value
        self.assertReverts(self.feetoken.transfer, sender, receiver, value)

        # 0 Value transfers are allowed and incur no fee.
        value = 0
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        tx_receipt = self.feetoken.transfer(sender, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool)

        # It is also possible to send 0 value transfer from an account with 0 balance
        value = 0
        no_tokens = fresh_account()
        self.assertEqual(self.feetoken.balanceOf(no_tokens), 0)
        fee = self.feetoken.transferFeeIncurred(value)
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        # Disallow transfers to zero, to the contract itself, and to its proxy.
        self.assertReverts(self.feetoken.transfer, sender, ZERO_ADDRESS, value)
        self.assertReverts(self.feetoken.transfer, sender, self.feetoken_contract.address, value)
        self.assertReverts(self.feetoken.transfer, sender, self.proxy.address, value)

        tx_receipt = self.feetoken.transfer(no_tokens, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.feetoken.balanceOf(no_tokens), 0)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool)

    def test_specificReversionOfTransferRollback(self): 
        # This test replicates a very specific failure of transferring nUSD:
        # https://etherscan.io/tx/0x3300d39d5c97060ddcc5cf044cd779ce6bdc17b8a9976bd01e59365702843104
        # This is so we can be sure we've replicated the issue and fixed it.

        # Set up the conditions to be the same as the transaction that failed.
        sender = fresh_account()
        value = 4800149663005492000000
        tx_receipt = self.feetoken.giveTokens(self.initial_beneficiary, sender, value)
        self.assertEqual(self.feetoken.balanceOf(sender), value)
        receiver = fresh_account()
        self.assertEqual(self.feetoken.balanceOf(receiver), 0)

        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived
        
        # Ok, now do a transfer for exactly the whole amount.
        tx_receipt = self.feetoken.transfer(sender, receiver, value)

        # Assert that that worked.
        self.assertEqual(self.feetoken.balanceOf(sender), 0)
        self.assertEqual(self.feetoken.balanceOf(receiver), amountReceived)
        self.assertEqual(self.feetoken.feePool(), fee)

    def test_approve(self):
        approver = MASTER
        spender = fresh_account()
        approval_amount = 1 * UNIT

        tx_receipt = self.feetoken.approve(approver, spender, approval_amount)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.feetoken.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.feetoken.totalSupply() * 100
        tx_receipt = self.feetoken.approve(approver, spender, approval_amount)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.feetoken.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = self.initial_beneficiary
        spender, receiver = fresh_accounts(2)
        self.assertNotEqual(approver, spender)
        self.assertNotEqual(approver, receiver)

        approver_balance = self.feetoken.balanceOf(approver)
        spender_balance = self.feetoken.balanceOf(spender)
        receiver_balance = self.feetoken.balanceOf(receiver)

        value = 10 * UNIT
        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        # This fails because there has been no approval yet.
        self.assertReverts(self.feetoken.transferFrom, spender, approver, receiver, value)

        # Approve amount to transfer.
        tx_receipt = self.feetoken.approve(approver, spender, value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.feetoken.allowance(approver, spender), value)

        value = UNIT
        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived
        tx_receipt = self.feetoken.transferFrom(spender, approver, receiver, value)

        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.feetoken.allowance(approver, spender), 9 * UNIT)

        self.assertEqual(self.feetoken.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.feetoken.balanceOf(spender), spender_balance)
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + amountReceived)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool + fee)

        value = 9 * UNIT
        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived
        tx_receipt = self.feetoken.transferFrom(spender, approver, receiver, value)

        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.feetoken.allowance(approver, spender), 0)
        self.assertEqual(self.feetoken.balanceOf(approver), approver_balance - 10 * UNIT)
        self.assertEqual(self.feetoken.balanceOf(spender), spender_balance)
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + self.feetoken.amountReceived(UNIT) + self.feetoken.amountReceived(9 * UNIT))
        self.assertEqual(self.feetoken.totalSupply(), total_supply)

        totalFees = 9 * UNIT - self.feetoken.amountReceived(9 * UNIT) + UNIT - self.feetoken.amountReceived(UNIT)
        self.assertEqual(self.feetoken.feePool(), fee_pool + totalFees)

        approver = fresh_account()
        # This account has no tokens.
        approver_balance = self.feetoken.balanceOf(approver)
        self.assertEqual(approver_balance, 0)

        value = 10 * UNIT
        tx_receipt = self.feetoken.approve(approver, spender, value)
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")

        # This should fail because the approver has no tokens.
        self.assertReverts(self.feetoken.transferFrom, spender, approver, receiver, 1)

    def test_withdrawFees(self):
        receiver, fee_receiver, not_fee_authority = fresh_accounts(3)
        self.assertNotEqual(self.fee_authority, not_fee_authority)
        self.assertNotEqual(self.fee_authority, receiver)
        self.assertNotEqual(self.fee_authority, fee_receiver)

        value = 500 * UNIT
        amountReceived = self.feetoken.amountReceived(value)
        fee = value - amountReceived

        tx_receipt = self.feetoken.transfer(self.initial_beneficiary, self.fee_authority, value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(self.feetoken.balanceOf(self.fee_authority), amountReceived)

        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        fee_authority_balance = self.feetoken.balanceOf(self.fee_authority)
        receiver_balance = self.feetoken.balanceOf(receiver)
        fee_receiver_balance = self.feetoken.balanceOf(fee_receiver)

        value = self.feetoken.balanceOf(self.fee_authority)
        amountReceived = self.feetoken.amountReceived(value)
        cumulativeFee = fee + value - amountReceived
        fee = value - amountReceived

        tx_receipt = self.feetoken.transfer(self.fee_authority, receiver, fee_authority_balance)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")

        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + amountReceived)
        self.assertEqual(self.feetoken.balanceOf(self.fee_authority), 0)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), cumulativeFee)

        fee_pool = self.feetoken.feePool()

        # This should fail because only the Fee Authority can withdraw fees
        self.assertReverts(self.feetoken_withdrawFees, not_fee_authority, not_fee_authority, fee_pool)

        # Failure due to too-large a withdrawal.
        self.assertReverts(self.feetoken_withdrawFees, self.fee_authority, fee_receiver, fee_pool + 1)

        # Partial withdrawal leaves stuff in the pool
        tx_receipt = self.feetoken_withdrawFees(self.fee_authority, fee_receiver, fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "FeesWithdrawn")
        self.assertEqual(3 * fee_pool // 4 + 1, self.feetoken.feePool())
        self.assertEqual(self.feetoken.balanceOf(fee_receiver), fee_receiver_balance + fee_pool // 4)

        # Withdraw the rest
        tx_receipt = self.feetoken_withdrawFees(self.fee_authority, fee_receiver, 3 * fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "FeesWithdrawn")

        self.assertEqual(self.feetoken.balanceOf(fee_receiver), fee_receiver_balance + fee_pool - 1)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), 1)

    def test_donateToFeePool(self):
        donor, pauper = fresh_accounts(2)
        self.assertNotEqual(donor, pauper)

        self.assertGreater(self.feetoken.balanceOf(self.initial_beneficiary), 10 * UNIT)

        self.feetoken.transferSenderPaysFee(self.initial_beneficiary, donor, 10 * UNIT)
        self.feetoken_withdrawFees(self.fee_authority, self.initial_beneficiary, self.feetoken.feePool())

        # No donations by people with no money...
        self.assertReverts(self.feetoken.donateToFeePool, pauper, 10 * UNIT)
        # ...even if they donate nothing.
        self.assertReverts(self.feetoken.donateToFeePool, pauper, 0)

        # No donations more than you possess.
        self.assertReverts(self.feetoken.donateToFeePool, donor, 11 * UNIT)

        self.assertEqual(self.feetoken.feePool(), 0)
        self.assertEqual(self.feetoken.balanceOf(donor), 10 * UNIT)
        self.assertTrue(self.feetoken.donateToFeePool(donor, UNIT))
        self.assertEqual(self.feetoken.feePool(), UNIT)
        self.assertEqual(self.feetoken.balanceOf(donor), 9 * UNIT)
        self.assertTrue(self.feetoken.donateToFeePool(donor, 5 * UNIT))
        self.assertEqual(self.feetoken.feePool(), 6 * UNIT)
        self.assertEqual(self.feetoken.balanceOf(donor), 4 * UNIT)

        # And it should emit the right event.
        tx_receipt = self.feetoken.donateToFeePool(donor, UNIT)
        self.assertEqual(len(tx_receipt.logs), 2)
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], 'FeesDonated')
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'], 'Transfer')

    def test_event_Transfer(self):
        sender = self.initial_beneficiary
        txr = self.feetoken.transfer(sender, MASTER, UNIT)
        amountReceived = self.feetoken.amountReceived(UNIT)
        fee = UNIT - amountReceived

        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[0], 'Transfer',
            fields={'from': sender, 'to': MASTER, 'value': amountReceived},
            location=self.proxy.address
        )

        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[1], 'Transfer',
            fields={'from': sender, 'to': self.feetoken_contract.functions.FEE_ADDRESS().call(), 'value': fee},
            location=self.proxy.address
        )

    def test_event_Approval(self):
        approver, approvee = fresh_accounts(2)
        txr = self.feetoken.approve(approver, approvee, UNIT)
        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[0], 'Approval',
            fields={'owner': approver, 'spender': approvee, 'value': UNIT},
            location=self.proxy.address
        )

    def test_event_TransferFeeRateUpdated(self):
        new_rate = UNIT // 11
        txr = self.feetoken.setTransferFeeRate(MASTER, new_rate)
        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[0], 'TransferFeeRateUpdated',
            fields={'newFeeRate': new_rate},
            location=self.proxy.address
        )

    def test_event_FeeAuthorityUpdated(self):
        new_authority = fresh_account()
        txr = self.feetoken.setFeeAuthority(MASTER, new_authority)
        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[0], 'FeeAuthorityUpdated',
            fields={'newFeeAuthority': new_authority},
            location=self.proxy.address
        )

    def test_event_TokenStateUpdated(self):
        new_tokenstate = fresh_account()
        txr = self.feetoken.setTokenState(MASTER, new_tokenstate)
        self.assertEventEquals(
            self.feetoken_event_dict, txr.logs[0], 'TokenStateUpdated',
            fields={'newTokenState': new_tokenstate},
            location=self.proxy.address
        )

    def test_event_FeesWithdrawn(self):
        beneficiary = fresh_account()
        self.feetoken.clearTokens(MASTER, self.feetoken_contract.functions.FEE_ADDRESS().call())
        self.feetoken.giveTokens(MASTER, self.feetoken_contract.functions.FEE_ADDRESS().call(), UNIT)
        txr = self.feetoken_withdrawFees(self.feetoken.feeAuthority(),
                                         beneficiary, UNIT)
        self.assertEventEquals(self.feetoken_event_dict,
                               txr.logs[0], "FeesWithdrawn",
                               {"account": beneficiary,
                                "value": UNIT},
                                self.proxy.address)

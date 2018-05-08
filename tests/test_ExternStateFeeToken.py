import unittest

from utils.deployutils import UNIT, MASTER, DUMMY, fresh_account, fresh_accounts
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

from tests.contract_interfaces.extern_state_fee_token_interface import ExternStateFeeTokenInterface


ExternStateFeeToken_SOURCE = "contracts/ExternStateFeeToken.sol"
TokenState_SOURCE = "contracts/TokenState.sol"


def setUpModule():
    print("Testing ExternStateFeeToken...")


def tearDownModule():
    print()


class TestExternStateFeeToken(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.initial_beneficiary, cls.fee_authority, cls.token_owner = fresh_accounts(3)

        cls.compiled = compile_contracts([ExternStateFeeToken_SOURCE, TokenState_SOURCE],
                                         remappings=['""=contracts'])
        cls.feetoken_abi = cls.compiled['ExternStateFeeToken']['abi']
        cls.feetoken_event_dict = generate_topic_event_map(cls.feetoken_abi)
        cls.feetoken_contract, cls.construction_txr = attempt_deploy(
            cls.compiled, "ExternStateFeeToken", MASTER, ["Test Fee Token", "FEE",
                                                                     UNIT // 20, cls.fee_authority,
                                                                     ZERO_ADDRESS, cls.token_owner]
        )

        cls.feestate, txr = attempt_deploy(
            cls.compiled, "TokenState", MASTER,
            [cls.token_owner, cls.token_owner]
        )
        mine_tx(cls.feestate.functions.setBalanceOf(cls.initial_beneficiary, 1000 * UNIT).transact({'from': cls.token_owner}))
        mine_tx(cls.feestate.functions.setAssociatedContract(cls.feetoken_contract.address).transact({'from': cls.token_owner}))

        mine_tx(cls.feetoken_contract.functions.setState(cls.feestate.address).transact({'from': cls.token_owner}))

        cls.feetoken = ExternStateFeeTokenInterface(cls.feetoken_contract)

    def test_constructor(self):
        self.assertEqual(self.feetoken.name(), "Test Fee Token")
        self.assertEqual(self.feetoken.symbol(), "FEE")
        self.assertEqual(self.feetoken.totalSupply(), 0)
        self.assertEqual(self.feetoken.transferFeeRate(), UNIT // 20)
        self.assertEqual(self.feetoken.feeAuthority(), self.fee_authority)
        self.assertEqual(self.feetoken.state(), self.feestate.address)
        self.assertEqual(self.feestate.functions.associatedContract().call(), self.feetoken_contract.address)

    def test_provide_state(self):
        feestate, _ = attempt_deploy(self.compiled, 'TokenState',
                                     MASTER, [MASTER, self.feetoken_contract.address])

        feetoken, _ = attempt_deploy(self.compiled, 'ExternStateFeeToken',
                                     MASTER,
                                     ["Test Fee Token", "FEE",
                                      UNIT // 20, self.fee_authority,
                                      ZERO_ADDRESS, DUMMY])
        self.assertNotEqual(feetoken.functions.state().call(), ZERO_ADDRESS)

        feetoken, _ = attempt_deploy(self.compiled, 'ExternStateFeeToken',
                                     MASTER,
                                     ["Test Fee Token", "FEE",
                                      UNIT // 20, self.fee_authority,
                                      feestate.address, DUMMY])
        self.assertEqual(feetoken.functions.state().call(), feestate.address)

    def test_getSetOwner(self):
        owner = self.feetoken.owner()
        new_owner = DUMMY
        self.assertNotEqual(owner, new_owner)

        # Only the owner must be able to change the new owner.
        self.assertReverts(self.feetoken.nominateOwner, new_owner, new_owner)

        self.feetoken.nominateOwner(owner, new_owner)
        self.feetoken.acceptOwnership(new_owner)
        self.assertEqual(self.feetoken.owner(), new_owner)
        self.feetoken.nominateOwner(new_owner, owner)
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

    def test_getSetState(self):
        _, new_state = fresh_accounts(2)
        owner = self.feetoken.owner()
        self.assertNotEqual(new_state, owner)

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.feetoken.setState, new_state, new_state)
        tx_receipt = self.feetoken.setState(owner, new_state)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "StateUpdated")
        self.assertEqual(self.feetoken.state(), new_state)

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

    def test_priceToSpend(self):
        value = 10 * UNIT
        self.assertEqual(self.feetoken.priceToSpend(0), 0)
        fee_rate = self.feetoken.transferFeeRate()
        self.assertEqual(self.feetoken.priceToSpend(value), (UNIT * value) // (UNIT + fee_rate))
        fee_rate = 13 * UNIT // 10000
        self.feetoken.setTransferFeeRate(self.token_owner, fee_rate)
        self.assertEqual(self.feetoken.priceToSpend(value), (UNIT * value) // (UNIT + fee_rate))

    def test_transfer(self):
        sender = self.initial_beneficiary
        sender_balance = self.feetoken.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.feetoken.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        fee = self.feetoken.transferFeeIncurred(value)
        total_value = self.feetoken.transferPlusFee(value)
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        # This should fail because receiver has no tokens
        self.assertReverts(self.feetoken.transfer, receiver, sender, value)

        tx_receipt = self.feetoken.transfer(sender, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.feetoken.balanceOf(sender), sender_balance - total_value)
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
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool)

        # It is also possible to send 0 value transfer from an account with 0 balance
        value = 0
        no_tokens = fresh_account()
        self.assertEqual(self.feetoken.balanceOf(no_tokens), 0)
        fee = self.feetoken.transferFeeIncurred(value)
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        tx_receipt = self.feetoken.transfer(no_tokens, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.balanceOf(no_tokens), 0)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool)

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
        fee = self.feetoken.transferFeeIncurred(value)
        total_value = self.feetoken.transferPlusFee(value)
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        # This fails because there has been no approval yet.
        self.assertReverts(self.feetoken.transferFrom, spender, approver, receiver, value)

        # Approve total amount inclusive of fee.
        tx_receipt = self.feetoken.approve(approver, spender, total_value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.feetoken.allowance(approver, spender), total_value)

        tx_receipt = self.feetoken.transferFrom(spender, approver, receiver, value // 10)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.allowance(approver, spender), 9 * total_value // 10)

        self.assertEqual(self.feetoken.balanceOf(approver), approver_balance - total_value // 10)
        self.assertEqual(self.feetoken.balanceOf(spender), spender_balance)
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value // 10)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool + fee // 10)

        tx_receipt = self.feetoken.transferFrom(spender, approver, receiver, 9 * value // 10)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.allowance(approver, spender), 0)
        self.assertEqual(self.feetoken.balanceOf(approver), approver_balance - total_value)
        self.assertEqual(self.feetoken.balanceOf(spender), spender_balance)
        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool + fee)

        approver = fresh_account()
        # This account has no tokens.
        approver_balance = self.feetoken.balanceOf(approver)
        self.assertEqual(approver_balance, 0)

        tx_receipt = self.feetoken.approve(approver, spender, total_value)
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Approval")

        # This should fail because the approver has no tokens.
        self.assertReverts(self.feetoken.transferFrom, spender, approver, receiver, value)

    def test_withdrawFee(self):
        receiver, fee_receiver, not_fee_authority = fresh_accounts(3)
        self.assertNotEqual(self.fee_authority, not_fee_authority)
        self.assertNotEqual(self.fee_authority, receiver)
        self.assertNotEqual(self.fee_authority, fee_receiver)

        value = 500 * UNIT
        total_value = self.feetoken.transferPlusFee(value)
        tx_receipt = self.feetoken.transfer(self.initial_beneficiary, self.fee_authority, total_value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.feetoken.balanceOf(self.fee_authority), total_value)

        fee = self.feetoken.transferFeeIncurred(value)
        total_supply = self.feetoken.totalSupply()
        fee_pool = self.feetoken.feePool()

        fee_authority_balance = self.feetoken.balanceOf(self.fee_authority)
        receiver_balance = self.feetoken.balanceOf(receiver)
        fee_receiver_balance = self.feetoken.balanceOf(fee_receiver)

        tx_receipt = self.feetoken.transfer(self.fee_authority, receiver, value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")

        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.feetoken.balanceOf(self.fee_authority), fee_authority_balance - total_value)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), fee_pool + fee)

        fee_pool = self.feetoken.feePool()

        # This should fail because only the Fee Authority can withdraw fees
        self.assertReverts(self.feetoken.withdrawFee, not_fee_authority, not_fee_authority, fee_pool)

        # Failure due to too-large a withdrawal.
        self.assertReverts(self.feetoken.withdrawFee, self.fee_authority, fee_receiver, fee_pool + 1)

        # Partial withdrawal leaves stuff in the pool
        tx_receipt = self.feetoken.withdrawFee(self.fee_authority, fee_receiver, fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "FeesWithdrawn")
        self.assertEqual(3 * fee_pool // 4, self.feetoken.feePool())
        self.assertEqual(self.feetoken.balanceOf(fee_receiver), fee_receiver_balance + fee_pool // 4)

        # Withdraw the rest
        tx_receipt = self.feetoken.withdrawFee(self.fee_authority, fee_receiver, 3 * fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.feetoken_event_dict, tx_receipt.logs[0])['event'],
                         "FeesWithdrawn")

        self.assertEqual(self.feetoken.balanceOf(fee_receiver), fee_receiver_balance + fee_pool)
        self.assertEqual(self.feetoken.totalSupply(), total_supply)
        self.assertEqual(self.feetoken.feePool(), 0)

    def test_donateToFeePool(self):
        donor, pauper = fresh_accounts(2)
        self.assertNotEqual(donor, pauper)

        self.assertGreater(self.feetoken.balanceOf(self.initial_beneficiary), 10 * UNIT)

        self.feetoken.transfer(self.initial_beneficiary, donor, 10 * UNIT)
        self.feetoken.withdrawFee(self.fee_authority, self.initial_beneficiary, self.feetoken.feePool())

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

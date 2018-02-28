import unittest

from utils.deployutils import W3, UNIT, MASTER, DUMMY, fresh_account, fresh_accounts
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"
ERC20State_SOURCE = "contracts/ERC20State.sol"
ERC20FeeState_SOURCE = "contracts/ERC20FeeState.sol"


def setUpModule():
    print("Testing ERC20FeeToken...")


def tearDownModule():
    print()


class TestERC20FeeToken(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.initial_beneficiary, cls.fee_authority, cls.token_owner = fresh_accounts(3)

        cls.compiled = compile_contracts([ERC20FeeToken_SOURCE, ERC20FeeState_SOURCE])
        cls.erc20fee_abi = cls.compiled['ERC20FeeToken']['abi']
        cls.erc20fee_event_dict = generate_topic_event_map(cls.erc20fee_abi)
        cls.erc20feetoken_real, cls.construction_txr = attempt_deploy(
            cls.compiled, "ERC20FeeToken", MASTER, ["Test Fee Token", "FEE",
                                                    0, cls.initial_beneficiary,
                                                    UNIT // 20, cls.fee_authority,
                                                    ZERO_ADDRESS, cls.token_owner]
        )
        cls.erc20feestate, txr = attempt_deploy(
            cls.compiled, "ERC20FeeState", MASTER,
            [cls.token_owner, 1000 * UNIT, cls.initial_beneficiary, cls.erc20feetoken_real.address]
        )

        cls.erc20feetoken_proxy, _ = attempt_deploy(cls.compiled, 'Proxy',
                                                    MASTER, [cls.erc20feetoken_real.address, cls.token_owner])
        mine_tx(cls.erc20feetoken_real.functions.setProxy(cls.erc20feetoken_proxy.address).transact(
            {'from': cls.token_owner}))
        cls.erc20feetoken = W3.eth.contract(address=cls.erc20feetoken_proxy.address,
                                            abi=cls.compiled['ERC20FeeToken']['abi'])

        mine_tx(
            cls.erc20feetoken_real.functions.setState(cls.erc20feestate.address).transact({'from': cls.token_owner}))

        cls.owner = lambda self: cls.erc20feetoken.functions.owner().call()
        cls.totalSupply = lambda self: cls.erc20feetoken.functions.totalSupply().call()
        cls.state = lambda self: cls.erc20feetoken.functions.state().call()
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
        cls.priceToSpend = lambda self, value: cls.erc20feetoken.functions.priceToSpend(value).call()

        cls.nominateOwner = lambda self, sender, address: mine_tx(
            cls.erc20feetoken.functions.nominateOwner(address).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.erc20feetoken.functions.acceptOwnership().transact({'from': sender}))
        cls.setTransferFeeRate = lambda self, sender, new_fee_rate: mine_tx(
            cls.erc20feetoken.functions.setTransferFeeRate(new_fee_rate).transact({'from': sender}))
        cls.setFeeAuthority = lambda self, sender, new_fee_authority: mine_tx(
            cls.erc20feetoken.functions.setFeeAuthority(new_fee_authority).transact({'from': sender}))
        cls.transfer = lambda self, sender, to, value: mine_tx(
            cls.erc20feetoken.functions.transfer(to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(
            cls.erc20feetoken.functions.approve(spender, value).transact({'from': sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.erc20feetoken.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.withdrawFee = lambda self, sender, account, value: mine_tx(
            cls.erc20feetoken_real.functions.withdrawFee(account, value).transact({'from': sender}))
        cls.donateToFeePool = lambda self, sender, value: mine_tx(
            cls.erc20feetoken.functions.donateToFeePool(value).transact({'from': sender}))

    def test_constructor(self):
        self.assertEqual(self.name(), "Test Fee Token")
        self.assertEqual(self.symbol(), "FEE")
        self.assertEqual(self.totalSupply(), 1000 * UNIT)
        self.assertEqual(self.balanceOf(self.initial_beneficiary), 1000 * UNIT)
        self.assertEqual(self.transferFeeRate(), UNIT // 20)
        self.assertEqual(self.feeAuthority(), self.fee_authority)
        self.assertEqual(self.state(), self.erc20feestate.address)
        self.assertEqual(self.erc20feestate.functions.associatedContract().call(), self.erc20feetoken_real.address)

    def test_provide_state(self):
        erc20feestate, _ = attempt_deploy(self.compiled, 'ERC20FeeState',
                                          MASTER,
                                          [MASTER, 0,
                                           MASTER, self.erc20feetoken.address])

        erc20feetoken, _ = attempt_deploy(self.compiled, 'ERC20FeeToken',
                                          MASTER,
                                          ["Test Fee Token", "FEE",
                                           0, MASTER, UNIT // 20,
                                           self.fee_authority,
                                           ZERO_ADDRESS, DUMMY])
        self.assertNotEqual(erc20feetoken.functions.state().call(), ZERO_ADDRESS)

        erc20feetoken, _ = attempt_deploy(self.compiled, 'ERC20FeeToken',
                                          MASTER,
                                          ["Test Fee Token", "FEE",
                                           0, MASTER, UNIT // 20,
                                           self.fee_authority,
                                           erc20feestate.address, DUMMY])
        self.assertEqual(erc20feetoken.functions.state().call(), erc20feestate.address)

    def test_getSetOwner(self):
        owner = self.owner()
        new_owner = DUMMY
        self.assertNotEqual(owner, new_owner)

        # Only the owner must be able to change the new owner.
        self.assertReverts(self.nominateOwner, new_owner, new_owner)

        self.nominateOwner(owner, new_owner)
        self.acceptOwnership(new_owner)
        self.assertEqual(self.owner(), new_owner)
        self.nominateOwner(new_owner, owner)
        self.acceptOwnership(owner)

    def test_getSetTransferFeeRate(self):
        transfer_fee_rate = self.transferFeeRate()
        new_transfer_fee_rate = transfer_fee_rate + UNIT // 20
        owner = self.owner()
        fake_owner = DUMMY
        self.assertNotEqual(owner, fake_owner)

        # Only the owner is able to set the Transfer Fee Rate.
        self.assertReverts(self.setTransferFeeRate, fake_owner, new_transfer_fee_rate)
        tx_receipt = self.setTransferFeeRate(owner, new_transfer_fee_rate)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'],
                         "TransferFeeRateUpdate")
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

        # Maximum fee rate is UNIT /10.
        bad_transfer_fee_rate = UNIT
        self.assertReverts(self.setTransferFeeRate, owner, bad_transfer_fee_rate)
        self.assertEqual(self.transferFeeRate(), new_transfer_fee_rate)

    def test_getSetFeeAuthority(self):
        new_fee_authority = fresh_account()
        owner = self.owner()

        # Only the owner is able to set the Fee Authority.
        self.assertReverts(self.setFeeAuthority, new_fee_authority, new_fee_authority)
        tx_receipt = self.setFeeAuthority(owner, new_fee_authority)
        # Check that event is emitted.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'],
                         "FeeAuthorityUpdate")
        self.assertEqual(self.feeAuthority(), new_fee_authority)

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

    def test_priceToSpend(self):
        value = 10 * UNIT
        self.assertEqual(self.priceToSpend(0), 0)
        fee_rate = self.transferFeeRate()
        self.assertEqual(self.priceToSpend(value), (UNIT * value) // (UNIT + fee_rate))
        fee_rate = 13 * UNIT // 10000
        self.setTransferFeeRate(self.token_owner, fee_rate)
        self.assertEqual(self.priceToSpend(value), (UNIT * value) // (UNIT + fee_rate))

    def test_transfer(self):
        sender = self.initial_beneficiary
        sender_balance = self.balanceOf(sender)

        receiver = fresh_account()
        receiver_balance = self.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        fee = self.transferFeeIncurred(value)
        total_value = self.transferPlusFee(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        # This should fail because receiver has no tokens
        self.assertReverts(self.transfer, receiver, sender, value)

        tx_receipt = self.transfer(sender, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.balanceOf(sender), sender_balance - total_value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        value = 1001 * UNIT

        # This should fail because balance < value
        self.assertReverts(self.transfer, sender, receiver, value)

        # 0 Value transfers are allowed and incur no fee.
        value = 0
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        tx_receipt = self.transfer(sender, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool)

        # It is also possible to send 0 value transfer from an account with 0 balance
        value = 0
        no_tokens = fresh_account()
        self.assertEqual(self.balanceOf(no_tokens), 0)
        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        tx_receipt = self.transfer(no_tokens, receiver, value)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.balanceOf(no_tokens), 0)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool)

    def test_approve(self):
        approver = MASTER
        spender = fresh_account()
        approval_amount = 1 * UNIT

        tx_receipt = self.approve(approver, spender, approval_amount)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), approval_amount)

        # Any positive approval amount is valid, even greater than total_supply.
        approval_amount = self.totalSupply() * 100
        tx_receipt = self.approve(approver, spender, approval_amount)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), approval_amount)

    def test_transferFrom(self):
        approver = self.initial_beneficiary
        spender, receiver = fresh_accounts(2)
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

        # This fails because there has been no approval yet.
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

        # Approve total amount inclusive of fee.
        tx_receipt = self.approve(approver, spender, total_value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Approval")
        self.assertEqual(self.allowance(approver, spender), total_value)

        tx_receipt = self.transferFrom(spender, approver, receiver, value // 10)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.allowance(approver, spender), 9 * total_value // 10)

        self.assertEqual(self.balanceOf(approver), approver_balance - total_value // 10)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value // 10)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee // 10)

        tx_receipt = self.transferFrom(spender, approver, receiver, 9 * value // 10)
        # Check that events are emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.allowance(approver, spender), 0)
        self.assertEqual(self.balanceOf(approver), approver_balance - total_value)
        self.assertEqual(self.balanceOf(spender), spender_balance)
        self.assertEqual(self.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), fee_pool + fee)

        approver = fresh_account()
        # This account has no tokens.
        approver_balance = self.balanceOf(approver)
        self.assertEqual(approver_balance, 0)

        tx_receipt = self.approve(approver, spender, total_value)
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Approval")

        # This should fail because the approver has no tokens.
        self.assertReverts(self.transferFrom, spender, approver, receiver, value)

    def test_withdrawFee(self):
        receiver, fee_receiver, not_fee_authority = fresh_accounts(3)
        self.assertNotEqual(self.fee_authority, not_fee_authority)
        self.assertNotEqual(self.fee_authority, receiver)
        self.assertNotEqual(self.fee_authority, fee_receiver)

        value = 500 * UNIT
        total_value = self.transferPlusFee(value)
        tx_receipt = self.transfer(self.initial_beneficiary, self.fee_authority, total_value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")
        self.assertEqual(self.balanceOf(self.fee_authority), total_value)

        fee = self.transferFeeIncurred(value)
        total_supply = self.totalSupply()
        fee_pool = self.feePool()

        fee_authority_balance = self.balanceOf(self.fee_authority)
        receiver_balance = self.balanceOf(receiver)
        fee_receiver_balance = self.balanceOf(fee_receiver)

        tx_receipt = self.transfer(self.fee_authority, receiver, value)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], "Transfer")
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[1])['event'],
                         "TransferFeePaid")

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
        tx_receipt = self.withdrawFee(self.fee_authority, fee_receiver, fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'],
                         "FeeWithdrawal")
        self.assertEqual(3 * fee_pool // 4, self.feePool())
        self.assertEqual(self.balanceOf(fee_receiver), fee_receiver_balance + fee_pool // 4)

        # Withdraw the rest
        tx_receipt = self.withdrawFee(self.fee_authority, fee_receiver, 3 * fee_pool // 4)
        # Check that event is emitted properly.
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'],
                         "FeeWithdrawal")

        self.assertEqual(self.balanceOf(fee_receiver), fee_receiver_balance + fee_pool)
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.feePool(), 0)

    def test_donateToFeePool(self):
        donor, pauper = fresh_accounts(2)
        self.assertNotEqual(donor, pauper)

        self.transfer(self.initial_beneficiary, donor, 10 * UNIT)
        self.withdrawFee(self.fee_authority, self.initial_beneficiary, self.feePool())

        # No donations by people with no money...
        self.assertReverts(self.donateToFeePool, pauper, 10 * UNIT)
        # ...even if they donate nothing.
        self.assertReverts(self.donateToFeePool, pauper, 0)

        # No donations more than you possess.
        self.assertReverts(self.donateToFeePool, donor, 11 * UNIT)

        self.assertEqual(self.feePool(), 0)
        self.assertEqual(self.balanceOf(donor), 10 * UNIT)
        self.assertTrue(self.donateToFeePool(donor, UNIT))
        self.assertEqual(self.feePool(), UNIT)
        self.assertEqual(self.balanceOf(donor), 9 * UNIT)
        self.assertTrue(self.donateToFeePool(donor, 5 * UNIT))
        self.assertEqual(self.feePool(), 6 * UNIT)
        self.assertEqual(self.balanceOf(donor), 4 * UNIT)

        # And it should emit the right event.
        tx_receipt = self.donateToFeePool(donor, UNIT)
        self.assertEqual(len(tx_receipt.logs), 1)
        self.assertEqual(get_event_data_from_log(self.erc20fee_event_dict, tx_receipt.logs[0])['event'], 'FeeDonation')


if __name__ == '__main__':
    unittest.main()

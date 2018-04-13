import unittest
import time

import utils.generalutils
from utils.generalutils import to_seconds
from utils.deployutils import W3, UNIT, MASTER, DUMMY, ETHER
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time, send_value, get_eth_balance
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS

Nomin_SOURCE = "tests/contracts/PublicNomin.sol"
FAKECOURT_SOURCE = "tests/contracts/FakeCourt.sol"


def setUpModule():
    print("Testing Nomin...")


def tearDownModule():
    print()


class TestNomin(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        self.time_fast_forwarded = 0
        self.initial_time = round(time.time())
        # Reset the price at the start of tests so that it's never stale.
        self.updatePrice(self.oracle(), self.etherPrice(), self.now_block_time() + 1)
        fast_forward(2)
        # Reset the liquidation timestamp so that it's never active.
        owner = self.owner()
        self.forceLiquidation(owner)
        self.terminateLiquidation(owner)

    def tearDown(self):
        restore_snapshot(self.snapshot)

    def _test_time_elapsed(self):
        return self.time_fast_forwarded + (round(time.time()) - self.initial_time)

    def now_block_time(self):
        return block_time() + self._test_time_elapsed()

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([Nomin_SOURCE, FAKECOURT_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin_abi = compiled['PublicNomin']['abi']
        cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

        cls.nomin_havven = W3.eth.accounts[1]
        cls.nomin_oracle = W3.eth.accounts[2]
        cls.nomin_beneficiary = W3.eth.accounts[3]
        cls.nomin_owner = W3.eth.accounts[0]

        cls.nomin, cls.construction_txr = attempt_deploy(compiled, 'PublicNomin', MASTER,
                                                              [cls.nomin_havven, cls.nomin_oracle,
                                                               cls.nomin_beneficiary,
                                                               1000 * UNIT, cls.nomin_owner, ZERO_ADDRESS])
        cls.construction_price_time = cls.nomin.functions.lastPriceUpdateTime().call()
        cls.initial_time = cls.construction_price_time
        cls.time_fast_forwarded = 0

        cls.fake_court, _ = attempt_deploy(compiled, 'FakeCourt', MASTER, [])

        cls.fake_court.setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court.setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court.setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court.setTargetMotionID = lambda sender, target, motion_id: mine_tx(
            cls.fake_court.functions.setTargetMotionID(target, motion_id).transact({'from': sender}))
        cls.fake_court.confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        cls.fake_court.setNomin(W3.eth.accounts[0], cls.nomin.address)

        mine_tx(cls.nomin.functions.setCourt(cls.fake_court.address).transact({'from': cls.nomin_owner}))

        cls.owner = lambda self: cls.nomin.functions.owner().call()
        cls.court = lambda self: cls.nomin.functions.court().call()
        cls.nominPool = lambda self: cls.nomin.functions.nominPool().call()
        cls.poolFeeRate = lambda self: cls.nomin.functions.poolFeeRate().call()
        cls.frozen = lambda self, address: cls.nomin.functions.frozen(address).call()

        cls.nominateOwner = lambda self, sender, address: mine_tx(
            cls.nomin.functions.nominateOwner(address).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.nomin.functions.acceptOwnership().transact({'from': sender}))
        cls.setCourt = lambda self, sender, address: mine_tx(
            cls.nomin.functions.setCourt(address).transact({'from': sender}))
        cls.setPoolFeeRate = lambda self, sender, rate: mine_tx(
            cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender}))

        cls.transferPlusFee = lambda self, value: cls.nomin.functions.transferPlusFee(value).call()
        cls.transfer = lambda self, sender, recipient, value: mine_tx(
            cls.nomin.functions.transfer(recipient, value).transact({'from': sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.nomin.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(
            cls.nomin.functions.approve(spender, value).transact({'from': sender}))

        cls.forceLiquidation = lambda self, sender: mine_tx(
            cls.nomin.functions.forceLiquidation().transact({'from': sender}))
        cls.liquidate = lambda self, sender: mine_tx(cls.nomin.functions.liquidate().transact({'from': sender}))
        cls.extendLiquidationPeriod = lambda self, sender, extension: mine_tx(
            cls.nomin.functions.extendLiquidationPeriod(extension).transact({'from': sender}))
        cls.terminateLiquidation = lambda self, sender: mine_tx(
            cls.nomin.functions.terminateLiquidation().transact({'from': sender}))
        cls.selfDestruct = lambda self, sender: mine_tx(cls.nomin.functions.selfDestruct().transact({'from': sender}))

        cls.confiscateBalance = lambda self, sender, target: mine_tx(
            cls.nomin.functions.confiscateBalance(target).transact({'from': sender}))
        cls.unfreezeAccount = lambda self, sender, target: mine_tx(
            cls.nomin.functions.unfreezeAccount(target).transact({'from': sender}))

        cls.name = lambda self: cls.nomin.functions.name().call()
        cls.symbol = lambda self: cls.nomin.functions.symbol().call()
        cls.totalSupply = lambda self: cls.nomin.functions.totalSupply().call()
        cls.balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.transferFeeRate = lambda self: cls.nomin.functions.transferFeeRate().call()
        cls.feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.feeAuthority = lambda self: cls.nomin.functions.feeAuthority().call()

        cls.debugWithdrawAllEther = lambda self, sender, recipient: mine_tx(
            cls.nomin.functions.debugWithdrawAllEther(recipient).transact({'from': sender}))
        cls.debugEmptyFeePool = lambda self, sender: mine_tx(
            cls.nomin.functions.debugEmptyFeePool().transact({'from': sender}))
        cls.debugFreezeAccount = lambda self, sender, target: mine_tx(
            cls.nomin.functions.debugFreezeAccount(target).transact({'from': sender}))

    def test_constructor(self):
        # Nomin-specific members
        self.assertEqual(self.owner(), self.nomin_owner)
        self.assertEqual(self.poolFeeRate(), UNIT / 200)  # default fifty basis points
        self.assertEqual(self.nominPool(), 0)
        construct_time = block_time(self.construction_txr.blockNumber)
        self.assertEqual(construct_time, self.construction_price_time)
        self.assertTrue(self.frozen(self.nomin.address))

        # ExternStateFeeToken members
        self.assertEqual(self.name(), "Ether-Backed USD Nomins")
        self.assertEqual(self.symbol(), "eUSD")
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.balanceOf(MASTER), 0)
        self.assertEqual(self.transferFeeRate(), 15 * UNIT // 10000)
        self.assertEqual(self.feeAuthority(), self.nomin_havven)
        self.assertEqual(self.nomin.functions.decimals().call(), 18)

    def test_getSetOwner(self):
        pre_owner = self.owner()
        new_owner = DUMMY

        # Only the owner must be able to set the owner.
        self.assertReverts(self.nominateOwner, new_owner, new_owner)
        self.nominateOwner(pre_owner, new_owner)
        self.acceptOwnership(new_owner)
        self.assertEqual(self.owner(), new_owner)

    def test_getSetCourt(self):
        new_court = DUMMY

        # Only the owner must be able to set the court.
        self.assertReverts(self.setOracle, new_court, new_court)

        self.setCourt(self.owner(), new_court)
        self.assertEqual(self.court(), new_court)

    def test_transfer(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[1]

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.replenishPool(owner, 10 * UNIT, 20 * ETHER)
        ethercost = self.purchaseCostEther(10 * UNIT)
        self.buy(owner, 10 * UNIT, ethercost)

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.transfer, owner, self.nomin.address, UNIT)

        self.transfer(owner, target, 5 * UNIT)
        remainder = 10 * UNIT - self.transferPlusFee(5 * UNIT)
        self.assertEqual(self.balanceOf(owner), remainder)
        self.assertEqual(self.balanceOf(target), 5 * UNIT)

        self.debugFreezeAccount(owner, target)

        self.assertReverts(self.transfer, owner, target, UNIT)
        # self.assertReverts(self.transfer, target, owner, UNIT)

        self.unfreezeAccount(owner, target)

        qty = (5 * UNIT * UNIT) // self.transferPlusFee(UNIT) + 1
        self.transfer(target, owner, qty)

        self.assertEqual(self.balanceOf(owner), remainder + qty)
        self.assertEqual(self.balanceOf(target), 0)

    def test_transferFrom(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[1]

        # Unauthorized transfers should not work
        self.assertReverts(self.transferFrom, DUMMY, owner, target, UNIT)

        # Neither should transfers that are too large for the allowance.
        self.approve(owner, DUMMY, UNIT)
        self.assertReverts(self.transferFrom, DUMMY, owner, target, 2 * UNIT)

        self.approve(owner, DUMMY, 10000 * UNIT)

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.replenishPool(owner, 10 * UNIT, 20 * ETHER)
        ethercost = self.purchaseCostEther(10 * UNIT)
        self.buy(owner, 10 * UNIT, ethercost)

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.transferFrom, DUMMY, owner, self.nomin.address, UNIT)

        self.transferFrom(DUMMY, owner, target, 5 * UNIT)
        remainder = 10 * UNIT - self.transferPlusFee(5 * UNIT)
        self.assertEqual(self.balanceOf(owner), remainder)
        self.assertEqual(self.balanceOf(target), 5 * UNIT)

        self.debugFreezeAccount(owner, target)

        self.assertReverts(self.transferFrom, DUMMY, owner, target, UNIT)
        self.assertReverts(self.transferFrom, DUMMY, target, owner, UNIT)

        self.unfreezeAccount(owner, target)

        qty = (5 * UNIT * UNIT) // self.transferPlusFee(UNIT) + 1
        self.transfer(target, owner, qty)

        self.assertEqual(self.balanceOf(owner), remainder + qty)
        self.assertEqual(self.balanceOf(target), 0)

    def test_confiscateBalance(self):
        owner = self.owner()
        target = W3.eth.accounts[2]

        self.assertEqual(self.court(), self.fake_court.address)

        # The target must have some nomins. We will issue 10 for him to buy
        fast_forward(2)
        self.replenishPool(owner, 10 * UNIT, 20 * ETHER)
        ethercost = self.purchaseCostEther(10 * UNIT)
        send_value(owner, target, ethercost)
        self.buy(target, 10 * UNIT, ethercost)
        self.assertEqual(self.balanceOf(target), 10 * UNIT)

        motion_id = 1
        self.fake_court.setTargetMotionID(owner, target, motion_id)

        # Attempt to confiscate even though the conditions are not met.
        self.fake_court.setConfirming(owner, motion_id, False)
        self.fake_court.setVotePasses(owner, motion_id, False)
        self.assertReverts(self.fake_court.confiscateBalance, owner, target)

        self.fake_court.setConfirming(owner, motion_id, True)
        self.fake_court.setVotePasses(owner, motion_id, False)
        self.assertReverts(self.fake_court.confiscateBalance, owner, target)

        self.fake_court.setConfirming(owner, motion_id, False)
        self.fake_court.setVotePasses(owner, motion_id, True)
        self.assertReverts(self.fake_court.confiscateBalance, owner, target)

        # Set up the target balance to be confiscatable.
        self.fake_court.setConfirming(owner, motion_id, True)
        self.fake_court.setVotePasses(owner, motion_id, True)

        # Only the court should be able to confiscate balances.
        self.assertReverts(self.confiscateBalance, owner, target)

        # Actually confiscate the balance.
        pre_feePool = self.feePool()
        pre_balance = self.balanceOf(target)
        self.fake_court.confiscateBalance(owner, target)
        self.assertEqual(self.balanceOf(target), 0)
        self.assertEqual(self.feePool(), pre_feePool + pre_balance)
        self.assertTrue(self.frozen(target))

    def test_unfreezeAccount(self):
        owner = self.owner()
        target = W3.eth.accounts[1]

        # The nomin contract itself should not be unfreezable.
        tx_receipt = self.unfreezeAccount(owner, self.nomin.address)
        self.assertTrue(self.frozen(self.nomin.address))
        self.assertEqual(len(tx_receipt.logs), 0)

        # Unfreezing non-frozen accounts should not do anything.
        self.assertFalse(self.frozen(target))
        tx_receipt = self.unfreezeAccount(owner, target)
        self.assertFalse(self.frozen(target))
        self.assertEqual(len(tx_receipt.logs), 0)

        self.debugFreezeAccount(owner, target)
        self.assertTrue(self.frozen(target))

        # Only the owner should be able to unfreeze an account.
        self.assertReverts(self.unfreezeAccount, target, target)

        tx_receipt = self.unfreezeAccount(owner, target)
        self.assertFalse(self.frozen(target))

        # Unfreezing should emit the appropriate log.
        log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        self.assertEqual(log['event'], 'AccountUnfrozen')

    def test_fallback(self):
        # Fallback function should be payable.
        owner = self.owner()
        self.debugWithdrawAllEther(owner, owner)
        self.debugEmptyFeePool(owner)
        self.assertEqual(get_eth_balance(self.nomin.address), 0)
        send_value(owner, self.nomin.address, ETHER // 2)
        send_value(owner, self.nomin.address, ETHER // 2)
        self.assertEqual(get_eth_balance(self.nomin.address), ETHER)

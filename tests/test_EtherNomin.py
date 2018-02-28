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

ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"
FAKECOURT_SOURCE = "tests/contracts/FakeCourt.sol"
PROXY_SOURCE = "contracts/Proxy.sol"


def setUpModule():
    print("Testing EtherNomin...")


def tearDownModule():
    print()


class TestEtherNomin(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        utils.generalutils.time_fast_forwarded = 0
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

    def test_time_elapsed(self):
        return utils.generalutils.time_fast_forwarded + (round(time.time()) - self.initial_time)

    def now_block_time(self):
        return block_time() + self.test_time_elapsed()

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([ETHERNOMIN_SOURCE, FAKECOURT_SOURCE, PROXY_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin_abi = compiled['PublicEtherNomin']['abi']
        cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

        cls.nomin_havven = W3.eth.accounts[1]
        cls.nomin_oracle = W3.eth.accounts[2]
        cls.nomin_beneficiary = W3.eth.accounts[3]
        cls.nomin_owner = W3.eth.accounts[0]

        cls.nomin_real, cls.construction_txr = attempt_deploy(compiled, 'PublicEtherNomin', MASTER,
                                                              [cls.nomin_havven, cls.nomin_oracle,
                                                               cls.nomin_beneficiary,
                                                               1000 * UNIT, cls.nomin_owner, ZERO_ADDRESS])
        cls.construction_price_time = cls.nomin_real.functions.lastPriceUpdate().call()
        cls.initial_time = cls.construction_price_time

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
        cls.fake_court.setNomin(W3.eth.accounts[0], cls.nomin_real.address)

        cls.nomin_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                            MASTER, [cls.nomin_real.address, cls.nomin_owner])
        mine_tx(cls.nomin_real.functions.setProxy(cls.nomin_proxy.address).transact({'from': cls.nomin_owner}))
        #cls.nomin = W3.eth.contract(address=cls.nomin_proxy.address, abi=compiled['PublicEtherNomin']['abi'])
        cls.nomin = cls.nomin_real

        mine_tx(cls.nomin_real.functions.setCourt(cls.fake_court.address).transact({'from': cls.nomin_owner}))

        cls.owner = lambda self: cls.nomin.functions.owner().call()
        cls.oracle = lambda self: cls.nomin.functions.oracle().call()
        cls.court = lambda self: cls.nomin.functions.court().call()
        cls.beneficiary = lambda self: cls.nomin.functions.beneficiary().call()
        cls.nominPool = lambda self: cls.nomin.functions.nominPool_dec().call()
        cls.poolFeeRate = lambda self: cls.nomin.functions.poolFeeRate_dec().call()
        cls.liquidationPeriod = lambda self: cls.nomin.functions.liquidationPeriod().call()
        cls.liquidationTimestamp = lambda self: cls.nomin.functions.liquidationTimestamp().call()
        cls.etherPrice = lambda self: cls.nomin.functions.etherPrice_dec().call()
        cls.isFrozen = lambda self, address: cls.nomin.functions.isFrozen(address).call()
        cls.lastPriceUpdate = lambda self: cls.nomin.functions.lastPriceUpdate().call()
        cls.stalePeriod = lambda self: cls.nomin.functions.stalePeriod().call()

        cls.nominateOwner = lambda self, sender, address: mine_tx(
            cls.nomin.functions.nominateOwner(address).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.nomin.functions.acceptOwnership().transact({'from': sender}))
        cls.setOracle = lambda self, sender, address: mine_tx(
            cls.nomin.functions.setOracle(address).transact({'from': sender}))
        cls.setCourt = lambda self, sender, address: mine_tx(
            cls.nomin.functions.setCourt(address).transact({'from': sender}))
        cls.setBeneficiary = lambda self, sender, address: mine_tx(
            cls.nomin.functions.setBeneficiary(address).transact({'from': sender}))
        cls.setPoolFeeRate = lambda self, sender, rate: mine_tx(
            cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender}))
        cls.updatePrice = lambda self, sender, price, timeSent: mine_tx(
            cls.nomin_real.functions.updatePrice(price, timeSent).transact({'from': sender}))
        cls.setStalePeriod = lambda self, sender, period: mine_tx(
            cls.nomin.functions.setStalePeriod(period).transact({'from': sender}))

        cls.fiatValue = lambda self, eth: cls.nomin.functions.fiatValue(eth).call()
        cls.fiatBalance = lambda self: cls.nomin.functions.fiatBalance().call()
        cls.collateralisationRatio = lambda self: cls.nomin.functions.collateralisationRatio().call()
        cls.etherValue = lambda self, fiat: cls.nomin.functions.etherValue(fiat).call()
        cls.etherValueAllowStale = lambda self, fiat: cls.nomin.functions.publicEtherValueAllowStale(fiat).call()
        cls.poolFeeIncurred = lambda self, n: cls.nomin.functions.poolFeeIncurred(n).call()
        cls.purchaseCostFiat = lambda self, n: cls.nomin.functions.purchaseCostFiat(n).call()
        cls.purchaseCostEther = lambda self, n: cls.nomin.functions.purchaseCostEther(n).call()
        cls.saleProceedsFiat = lambda self, n: cls.nomin.functions.saleProceedsFiat(n).call()
        cls.saleProceedsEther = lambda self, n: cls.nomin.functions.saleProceedsEther(n).call()
        cls.saleProceedsEtherAllowStale = lambda self, n: cls.nomin.functions.publicSaleProceedsEtherAllowStale(
            n).call()
        cls.priceIsStale = lambda self: cls.nomin.functions.priceIsStale().call()
        cls.isLiquidating = lambda self: cls.nomin.functions.isLiquidating().call()
        cls.canSelfDestruct = lambda self: cls.nomin.functions.canSelfDestruct().call()

        cls.transferPlusFee = lambda self, value: cls.nomin.functions.transferPlusFee(value).call()
        cls.transfer = lambda self, sender, recipient, value: mine_tx(
            cls.nomin.functions.transfer(recipient, value).transact({'from': sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.nomin.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(
            cls.nomin.functions.approve(spender, value).transact({'from': sender}))
        cls.issue = lambda self, sender, n, value: mine_tx(
            cls.nomin.functions.issue(n).transact({'from': sender, 'value': value}))
        cls.burn = lambda self, sender, n: mine_tx(cls.nomin.functions.burn(n).transact({'from': sender}))
        cls.buy = lambda self, sender, n, value: mine_tx(
            cls.nomin.functions.buy(n).transact({'from': sender, 'value': value}))
        cls.sell = lambda self, sender, n: mine_tx(
            cls.nomin.functions.sell(n).transact({'from': sender, 'gasPrice': 10}))

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
        self.assertEqual(self.oracle(), self.nomin_oracle)
        self.assertEqual(self.beneficiary(), self.nomin_beneficiary)
        self.assertEqual(self.etherPrice(), 1000 * UNIT)
        self.assertEqual(self.stalePeriod(), 2 * 24 * 60 * 60)  # default two days
        self.assertEqual(self.liquidationTimestamp(), 2**256 - 1)
        self.assertEqual(self.liquidationPeriod(), 90 * 24 * 60 * 60)  # default ninety days
        self.assertEqual(self.poolFeeRate(), UNIT / 200)  # default fifty basis points
        self.assertEqual(self.nominPool(), 0)
        construct_time = block_time(self.construction_txr.blockNumber)
        self.assertEqual(construct_time, self.construction_price_time)
        self.assertTrue(self.isFrozen(self.nomin_real.address))

        # ExternStateProxyFeeToken members
        self.assertEqual(self.name(), "Ether-Backed USD Nomins")
        self.assertEqual(self.symbol(), "eUSD")
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.balanceOf(MASTER), 0)
        self.assertEqual(self.transferFeeRate(), 15 * UNIT // 10000)
        self.assertEqual(self.feeAuthority(), self.nomin_havven)

    def test_getSetOwner(self):
        pre_owner = self.owner()
        new_owner = DUMMY

        # Only the owner must be able to set the owner.
        self.assertReverts(self.nominateOwner, new_owner, new_owner)
        self.nominateOwner(pre_owner, new_owner)
        self.acceptOwnership(new_owner)
        self.assertEqual(self.owner(), new_owner)

    def test_getSetOracle(self):
        pre_oracle = self.oracle()
        new_oracle = DUMMY

        # Only the owner must be able to set the oracle.
        self.assertReverts(self.setOracle, new_oracle, new_oracle)

        self.setOracle(self.owner(), new_oracle)
        self.assertEqual(self.oracle(), new_oracle)

    def test_getSetCourt(self):
        new_court = DUMMY

        # Only the owner must be able to set the court.
        self.assertReverts(self.setOracle, new_court, new_court)

        self.setCourt(self.owner(), new_court)
        self.assertEqual(self.court(), new_court)

    def test_getSetBeneficiary(self):
        new_beneficiary = DUMMY

        # Only the owner must be able to set the beneficiary.
        self.assertReverts(self.setBeneficiary, new_beneficiary, new_beneficiary)

        self.setBeneficiary(self.owner(), new_beneficiary)
        self.assertEqual(self.beneficiary(), new_beneficiary)

    def test_getSetPoolFeeRate(self):
        owner = self.owner()
        new_rate = UNIT // 10

        # Only the owner must be able to set the pool fee rate.
        self.assertReverts(self.setPoolFeeRate, DUMMY, new_rate)

        # Pool fee rate must be no greater than UNIT.
        self.assertReverts(self.setPoolFeeRate, owner, UNIT + 1)
        self.assertReverts(self.setPoolFeeRate, owner, 2**256 - 1)
        self.setPoolFeeRate(owner, UNIT)
        self.assertEqual(self.poolFeeRate(), UNIT)

        self.setPoolFeeRate(owner, new_rate)
        self.assertEqual(self.poolFeeRate(), new_rate)

    def test_getSetStalePeriod(self):
        owner = self.owner()
        new_period = 52 * 7 * 24 * 60 * 60

        # Only the owner should be able to set the pool fee rate.
        self.assertReverts(self.setStalePeriod, DUMMY, new_period)

        self.setStalePeriod(owner, new_period)
        self.assertEqual(self.stalePeriod(), new_period)

    def test_updatePrice(self):
        owner = self.owner()
        pre_price = self.etherPrice()
        new_price = 10**8 * UNIT  # one hundred million dollar ethers $$$$$$
        new_price2 = UNIT // 10**6  # one ten thousandth of a cent ethers :(
        pre_oracle = self.oracle()
        new_oracle = DUMMY

        # Only the oracle must be able to set the current price.
        self.assertReverts(self.updatePrice, new_oracle, new_price, self.now_block_time())

        # Check if everything works with nothing in the pool.
        t = self.now_block_time()
        tx_receipt = self.updatePrice(pre_oracle, new_price, t)
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        fast_forward(2)
        self.assertEqual(self.lastPriceUpdate(), t)
        self.assertEqual(self.etherPrice(), new_price)

        self.setOracle(owner, new_oracle)

        self.assertReverts(self.updatePrice, pre_oracle, pre_price, self.now_block_time())

        t = self.now_block_time()
        tx_receipt = self.updatePrice(new_oracle, new_price2, t)
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        fast_forward(2)

        self.assertEqual(self.lastPriceUpdate(), t)
        self.assertEqual(self.etherPrice(), new_price2)

        # Check if everything works with something in the pool.
        self.updatePrice(new_oracle, UNIT, self.now_block_time())
        fast_forward(2)
        backing = self.etherValue(10 * UNIT)
        self.issue(owner, UNIT, backing)

        t = self.now_block_time()
        tx_receipt = self.updatePrice(new_oracle, pre_price, t)
        fast_forward(2)
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), t)
        self.assertEqual(self.etherPrice(), pre_price)

        # Check that an old transaction doesn't overwrite a new one.
        t = self.now_block_time()
        tx_receipt = self.updatePrice(new_oracle, pre_price, t)
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), t)
        self.assertEqual(self.etherPrice(), pre_price)
        # A transaction that was sent 10 seconds before the above one should fail.
        self.assertReverts(self.updatePrice, new_oracle, new_price2, t - 10)
        fast_forward(2)

        # Check that a transaction with the same sentTime doesn't overwrite the most recently received one.
        t = self.now_block_time()
        tx_receipt = self.updatePrice(new_oracle, pre_price, t)
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), t)
        self.assertEqual(self.etherPrice(), pre_price)
        # A transaction that was sent at the same time as the last one should fail.
        self.assertReverts(self.updatePrice, new_oracle, new_price2, t)
        # A transaction send more than 10 minutes in the future should not work.
        self.assertReverts(self.updatePrice, new_oracle, new_price2, t + to_seconds(minutes=10) + 10)
        # ...but 9 minutes should work.
        self.updatePrice(new_oracle, new_price2, t + to_seconds(minutes=9))

    def test_fiatValue(self):
        oracle = self.oracle()

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.fiatValue(ETHER), ETHER)
        self.assertEqual(self.fiatValue(777 * ETHER), 777 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 777), ETHER // 777)
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**12)

        self.updatePrice(oracle, 10**8 * UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.fiatValue(ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(317 * ETHER), 317 * 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 317), 10**8 * (ETHER // 317))
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**16 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**4)

        self.updatePrice(oracle, UNIT // 10**12, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.fiatValue(ETHER), ETHER // 10**12)
        self.assertEqual(self.fiatValue(10**15 * ETHER), 10**3 * ETHER)
        self.assertEqual(self.fiatValue((7 * ETHER) // 3), ((7 * ETHER) // 3) // 10**12)

    def test_fiatBalance(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        send_value(owner, self.nomin_real.address, ETHER // 2)
        send_value(owner, self.nomin.address, ETHER // 2)
        self.assertEqual(self.fiatBalance(), pre_price)
        self.updatePrice(oracle, UNIT // 10**12, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.fiatBalance(), UNIT // 10**12)
        self.updatePrice(oracle, 300 * UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.fiatBalance(), 300 * UNIT)
        send_value(owner, self.nomin_real.address, ETHER // 2)
        send_value(owner, self.nomin.address, ETHER // 2)
        self.assertEqual(self.fiatBalance(), 600 * UNIT)

    def test_etherValue(self):
        oracle = self.oracle()

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.etherValue(UNIT), ETHER)
        self.assertEqual(self.etherValue(777 * UNIT), 777 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 777), ETHER // 777)
        self.assertEqual(self.etherValue(10**8 * UNIT), 10**8 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 10**12), ETHER // 10**12)

        self.updatePrice(oracle, 10 * UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.etherValue(UNIT), ETHER // 10)
        self.assertEqual(self.etherValue(2 * UNIT), ETHER // 5)

        for v in [0.0004, 2.1, 1, 49994, 49.29384, 0.00000028, 1235759872, 2.5 * 10**25]:
            vi = int(v * UNIT)
            self.assertEqual(self.etherValue(vi), self.etherValueAllowStale(vi))

    def test_collateralisationRatio(self):
        owner = self.owner()
        oracle = self.oracle()

        # When there are no nomins in the contract, a zero denominator causes reversion.
        self.assertReverts(self.collateralisationRatio)

        # Set the ether price to $1, and issue one nomin against 2 ether.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, UNIT, 2 * ETHER)
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

        # Set the ether price to $2, now the collateralisation ratio should double to 4.
        self.updatePrice(oracle, 2 * UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.collateralisationRatio(), 4 * UNIT)

        # Now set the ether price to 50 cents, so that the collateralisation is exactly 1
        self.updatePrice(oracle, UNIT // 2, self.now_block_time())
        fast_forward(2)
        # (this should not trigger liquidation)
        self.assertFalse(self.isLiquidating())
        self.assertEqual(self.collateralisationRatio(), UNIT)

        # Now double the ether in the contract to 2.
        send_value(owner, self.nomin.address, ETHER)
        send_value(owner, self.nomin_real.address, ETHER)
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

    def test_poolFeeIncurred(self):
        poolFeeRate = self.poolFeeRate()

        self.assertEqual(self.poolFeeIncurred(0), 0)
        self.assertEqual(self.poolFeeIncurred(UNIT), poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(10 * UNIT), 10 * poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(UNIT // 2), poolFeeRate // 2)
        self.setPoolFeeRate(self.owner(), UNIT // 10**7)
        self.assertEqual(self.poolFeeIncurred(UNIT), UNIT // 10**7)
        self.assertEqual(self.poolFeeIncurred(100 * UNIT), UNIT // 10**5)
        self.assertEqual(self.poolFeeIncurred(UNIT // 2), UNIT // (2 * 10**7))

    def test_purchaseCostFiat(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

        self.assertGreater(self.purchaseCostFiat(UNIT), UNIT)
        self.assertGreater(self.purchaseCostFiat(UNIT), self.saleProceedsFiat(UNIT))

        self.assertEqual(self.purchaseCostFiat(0), 0)
        self.assertEqual(self.purchaseCostFiat(UNIT), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostFiat(10 * UNIT), 10 * (UNIT + poolFeeRate))
        self.assertEqual(self.purchaseCostFiat(UNIT // 2), (UNIT + poolFeeRate) // 2)
        self.setPoolFeeRate(owner, UNIT // 10**7)
        self.assertEqual(self.purchaseCostFiat(UNIT), (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostFiat(100 * UNIT), 100 * (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostFiat(UNIT // 2), (UNIT + UNIT // 10**7) // 2)
        self.setPoolFeeRate(owner, poolFeeRate)

    def test_purchaseCostEther(self):
        owner = self.owner()
        oracle = self.oracle()
        poolFeeRate = self.poolFeeRate()

        self.assertGreater(self.purchaseCostEther(UNIT), self.etherValue(UNIT))
        self.assertGreater(self.purchaseCostEther(UNIT), self.saleProceedsEther(UNIT))

        self.assertEqual(self.purchaseCostEther(0), 0)

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.purchaseCostEther(UNIT), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(UNIT // 2), (UNIT + poolFeeRate) // 2)
        self.setPoolFeeRate(owner, UNIT // 10**7)
        self.assertEqual(self.purchaseCostEther(UNIT), (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostEther(100 * UNIT), 100 * (UNIT + UNIT // 10**7))

        self.setPoolFeeRate(owner, poolFeeRate)
        self.updatePrice(oracle, UNIT // 2, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.purchaseCostEther(UNIT // 2), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(3 * UNIT), 6 * (UNIT + poolFeeRate))

    def test_purchaseCostEtherShoppingSpree(self):
        owner = self.owner()
        oracle = self.oracle()
        self.issue(owner, 800000 * UNIT, 8 * 10**9 * UNIT)

        price_multiples = [12398, 1.2384889, 7748.22, 0.238838, 0.00049944, 5.7484, 87.2211111]
        qty_multiples = [2.3, 84.4828, 284.10002, 0.4992, 105.289299991, 7.651948, 0.01, 100000]

        total_qty = 0
        total_cost = 0
        pre_balance = get_eth_balance(owner)

        for price_mult in price_multiples:
            for qty_mult in qty_multiples:
                price = int(price_mult * UNIT)
                qty = int(qty_mult * UNIT)
                total_qty += qty
                self.updatePrice(oracle, price, self.now_block_time())
                fast_forward(2)
                cost = self.purchaseCostEther(qty)
                total_cost += cost
                self.buy(owner, qty, cost)

        self.assertEqual(self.balanceOf(owner), total_qty)

        # We assert only almost equal because we're ignoring gas costs.
        self.assertAlmostEqual((pre_balance - get_eth_balance(owner)) / UNIT, total_cost / UNIT)

    def test_saleProceedsFiat(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

        self.assertLess(self.saleProceedsFiat(UNIT), UNIT)
        self.assertLess(self.saleProceedsFiat(UNIT), self.purchaseCostFiat(UNIT))

        self.assertEqual(self.saleProceedsFiat(0), 0)
        self.assertEqual(self.saleProceedsFiat(UNIT), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsFiat(10 * UNIT), 10 * (UNIT - poolFeeRate))
        self.assertEqual(self.saleProceedsFiat(UNIT // 2), (UNIT - poolFeeRate) // 2)
        self.setPoolFeeRate(owner, UNIT // 10**7)
        self.assertEqual(self.saleProceedsFiat(UNIT), (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsFiat(100 * UNIT), 100 * (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsFiat(UNIT // 2), (UNIT - UNIT // 10**7) // 2)
        self.setPoolFeeRate(owner, poolFeeRate)

    def test_saleProceedsEther(self):
        owner = self.owner()
        oracle = self.oracle()
        poolFeeRate = self.poolFeeRate()

        self.assertLess(self.saleProceedsEther(UNIT), self.etherValue(UNIT))
        self.assertLess(self.saleProceedsEther(UNIT), self.purchaseCostEther(UNIT))

        self.assertEqual(self.saleProceedsEther(0), 0)

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.saleProceedsEther(UNIT), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(UNIT // 2), (UNIT - poolFeeRate) // 2)
        self.setPoolFeeRate(owner, UNIT // 10**7)
        self.assertEqual(self.saleProceedsEther(UNIT), (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsEther(100 * UNIT), 100 * (UNIT - UNIT // 10**7))

        self.setPoolFeeRate(owner, poolFeeRate)
        self.updatePrice(oracle, UNIT // 2, self.now_block_time())
        fast_forward(2)
        self.assertEqual(self.saleProceedsEther(UNIT // 2), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(3 * UNIT), 6 * (UNIT - poolFeeRate))

        for v in [0.0004, 2.1, 1, 49994, 49.29384, 0.00000028, 1235759872, 2.5 * 10**25]:
            vi = int(v * UNIT)
            self.assertEqual(self.saleProceedsEther(vi), self.saleProceedsEtherAllowStale(vi))

    def test_saleProceedsEtherBearMarket(self):
        owner = self.owner()
        oracle = self.oracle()

        initial_qty = 800000 * UNIT
        self.issue(owner, initial_qty, 8 * 10**9 * UNIT)
        self.buy(owner, initial_qty, self.purchaseCostEther(initial_qty))

        price_multiples = [12398, 1.2384889, 7748.22, 0.238838, 0.00049944, 5.7484, 87.2211111]
        qty_multiples = [2.3, 84.4828, 284.10002, 0.4992, 105.289299991, 7.651948, 0.01, 100000]

        total_qty = 0
        total_proceeds = 0
        pre_balance = get_eth_balance(owner)

        for price_mult in price_multiples:
            for qty_mult in qty_multiples:
                price = int(price_mult * UNIT)
                qty = int(qty_mult * UNIT)
                total_qty += qty
                self.updatePrice(oracle, price, self.now_block_time())
                fast_forward(2)
                proceeds = self.saleProceedsEther(qty)
                total_proceeds += proceeds
                self.sell(owner, qty)

        self.assertEqual(initial_qty - self.balanceOf(owner), total_qty)

        # We assert only almost equal because we're ignoring gas costs.
        self.assertAlmostEqual((get_eth_balance(owner) - pre_balance) / UNIT, total_proceeds / UNIT)

    def test_priceIsStale(self):
        oracle = self.oracle()
        owner = self.owner()
        stale_period = self.stalePeriod()
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        # Price is not stale immediately following an update.
        self.assertFalse(self.priceIsStale())

        # Price is not stale after part of the period has elapsed.
        fast_forward(seconds=stale_period // 2)
        self.assertFalse(self.priceIsStale())

        # Price is not stale right up to just before the period has elapsed.
        fast_forward(seconds=stale_period // 2 - 10)
        self.assertFalse(self.priceIsStale())

        # Price becomes stale immediately after the period has elapsed.
        fast_forward(seconds=20)
        self.assertTrue(self.priceIsStale())

        # Price stays stale for ages.
        fast_forward(seconds=100 * stale_period)
        self.assertTrue(self.priceIsStale())

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.priceIsStale())

        # Lengthening stale periods should not trigger staleness.
        self.setStalePeriod(owner, 2 * stale_period)
        self.assertFalse(self.priceIsStale())

        # Shortening them to longer than the current elapsed period should not trigger staleness.
        self.setStalePeriod(owner, stale_period)
        self.assertFalse(self.priceIsStale())

        # Shortening to shorter than the current elapsed period should trigger staleness.
        fast_forward(seconds=3 * stale_period // 4)
        self.setStalePeriod(owner, stale_period // 2)
        self.assertTrue(self.priceIsStale())

        # Yet if we are able to update the stale period while the price is stale,
        # we should be able to turn off staleness by extending the period.
        # It's an interesting question of trust as to whether we should be able to do this, say if we
        # do not have access to the oracle to send a price update. But as an owner, we could just
        # reset the oracle address anyway, so we allow this.
        self.setStalePeriod(owner, stale_period)
        self.assertFalse(self.priceIsStale())

    def test_staleness(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[5]

        # Set up target balance to be confiscatable for later testing.
        self.assertEqual(self.court(), self.fake_court.address)
        motion_id = 1
        self.fake_court.setTargetMotionID(owner, target, motion_id)
        self.fake_court.setConfirming(owner, motion_id, True)
        self.fake_court.setVotePasses(owner, motion_id, True)

        # Create some nomins and set a convenient price.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        pce = self.purchaseCostEther(UNIT)
        self.issue(owner, 3 * UNIT, 7 * UNIT)
        self.buy(owner, UNIT, pce)

        # Enter stale period.
        fast_forward(seconds=10 * self.stalePeriod())
        self.assertTrue(self.priceIsStale())

        # These calls should work if the price is stale.
        oracle = self.oracle()
        court = self.court()
        beneficiary = self.beneficiary()
        poolFeeRate = self.poolFeeRate()
        stalePeriod = self.stalePeriod()
        self.nominPool()
        self.liquidationPeriod()
        self.liquidationTimestamp()
        self.etherPrice()
        self.lastPriceUpdate()
        self.isFrozen(self.nomin_real.address)
        self.setOracle(owner, oracle)
        self.setCourt(owner, court)
        self.setBeneficiary(owner, beneficiary)
        self.setPoolFeeRate(owner, poolFeeRate)
        self.setStalePeriod(owner, stalePeriod)
        self.etherValueAllowStale(UNIT)
        self.saleProceedsEtherAllowStale(UNIT)
        self.poolFeeIncurred(UNIT)
        self.purchaseCostFiat(UNIT)
        self.saleProceedsFiat(UNIT)
        self.priceIsStale()
        self.isLiquidating()
        self.assertFalse(self.isFrozen(MASTER))
        self.transfer(MASTER, MASTER, 0)
        self.transferFrom(MASTER, MASTER, MASTER, 0)
        self.fake_court.confiscateBalance(owner, target)
        self.unfreezeAccount(owner, target)
        self.burn(owner, UNIT)

        # These calls should not work when the price is stale.
        # That they work when not stale is guaranteed by other tests, hopefully.
        self.assertReverts(self.fiatValue, UNIT)
        self.assertReverts(self.fiatBalance)
        self.assertReverts(self.etherValue, UNIT)
        self.assertReverts(self.collateralisationRatio)
        self.assertReverts(self.purchaseCostEther, UNIT)
        self.assertReverts(self.saleProceedsEther, UNIT)
        self.assertGreater(get_eth_balance(owner), 7 * UNIT)
        self.assertEqual(self.nominPool(), UNIT)
        self.assertEqual(self.balanceOf(owner), UNIT)
        self.assertReverts(self.issue, owner, UNIT, 5 * UNIT)
        self.assertReverts(self.buy, owner, UNIT, pce)
        self.assertReverts(self.sell, owner, UNIT)

        # Liquidation things should work while stale...
        self.forceLiquidation(owner)
        self.assertTrue(self.isLiquidating())
        self.extendLiquidationPeriod(owner, 1)

        # ...except that we can't terminate liquidation unless the price is fresh.
        self.assertReverts(self.terminateLiquidation, owner)

        # Confirm that sell works regardless of staleness when in liquidation
        self.sell(owner, UNIT)
        # We can also burn under these conditions.
        self.burn(owner, UNIT)

        # Finally that updating the price gets us out of the stale period
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.priceIsStale())
        self.terminateLiquidation(owner)

        # And that self-destruction works during stale period.
        self.forceLiquidation(owner)
        fast_forward(seconds=self.stalePeriod() + self.liquidationPeriod())
        self.assertTrue(self.isLiquidating())
        self.assertTrue(self.priceIsStale())
        self.selfDestruct(owner)
        with self.assertRaises(Exception):
            self.etherPrice()

    def test_transfer(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[1]

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, 10 * UNIT, 20 * ETHER)
        ethercost = self.purchaseCostEther(10 * UNIT)
        self.buy(owner, 10 * UNIT, ethercost)

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.transfer, owner, self.nomin_real.address, UNIT)

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
        proxy = W3.eth.accounts[2]

        # Unauthorized transfers should not work
        self.assertReverts(self.transferFrom, proxy, owner, target, UNIT)

        # Neither should transfers that are too large for the allowance.
        self.approve(owner, proxy, UNIT)
        self.assertReverts(self.transferFrom, proxy, owner, target, 2 * UNIT)

        self.approve(owner, proxy, 10000 * UNIT)

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, 10 * UNIT, 20 * ETHER)
        ethercost = self.purchaseCostEther(10 * UNIT)
        self.buy(owner, 10 * UNIT, ethercost)

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.transferFrom, proxy, owner, self.nomin_real.address, UNIT)

        self.transferFrom(proxy, owner, target, 5 * UNIT)
        remainder = 10 * UNIT - self.transferPlusFee(5 * UNIT)
        self.assertEqual(self.balanceOf(owner), remainder)
        self.assertEqual(self.balanceOf(target), 5 * UNIT)

        self.debugFreezeAccount(owner, target)

        self.assertReverts(self.transferFrom, proxy, owner, target, UNIT)
        self.assertReverts(self.transferFrom, proxy, target, owner, UNIT)

        self.unfreezeAccount(owner, target)

        qty = (5 * UNIT * UNIT) // self.transferPlusFee(UNIT) + 1
        self.transfer(target, owner, qty)

        self.assertEqual(self.balanceOf(owner), remainder + qty)
        self.assertEqual(self.balanceOf(target), 0)

    def test_issue(self):
        owner = self.owner()
        oracle = self.oracle()

        # Only the contract owner should be able to issue new nomins.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertReverts(self.issue, W3.eth.accounts[4], UNIT, 2 * ETHER)

        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.nominPool(), 0)

        # Revert if less than 2x collateral is provided 
        self.assertReverts(self.issue, owner, UNIT, 2 * ETHER - 1)

        # Issue a nomin into the pool
        self.issue(owner, UNIT, 2 * ETHER)
        self.assertEqual(self.totalSupply(), UNIT)
        self.assertEqual(self.nominPool(), UNIT)
        self.assertEqual(get_eth_balance(self.nomin_real.address), 2 * ETHER)

        # Issuing more nomins should stack with existing supply
        self.issue(owner, UNIT, 2 * ETHER)
        self.assertEqual(self.totalSupply(), 2 * UNIT)
        self.assertEqual(self.nominPool(), 2 * UNIT)
        self.assertEqual(get_eth_balance(self.nomin_real.address), 4 * ETHER)

        # Issue more into the pool for free if price goes up
        self.updatePrice(oracle, 2 * UNIT, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.isLiquidating())
        self.assertReverts(self.issue, owner, 2 * UNIT + 1, 0)
        self.issue(owner, 2 * UNIT, 0)
        self.assertEqual(self.totalSupply(), 4 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT)
        self.assertEqual(get_eth_balance(self.nomin_real.address), 4 * ETHER)

        # provide more than 2x collateral for new issuance if price drops
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.isLiquidating())
        self.assertReverts(self.issue, owner, UNIT, 2 * ETHER)
        self.assertReverts(self.issue, owner, UNIT, 6 * ETHER - 1)
        self.issue(owner, UNIT, 6 * ETHER)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)
        self.assertEqual(get_eth_balance(self.nomin_real.address), 10 * ETHER)

    def test_burn(self):
        owner = self.owner()
        oracle = self.oracle()

        # issue some nomins to be burned
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, 10 * UNIT, 20 * ETHER)

        # Only the contract owner should be able to burn nomins.
        self.assertReverts(self.burn, W3.eth.accounts[4], UNIT)

        # It should not be possible to burn more nomins than are in the pool.
        self.assertReverts(self.burn, owner, 11 * UNIT)

        # Burn part of the pool
        self.assertEqual(self.totalSupply(), 10 * UNIT)
        self.assertEqual(self.nominPool(), 10 * UNIT)
        self.burn(owner, UNIT)
        self.assertEqual(self.totalSupply(), 9 * UNIT)
        self.assertEqual(self.nominPool(), 9 * UNIT)

        # Burn the remainder of the pool
        self.burn(owner, self.nominPool())
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.nominPool(), 0)

    def test_buy(self):
        self.updatePrice(self.oracle(), UNIT, self.now_block_time())
        fast_forward(2)
        buyer = W3.eth.accounts[4]

        # Should not be possible to buy when there's no supply
        cost = self.purchaseCostEther(UNIT)
        self.assertReverts(self.buy, buyer, UNIT, cost)

        # issue some nomins to be burned
        self.issue(self.owner(), 5 * UNIT, 10 * ETHER)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)

        # Should not be able to purchase with the wrong quantity of ether.
        self.assertReverts(self.buy, buyer, UNIT, cost + 1)
        self.assertReverts(self.buy, buyer, UNIT, cost - 1)

        self.assertEqual(self.balanceOf(buyer), 0)
        self.buy(buyer, UNIT, cost)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT)
        self.assertEqual(self.balanceOf(buyer), UNIT)

        # It should not be possible to buy fewer nomins than the purchase minimum
        purchaseMin = UNIT // 100
        self.assertReverts(self.buy, buyer, purchaseMin - 1, self.purchaseCostEther(purchaseMin - 1))

        # But it should be possible to buy exactly that quantity
        self.buy(buyer, purchaseMin, self.purchaseCostEther(purchaseMin))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT - (UNIT // 100))
        self.assertEqual(self.balanceOf(buyer), UNIT + UNIT // 100)

        # It should not be possible to buy more tokens than are in the pool
        total = self.nominPool()
        self.assertReverts(self.buy, buyer, total + 1, self.purchaseCostEther(total + 1))

        self.buy(buyer, total, self.purchaseCostEther(total))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 0)
        self.assertEqual(self.balanceOf(buyer), 5 * UNIT)

        # Should not be possible to buy when there's nothing in the pool
        self.assertReverts(self.buy, buyer, UNIT, self.purchaseCostEther(UNIT))

    def test_sell(self):
        # Prepare a seller who owns some nomins.
        self.updatePrice(self.oracle(), UNIT, self.now_block_time())
        fast_forward(2)
        seller = W3.eth.accounts[4]
        self.issue(self.owner(), 5 * UNIT, 10 * ETHER)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)
        self.assertEqual(self.balanceOf(seller), 0)

        # It should not be possible to sell nomins if you have none.
        self.assertReverts(self.sell, seller, UNIT)

        self.buy(seller, 5 * UNIT, self.purchaseCostEther(5 * UNIT))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 0)
        self.assertEqual(self.balanceOf(seller), 5 * UNIT)

        # It should not be possible to sell more nomins than you possess.
        self.assertReverts(self.sell, seller, 5 * UNIT + 1)

        # Selling nomins should yield back the right amount of ether.
        pre_balance = get_eth_balance(seller)
        self.sell(seller, 2 * UNIT)
        # This assertAlmostEqual hack is only because ganache refuses to be sensible about gas prices.
        # The receipt refuses to include the gas price and the values appear are inconsistent anyway.
        self.assertAlmostEqual(self.saleProceedsEther(2 * UNIT) / UNIT, (get_eth_balance(seller) - pre_balance) / UNIT)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 2 * UNIT)
        self.assertEqual(self.balanceOf(seller), 3 * UNIT)

    def test_isLiquidating(self):
        self.assertFalse(self.isLiquidating())
        self.forceLiquidation(self.owner())
        self.assertTrue(self.isLiquidating())

    def test_forceLiquidation(self):
        owner = self.owner()
        # non-owners should not be able to force liquidation.
        non_owner = W3.eth.accounts[6]
        self.assertNotEqual(owner, non_owner)
        self.assertReverts(self.forceLiquidation, non_owner)

        self.assertFalse(self.isLiquidating())
        tx_receipt = self.forceLiquidation(owner)
        self.assertTrue(self.isLiquidating())
        self.assertEqual(block_time(tx_receipt.blockNumber), self.liquidationTimestamp())
        self.assertEqual(len(tx_receipt.logs), 1)
        self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])['event'], "Liquidation")

        # This call should not work if liquidation has begun.
        self.assertReverts(self.forceLiquidation, owner)

    def test_autoLiquidation(self):
        owner = self.owner()
        oracle = self.oracle()

        # Do not liquidate if there's nothing in the pool.
        self.updatePrice(oracle, UNIT // 10, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.isLiquidating())

        # Issue something so that we can liquidate.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, UNIT, 2 * UNIT)

        # Ordinary price updates don't cause liquidation.
        self.updatePrice(oracle, UNIT // 2, self.now_block_time())
        fast_forward(2)
        self.assertFalse(self.isLiquidating())

        # Price updates inducing sub-unity collateralisation ratios cause liquidation.
        tx_receipt = self.updatePrice(oracle, UNIT // 2 - 1, self.now_block_time())
        fast_forward(2)
        self.assertTrue(self.isLiquidating())
        self.assertEqual(len(tx_receipt.logs), 2)
        price_update_log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        liquidation_log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[1])
        self.assertEqual(price_update_log['event'], 'PriceUpdated')
        self.assertEqual(liquidation_log['event'], 'Liquidation')

        # The auto liquidation check should do nothing when already under liquidation.
        tx_receipt = self.updatePrice(oracle, UNIT // 3 - 1, self.now_block_time())
        fast_forward(2)
        self.assertEqual(len(tx_receipt.logs), 1)
        price_update_log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        self.assertEqual(price_update_log['event'], 'PriceUpdated')
        self.assertTrue(self.isLiquidating())

    def test_extendLiquidationPeriod(self):
        owner = self.owner()

        # Only owner should be able to call this.
        non_owner = W3.eth.accounts[6]
        self.assertNotEqual(owner, non_owner)
        self.assertReverts(self.forceLiquidation, non_owner)

        ninetyDays = 90 * 24 * 60 * 60
        oneEightyDays = 180 * 24 * 60 * 60

        self.forceLiquidation(owner)
        self.assertEqual(self.liquidationPeriod(), ninetyDays)  # Default 90 days.
        self.assertReverts(self.extendLiquidationPeriod, owner, 12309198139871)
        self.extendLiquidationPeriod(owner, 1)
        self.assertEqual(self.liquidationPeriod(), ninetyDays + 1)
        self.extendLiquidationPeriod(owner, 12345)
        self.assertEqual(self.liquidationPeriod(), ninetyDays + 12346)
        self.extendLiquidationPeriod(owner, ninetyDays - 12346)
        self.assertEqual(self.liquidationPeriod(), oneEightyDays)
        self.assertReverts(self.extendLiquidationPeriod, owner, 1)
        self.assertReverts(self.extendLiquidationPeriod, owner, 12309198139871)

    def test_terminateLiquidation(self):
        owner = self.owner()
        oracle = self.oracle()

        # Terminating liquidation should not work when not liquidating.
        self.assertReverts(self.terminateLiquidation, owner)

        self.forceLiquidation(owner)

        # Only the owner should be able to terminate liquidation.
        self.assertReverts(self.terminateLiquidation, oracle)

        # Should be able to terminate liquidation if there is no supply.
        tx_receipt = self.terminateLiquidation(owner)
        self.assertEqual(self.liquidationTimestamp(), 2**256 - 1)
        self.assertEqual(self.liquidationPeriod(), 90 * 24 * 60 * 60)
        self.assertEqual(len(tx_receipt.logs), 1)
        self.assertEqual(get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])['event'],
                         "LiquidationTerminated")

        # Should not be able to terminate liquidation if the supply is undercollateralised.
        self.updatePrice(oracle, 2 * UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, UNIT, UNIT)
        self.updatePrice(oracle, UNIT - 1, self.now_block_time())
        fast_forward(2)
        self.assertTrue(self.isLiquidating())  # Price update triggers liquidation.
        self.assertReverts(self.terminateLiquidation, owner)

        # But if the price recovers we should be fine to terminate.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.terminateLiquidation(owner)
        self.assertFalse(self.isLiquidating())

        # And we should not be able to terminate liquidation if the price is stale.
        self.forceLiquidation(owner)
        fast_forward(seconds=2 * self.stalePeriod())
        self.assertTrue(self.priceIsStale())
        self.assertReverts(self.terminateLiquidation, owner)

    def test_canSelfDestruct(self):
        owner = self.owner()
        oracle = self.oracle()

        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, 2 * UNIT, 4 * UNIT)
        self.buy(owner, UNIT, self.purchaseCostEther(UNIT))

        self.assertFalse(self.canSelfDestruct())
        self.forceLiquidation(owner)

        # Not enough time elapsed.
        self.assertFalse(self.canSelfDestruct())
        fast_forward(seconds=self.liquidationPeriod() + 10)
        self.assertTrue(self.canSelfDestruct())
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)

        self.terminateLiquidation(owner)
        self.sell(owner, UNIT)
        self.forceLiquidation(owner)

        self.assertFalse(self.canSelfDestruct())
        fast_forward(weeks=3)
        self.assertTrue(self.canSelfDestruct())

    def test_selfDestruct(self):
        owner = self.owner()
        oracle = self.oracle()
        not_owner = W3.eth.accounts[5]
        self.assertNotEqual(not_owner, owner)

        # Buy some nomins so that we can't short circuit self-destruction.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, UNIT, 2 * UNIT)
        self.buy(owner, UNIT, self.purchaseCostEther(UNIT))

        self.assertFalse(self.isLiquidating())
        self.assertFalse(self.canSelfDestruct())

        # This should not work if not liquidating yet.
        self.assertReverts(self.selfDestruct, owner)

        self.forceLiquidation(owner)

        # Should not work if the full liquidation period has not elapsed.
        self.assertReverts(self.selfDestruct, owner)

        # Should not work if the liquidationPeriod has been extended.
        buff = 1000
        fast_forward(seconds=self.liquidationPeriod() + buff // 2)
        self.extendLiquidationPeriod(owner, buff)
        self.assertReverts(self.selfDestruct, owner)

        # Go past the end of the liquidation period.
        fast_forward(seconds=buff)

        # Only the owner should be able to call this.
        self.assertReverts(self.selfDestruct, not_owner)

        # Should not be able to self-destruct if the period was terminated.
        # Refresh the price so we can terminate liquidation.
        self.updatePrice(self.oracle(), self.etherPrice(), self.now_block_time())
        fast_forward(2)
        self.terminateLiquidation(owner)
        self.assertReverts(self.selfDestruct, owner)

        # Check that the beneficiary receives the entire balance of the smart contract.
        self.forceLiquidation(owner)
        fast_forward(seconds=self.liquidationPeriod() + 1)
        value = get_eth_balance(self.nomin_real.address)
        beneficiary = self.beneficiary()
        pre_balance = get_eth_balance(beneficiary)
        self.selfDestruct(owner)
        self.assertEqual(get_eth_balance(beneficiary) - pre_balance, value)

    def test_selfDestructShortCircuit(self):
        owner = self.owner()
        oracle = self.oracle()
        not_owner = W3.eth.accounts[5]
        self.assertNotEqual(not_owner, owner)

        # Buy some nomins so that we can't immediately short circuit self-destruction.
        self.updatePrice(oracle, UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, UNIT, 2 * UNIT)
        self.buy(owner, UNIT // 2, self.purchaseCostEther(UNIT // 2))

        self.forceLiquidation(owner)

        # Should not be able to self-destruct, as one week has not yet elapsed.
        self.assertReverts(self.selfDestruct, owner)

        fast_forward(weeks=2)

        # Should not be able to self-destruct as there are still some nomins in circulation.
        self.assertReverts(self.selfDestruct, owner)

        # Sell all nomins back, we should be able to selfdestruct.
        self.sell(owner, UNIT // 2)
        tx_receipt = self.selfDestruct(owner)
        self.assertEqual(len(tx_receipt.logs), 1)
        log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        self.assertEqual(log['event'], "SelfDestructed")

    def test_confiscateBalance(self):
        owner = self.owner()
        target = W3.eth.accounts[2]

        self.assertEqual(self.court(), self.fake_court.address)

        # The target must have some nomins. We will issue 10 for him to buy
        self.updatePrice(self.oracle(), UNIT, self.now_block_time())
        fast_forward(2)
        self.issue(owner, 10 * UNIT, 20 * ETHER)
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
        self.assertTrue(self.isFrozen(target))

    def test_unfreezeAccount(self):
        owner = self.owner()
        target = W3.eth.accounts[1]

        # The nomin contract itself should not be unfreezable.
        tx_receipt = self.unfreezeAccount(owner, self.nomin_real.address)
        self.assertTrue(self.isFrozen(self.nomin_real.address))
        self.assertEqual(len(tx_receipt.logs), 0)

        # Unfreezing non-frozen accounts should not do anything.
        self.assertFalse(self.isFrozen(target))
        tx_receipt = self.unfreezeAccount(owner, target)
        self.assertFalse(self.isFrozen(target))
        self.assertEqual(len(tx_receipt.logs), 0)

        self.debugFreezeAccount(owner, target)
        self.assertTrue(self.isFrozen(target))

        # Only the owner should be able to unfreeze an account.
        self.assertReverts(self.unfreezeAccount, target, target)

        tx_receipt = self.unfreezeAccount(owner, target)
        self.assertFalse(self.isFrozen(target))

        # Unfreezing should emit the appropriate log.
        log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        self.assertEqual(log['event'], 'AccountUnfrozen')

    def test_fallback(self):
        # Fallback function should be payable.
        owner = self.owner()
        self.debugWithdrawAllEther(owner, owner)
        self.debugEmptyFeePool(owner)
        self.assertEqual(get_eth_balance(self.nomin_real.address), 0)
        send_value(owner, self.nomin.address, ETHER // 2)
        send_value(owner, self.nomin_real.address, ETHER // 2)
        self.assertEqual(get_eth_balance(self.nomin_real.address), ETHER)

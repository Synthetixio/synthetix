import unittest

from utils.deployutils import W3, UNIT, MASTER, ETHER
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time


ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"
FAKECOURT_SOURCE = "tests/contracts/FakeCourt.sol"


def setUpModule():
    print("Testing EtherNomin...")

def tearDownModule():
    print()

class TestEtherNomin(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        # Reset the price at the start of tests so that it's never stale.
        mine_tx(self.updatePrice(self.oracle(), self.etherPrice()))

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ETHERNOMIN_SOURCE, FAKECOURT_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin_abi = compiled['PublicEtherNomin']['abi']

        cls.nomin_havven = W3.eth.accounts[1]
        cls.nomin_oracle = W3.eth.accounts[2]
        cls.nomin_beneficiary = W3.eth.accounts[3]
        cls.nomin_owner = W3.eth.accounts[0]

        cls.nomin, cls.construction_txr = attempt_deploy(compiled, 'PublicEtherNomin', MASTER,
                                                         [cls.nomin_havven, cls.nomin_oracle, cls.nomin_beneficiary,
                                                          1000 * UNIT, cls.nomin_owner])
        cls.construction_price_time = cls.nomin.functions.lastPriceUpdate().call()

        cls.fake_court, _ = attempt_deploy(compiled, 'FakeCourt', MASTER, [])
        cls.fake_court.setNomin = lambda sender, new_nomin: cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender})
        cls.fake_court.setConfirming = lambda sender, target, status: cls.fake_court.functions.setConfirming(target, status).transact({'from': sender})
        cls.fake_court.setVotePasses = lambda sender, target, status: cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender})
        cls.fake_court.confiscateBalance = lambda sender, target: cls.fake_court.functions.confiscateBalance(target).transact({'from': sender})
        mine_tx(cls.fake_court.setNomin(W3.eth.accounts[0], cls.nomin.address))

        cls.owner = lambda self: cls.nomin.functions.owner().call()
        cls.oracle = lambda self: cls.nomin.functions.oracle().call()
        cls.court = lambda self: cls.nomin.functions.court().call()
        cls.beneficiary = lambda self: cls.nomin.functions.beneficiary().call()
        cls.nominPool = lambda self: cls.nomin.functions.nominPool().call()
        cls.poolFeeRate = lambda self: cls.nomin.functions.poolFeeRate().call()
        cls.liquidationPeriod = lambda self: cls.nomin.functions.liquidationPeriod().call()
        cls.liquidationTimestamp = lambda self: cls.nomin.functions.liquidationTimestamp().call()
        cls.etherPrice = lambda self: cls.nomin.functions.etherPrice().call()
        cls.isFrozen = lambda self, address: cls.nomin.functions.isFrozen(address).call()
        cls.lastPriceUpdate = lambda self: cls.nomin.functions.lastPriceUpdate().call()
        cls.stalePeriod = lambda self: cls.nomin.functions.stalePeriod().call()

        cls.setOwner = lambda self, sender, address: cls.nomin.functions.setOwner(address).transact({'from': sender})
        cls.setOracle = lambda self, sender, address: cls.nomin.functions.setOracle(address).transact({'from': sender})
        cls.setCourt = lambda self, sender, address: cls.nomin.functions.setCourt(address).transact({'from': sender})
        cls.setBeneficiary = lambda self, sender, address: cls.nomin.functions.setBeneficiary(address).transact({'from': sender})
        cls.setPoolFeeRate = lambda self, sender, rate: cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender})
        cls.updatePrice = lambda self, sender, price: cls.nomin.functions.updatePrice(price).transact({'from': sender})
        cls.setStalePeriod = lambda self, sender, period: cls.nomin.functions.setStalePeriod(period).transact({'from': sender})

        cls.fiatValue = lambda self, eth: cls.nomin.functions.fiatValue(eth).call()
        cls.fiatBalance = lambda self: cls.nomin.functions.fiatBalance().call()
        cls.collateralisationRatio = lambda self: cls.nomin.functions.collateralisationRatio().call()
        cls.etherValue = lambda self, fiat: cls.nomin.functions.etherValue(fiat).call()
        cls.poolFeeIncurred = lambda self, n: cls.nomin.functions.poolFeeIncurred(n).call()
        cls.purchaseCostFiat = lambda self, n: cls.nomin.functions.purchaseCostFiat(n).call()
        cls.purchaseCostEther = lambda self, n: cls.nomin.functions.purchaseCostEther(n).call()
        cls.saleProceedsFiat = lambda self, n: cls.nomin.functions.saleProceedsFiat(n).call()
        cls.saleProceedsEther = lambda self, n: cls.nomin.functions.saleProceedsEther(n).call()
        cls.priceIsStale = lambda self: cls.nomin.functions.priceIsStale().call()
        cls.isLiquidating = lambda self: cls.nomin.functions.isLiquidating().call()

        cls.transferPlusFee = lambda self, value: cls.nomin.functions.transferPlusFee(value).call()
        cls.transfer = lambda self, sender, recipient, value: cls.nomin.functions.transfer(recipient, value).transact({'from': sender})
        cls.transferFrom = lambda self, sender, fromAccount, to, value: cls.nomin.functions.transferFrom(fromAccount, to, value).transact({'from': sender})
        cls.approve = lambda self, sender, spender, value: cls.nomin.functions.approve(spender, value).transact({'from': sender})
        cls.issue = lambda self, sender, n, value: cls.nomin.functions.issue(n).transact({'from': sender, 'value': value})
        cls.burn = lambda self, sender, n: cls.nomin.functions.burn(n).transact({'from': sender})
        cls.buy = lambda self, sender, n, value: cls.nomin.functions.buy(n).transact({'from': sender, 'value': value})
        cls.sell = lambda self, sender, n: cls.nomin.functions.sell(n).transact({'from': sender, 'gasPrice': 10})

        cls.forceLiquidation = lambda self, sender: cls.nomin.functions.forceLiquidation().transact({'from': sender})
        cls.liquidate = lambda self, sender: cls.nomin.functions.liquidate().transact({'from': sender})
        cls.extendLiquidationPeriod = lambda self, sender, extension: cls.nomin.functions.extendLiquidationPeriod(extension).transact({'from': sender})
        cls.terminateLiquidation = lambda self, sender: cls.nomin.functions.terminateLiquidation().transact({'from': sender})
        cls.selfDestruct = lambda self, sender: cls.nomin.functions.selfDestruct().transact({'from': sender})

        cls.confiscateBalance = lambda self, sender, target: cls.nomin.functions.confiscateBalance(target).transact({'from': sender})
        cls.unfreezeAccount = lambda self, sender, target: cls.nomin.functions.unfreezeAccount(target).transact({'from': sender})

        cls.name = lambda self: cls.nomin.functions.name().call()
        cls.symbol = lambda self: cls.nomin.functions.symbol().call()
        cls.totalSupply = lambda self: cls.nomin.functions.totalSupply().call()
        cls.balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.transferFeeRate = lambda self: cls.nomin.functions.transferFeeRate().call()
        cls.feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.feeAuthority = lambda self: cls.nomin.functions.feeAuthority().call()

        cls.debugWithdrawAllEther = lambda self, sender, recipient: cls.nomin.functions.debugWithdrawAllEther(recipient).transact({'from': sender})
        cls.debugEmptyFeePool = lambda self, sender: cls.nomin.functions.debugEmptyFeePool().transact({'from': sender})
        cls.debugFreezeAccount = lambda self, sender, target: cls.nomin.functions.debugFreezeAccount(target).transact({'from': sender})

    def test_constructor(self):
        # Nomin-specific members
        self.assertEqual(self.owner(), self.nomin_owner)
        self.assertEqual(self.oracle(), self.nomin_oracle)
        self.assertEqual(self.beneficiary(), self.nomin_beneficiary)
        self.assertEqual(self.etherPrice(), 1000 * UNIT)
        self.assertEqual(self.stalePeriod(), 2 * 24 * 60 * 60) # default two days
        self.assertEqual(self.liquidationTimestamp(), 2**256 - 1)
        self.assertEqual(self.liquidationPeriod(), 90 * 24 * 60 * 60) # default ninety days
        self.assertEqual(self.poolFeeRate(), UNIT / 200) # default fifty basis points
        self.assertEqual(self.nominPool(), 0)
        construct_time = block_time(self.construction_txr.blockNumber)
        self.assertEqual(construct_time, self.construction_price_time)

        # ERC20FeeToken members
        self.assertEqual(self.name(), "Ether-Backed USD Nomins")
        self.assertEqual(self.symbol(), "eUSD")
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.balanceOf(MASTER), 0)
        self.assertEqual(self.transferFeeRate(), 2 * UNIT // 1000)
        self.assertEqual(self.feeAuthority(), self.nomin_havven)

    def test_getSetOwner(self):
        pre_owner = self.owner()
        new_owner = W3.eth.accounts[1]

        # Only the owner must be able to set the oracle.
        assertReverts(self, self.setOwner, [new_owner, new_owner])

        mine_tx(self.setOwner(pre_owner, new_owner))
        self.assertEqual(self.owner(), new_owner)

    def test_getSetOracle(self):
        pre_oracle = self.oracle()
        new_oracle = W3.eth.accounts[1]

        # Only the owner must be able to set the oracle.
        assertReverts(self, self.setOracle, [new_oracle, new_oracle])

        mine_tx(self.setOracle(self.owner(), new_oracle))
        self.assertEqual(self.oracle(), new_oracle)

    def test_getSetCourt(self):
        new_court = W3.eth.accounts[1]

        # Only the owner must be able to set the court.
        assertReverts(self, self.setOracle, [new_court, new_court])

        mine_tx(self.setCourt(self.owner(), new_court))
        self.assertEqual(self.court(), new_court)

    def test_getSetBeneficiary(self):
        new_beneficiary = W3.eth.accounts[1]

        # Only the owner must be able to set the beneficiary.
        assertReverts(self, self.setBeneficiary, [new_beneficiary, new_beneficiary])

        mine_tx(self.setBeneficiary(self.owner(), new_beneficiary))
        self.assertEqual(self.beneficiary(), new_beneficiary)

    def test_getSetPoolFeeRate(self):
        owner = self.owner()
        new_rate = UNIT // 10

        # Only the owner must be able to set the pool fee rate.
        assertReverts(self, self.setPoolFeeRate, [W3.eth.accounts[1], new_rate])
        # Pool fee rate must be no greater than UNIT.
        assertReverts(self, self.setPoolFeeRate, [owner, UNIT + 1])
        assertReverts(self, self.setPoolFeeRate, [owner, 2**256 - 1])
        mine_tx(self.setPoolFeeRate(owner, UNIT))
        self.assertEqual(self.poolFeeRate(), UNIT)

        mine_tx(self.setPoolFeeRate(owner, new_rate))
        self.assertEqual(self.poolFeeRate(), new_rate)

    def test_getSetStalePeriod(self):
        owner = self.owner()
        new_period = 52 * 7 * 24 * 60 * 60

        # Only the owner should be able to set the pool fee rate.
        assertReverts(self, self.setStalePeriod, [W3.eth.accounts[1], new_period])

        mine_tx(self.setStalePeriod(owner, new_period))
        self.assertEqual(self.stalePeriod(), new_period)

    def test_updatePrice(self):
        owner = self.owner()
        pre_price = self.etherPrice()
        new_price = 10**8 * UNIT # one hundred million dollar ethers $$$$$$
        new_price2 = UNIT // 10**6 # one ten thousandth of a cent ethers :(
        pre_oracle = self.oracle()
        new_oracle = W3.eth.accounts[1]

        # Only the oracle must be able to set the current price.
        assertReverts(self, self.updatePrice, [new_oracle, new_price])

        # Check if everything works with nothing in the pool.
        tx_receipt = mine_tx(self.updatePrice(pre_oracle, new_price))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), new_price)

        mine_tx(self.setOracle(owner, new_oracle))

        assertReverts(self, self.updatePrice, [pre_oracle, pre_price])

        tx_receipt = mine_tx(self.updatePrice(new_oracle, new_price2))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), new_price2)

        # Check if everything works with something in the pool.
        mine_tx(self.updatePrice(new_oracle, UNIT))
        backing = self.etherValue(10 * UNIT)
        mine_tx(self.issue(owner, UNIT, backing))

        tx_receipt = mine_tx(self.updatePrice(new_oracle, pre_price))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), pre_price)

    def test_fiatValue(self):
        oracle = self.oracle()

        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertEqual(self.fiatValue(ETHER), ETHER)
        self.assertEqual(self.fiatValue(777 * ETHER), 777 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 777), ETHER // 777)
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**12)

        mine_tx(self.updatePrice(oracle, 10**8 * UNIT))
        self.assertEqual(self.fiatValue(ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(317 * ETHER), 317 * 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 317), 10**8 * (ETHER // 317))
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**16 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**4)

        mine_tx(self.updatePrice(oracle, UNIT // 10**12))
        self.assertEqual(self.fiatValue(ETHER), ETHER // 10**12)
        self.assertEqual(self.fiatValue(10**15 * ETHER), 10**3 * ETHER)
        self.assertEqual(self.fiatValue((7 * ETHER) // 3), ((7 * ETHER) // 3) // 10**12)

    def test_fiatBalance(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(self.fiatBalance(), pre_price)
        mine_tx(self.updatePrice(oracle, UNIT // 10**12))
        self.assertEqual(self.fiatBalance(), UNIT // 10**12)
        mine_tx(self.updatePrice(oracle, 300 * UNIT))
        self.assertEqual(self.fiatBalance(), 300 * UNIT)
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(self.fiatBalance(), 600 * UNIT)

    def test_etherValue(self):
        oracle = self.oracle()

        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertEqual(self.etherValue(UNIT), ETHER)
        self.assertEqual(self.etherValue(777 * UNIT), 777 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 777), ETHER // 777)
        self.assertEqual(self.etherValue(10**8 * UNIT), 10**8 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 10**12), ETHER // 10**12)

        mine_tx(self.updatePrice(oracle, 10 * UNIT))
        self.assertEqual(self.etherValue(UNIT), ETHER // 10)
        self.assertEqual(self.etherValue(2 * UNIT), ETHER // 5)

    def test_collateralisationRatio(self):
        owner = self.owner()
        oracle = self.oracle()

        # When there are no nomins in the contract, a zero denominator causes reversion.
        assertReverts(self, self.collateralisationRatio)

        # Set the ether price to $1, and issue one nomin against 2 ether.
        mine_tx(self.updatePrice(oracle, UNIT))
        mine_tx(self.issue(owner, UNIT, 2 * ETHER))
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

        # Set the ether price to $2, now the collateralisation ratio should double to 4.
        mine_tx(self.updatePrice(oracle, 2 * UNIT))
        self.assertEqual(self.collateralisationRatio(), 4 * UNIT)

        # Now set the ether price to 50 cents, so that the collateralisation is exactly 1
        mine_tx(self.updatePrice(oracle, UNIT // 2))
        # (this should not trigger liquidation)
        self.assertFalse(self.isLiquidating())
        self.assertEqual(self.collateralisationRatio(), UNIT)

        # Now double the ether in the contract to 2.
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': 2 * ETHER}))
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

    def test_poolFeeIncurred(self):
        poolFeeRate = self.poolFeeRate()

        self.assertEqual(self.poolFeeIncurred(0), 0)
        self.assertEqual(self.poolFeeIncurred(UNIT), poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(10 * UNIT), 10 * poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(UNIT // 2), poolFeeRate // 2)
        mine_tx(self.setPoolFeeRate(self.owner(), UNIT // 10**7))
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
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.purchaseCostFiat(UNIT), (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostFiat(100 * UNIT), 100 * (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostFiat(UNIT // 2), (UNIT + UNIT // 10**7) // 2)
        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))

    def test_purchaseCostEther(self):
        owner = self.owner()
        oracle = self.oracle()
        poolFeeRate = self.poolFeeRate()

        self.assertGreater(self.purchaseCostEther(UNIT), self.etherValue(UNIT))
        self.assertGreater(self.purchaseCostEther(UNIT), self.saleProceedsEther(UNIT))

        self.assertEqual(self.purchaseCostEther(0), 0)

        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertEqual(self.purchaseCostEther(UNIT), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(UNIT // 2), (UNIT + poolFeeRate) // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.purchaseCostEther(UNIT), (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostEther(100 * UNIT), 100 * (UNIT + UNIT // 10**7))

        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))
        mine_tx(self.updatePrice(oracle, UNIT // 2))
        self.assertEqual(self.purchaseCostEther(UNIT // 2), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(3 * UNIT), 6 * (UNIT + poolFeeRate))

    def test_purchaseCostEtherShoppingSpree(self):
        owner = self.owner()
        oracle = self.oracle()
        mine_tx(self.issue(owner, 800000 * UNIT, 8 * 10**9 * UNIT))

        price_multiples = [12398, 1.2384889, 7748.22, 0.238838, 0.00049944, 5.7484, 87.2211111]
        qty_multiples = [2.3, 84.4828, 284.10002, 0.4992, 105.289299991, 7.651948, 0.01, 100000]

        total_qty = 0
        total_cost = 0
        pre_balance = W3.eth.getBalance(owner)

        for price_mult in price_multiples:
            for qty_mult in qty_multiples:
                price = int(price_mult * UNIT)
                qty = int(qty_mult * UNIT)
                total_qty += qty
                mine_tx(self.updatePrice(oracle, price))
                cost = self.purchaseCostEther(qty)
                total_cost += cost
                mine_tx(self.buy(owner, qty, cost))

        self.assertEqual(self.balanceOf(owner), total_qty)

        # We assert only almost equal because we're ignoring gas costs.
        self.assertAlmostEqual((pre_balance - W3.eth.getBalance(owner)) / UNIT, total_cost / UNIT)

    def test_saleProceedsFiat(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

        self.assertLess(self.saleProceedsFiat(UNIT), UNIT)
        self.assertLess(self.saleProceedsFiat(UNIT), self.purchaseCostFiat(UNIT))

        self.assertEqual(self.saleProceedsFiat(0), 0)
        self.assertEqual(self.saleProceedsFiat(UNIT), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsFiat(10 * UNIT), 10 * (UNIT - poolFeeRate))
        self.assertEqual(self.saleProceedsFiat(UNIT // 2), (UNIT - poolFeeRate) // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.saleProceedsFiat(UNIT), (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsFiat(100 * UNIT), 100 * (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsFiat(UNIT // 2), (UNIT - UNIT // 10**7) // 2)
        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))

    def test_saleProceedsEther(self):
        owner = self.owner()
        oracle = self.oracle()
        poolFeeRate = self.poolFeeRate()

        self.assertLess(self.saleProceedsEther(UNIT), self.etherValue(UNIT))
        self.assertLess(self.saleProceedsEther(UNIT), self.purchaseCostEther(UNIT))

        self.assertEqual(self.saleProceedsEther(0), 0)

        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertEqual(self.saleProceedsEther(UNIT), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(UNIT // 2), (UNIT - poolFeeRate) // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.saleProceedsEther(UNIT), (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsEther(100 * UNIT), 100 * (UNIT - UNIT // 10**7))

        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))
        mine_tx(self.updatePrice(oracle, UNIT // 2))
        self.assertEqual(self.saleProceedsEther(UNIT // 2), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(3 * UNIT), 6 * (UNIT - poolFeeRate))

    def test_saleProceedsEtherBearMarket(self):
        owner = self.owner()
        oracle = self.oracle()

        initial_qty = 800000 * UNIT
        mine_tx(self.issue(owner, initial_qty, 8 * 10**9 * UNIT))
        mine_tx(self.buy(owner, initial_qty, self.purchaseCostEther(initial_qty)))

        price_multiples = [12398, 1.2384889, 7748.22, 0.238838, 0.00049944, 5.7484, 87.2211111]
        qty_multiples = [2.3, 84.4828, 284.10002, 0.4992, 105.289299991, 7.651948, 0.01, 100000]

        total_qty = 0
        total_proceeds = 0
        pre_balance = W3.eth.getBalance(owner)

        for price_mult in price_multiples:
            for qty_mult in qty_multiples:
                price = int(price_mult * UNIT)
                qty = int(qty_mult * UNIT)
                total_qty += qty
                mine_tx(self.updatePrice(oracle, price))
                proceeds = self.saleProceedsEther(qty)
                total_proceeds += proceeds
                print(price, qty, proceeds, self.balanceOf(owner), W3.eth.getBalance(self.nomin.address))
                mine_tx(self.sell(owner, qty))


        self.assertEqual(initial_qty - self.balanceOf(owner), total_qty)

        # We assert only almost equal because we're ignoring gas costs.
        self.assertAlmostEqual((W3.eth.getBalance(owner) - pre_balance) / UNIT, total_proceeds / UNIT)


    def test_priceIsStale(self):
        oracle = self.oracle()
        owner = self.owner()
        stale_period = self.stalePeriod()

        mine_tx(self.updatePrice(oracle, UNIT))
        # Price is not stale immediately following an update.
        self.assertFalse(self.priceIsStale())

        # Price is not stale after part of the period has elapsed.
        fast_forward(seconds=stale_period // 2)
        self.assertFalse(self.priceIsStale())

        # Price is not stale right up to just before the period has elapsed.
        fast_forward(seconds=stale_period // 2 - 10)
        self.assertFalse(self.priceIsStale())

        # Price becomes stale immediately after the period has elapsed.
        fast_forward(seconds=11)
        self.assertTrue(self.priceIsStale())

        # Price stays stale for ages.
        fast_forward(seconds=100 * stale_period)
        self.assertTrue(self.priceIsStale())

        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertFalse(self.priceIsStale()) 

        # Lengthening stale periods should not trigger staleness.
        mine_tx(self.setStalePeriod(owner, 2 * stale_period))
        self.assertFalse(self.priceIsStale()) 

        # Shortening them to longer than the current elapsed period should not trigger staleness.
        mine_tx(self.setStalePeriod(owner, stale_period))
        self.assertFalse(self.priceIsStale())

        # Shortening to shorter than the current elapsed period should trigger staleness.
        fast_forward(seconds= 3 * stale_period // 4)
        mine_tx(self.setStalePeriod(owner, stale_period // 2))
        self.assertTrue(self.priceIsStale())

        # Yet if we are able to update the stale period while the price is stale,
        # we should be able to turn off staleness by extending the period.
        # It's an interesting question of trust as to whether we should be able to do this, say if we
        # do not have access to the oracle to send a price update. But as an owner, we could just
        # reset the oracle address anyway, so we allow this.
        mine_tx(self.setStalePeriod(owner, stale_period))
        self.assertFalse(self.priceIsStale())

    def test_staleness(self):
        # Assert all those calls work when not stale.
        # Assert things that should work when stale do work.
        owner = self.owner()
        oracle = self.oracle()

        pce = self.purchaseCostEther(UNIT)
        mine_tx(self.updatePrice(oracle, UNIT))
        mine_tx(self.issue(owner, 2 * UNIT, 5 * UNIT))
        mine_tx(self.buy(owner, UNIT, pce))


        fast_forward(seconds=10*self.stalePeriod())
        self.assertTrue(self.priceIsStale())

        # These calls should work.
        self.nominPool()
        self.poolFeeRate()
        self.liquidationPeriod()
        self.liquidationTimestamp()
        self.etherPrice()
        self.lastPriceUpdate()
        self.stalePeriod()
        self.isFrozen(self.nomin.address)
        mine_tx(self.setOracle(owner, oracle))
        mine_tx(self.setCourt(owner, self.court()))
        mine_tx(self.setBeneficiary(owner, self.beneficiary()))
        mine_tx(self.setPoolFeeRate(owner, self.poolFeeRate()))
        mine_tx(self.setStalePeriod(owner, self.stalePeriod()))
        self.poolFeeIncurred(UNIT)
        self.purchaseCostFiat(UNIT)
        self.saleProceedsFiat(UNIT)
        self.priceIsStale()
        self.isLiquidating()
        self.assertFalse(self.isFrozen(MASTER))
        mine_tx(self.transfer(MASTER, MASTER, 0))
        mine_tx(self.transferFrom(MASTER, MASTER, MASTER, 0))

        mine_tx(self.burn(owner, UNIT))

        assertReverts(self, self.fiatValue, [UNIT])
        assertReverts(self, self.fiatBalance, [])
        assertReverts(self, self.etherValue, [UNIT])
        assertReverts(self, self.collateralisationRatio, [])
        assertReverts(self, self.purchaseCostEther, [UNIT])
        assertReverts(self, self.saleProceedsEther, [UNIT])
        assertReverts(self, self.issue, [owner, UNIT, 5 * UNIT])
        assertReverts(self, self.buy, [owner, UNIT, pce])
        assertReverts(self, self.sell, [owner, UNIT])


        # Confirm that sell works regardless of staleness when in liquidation

        # Finally that updating the price gets us out of liquidation
        mine_tx(self.updatePrice(oracle, UNIT))
        self.assertFalse(self.priceIsStale())

    def test_transfer(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[1]

        mine_tx(self.updatePrice(oracle, UNIT))
        mine_tx(self.issue(owner, 10 * UNIT, 20 * ETHER))
        ethercost = self.purchaseCostEther(10 * UNIT)
        mine_tx(self.buy(owner, 10 * UNIT, ethercost))

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        mine_tx(self.transfer(owner, target, 5 * UNIT))
        remainder = 10 * UNIT - self.transferPlusFee(5 * UNIT)
        self.assertEqual(self.balanceOf(owner), remainder)
        self.assertEqual(self.balanceOf(target), 5 * UNIT)

        mine_tx(self.debugFreezeAccount(owner, target))

        assertReverts(self, self.transfer, [owner, target, UNIT])
        assertReverts(self, self.transfer, [target, owner, UNIT])

        mine_tx(self.unfreezeAccount(owner, target))

        qty = (5 * UNIT * UNIT) // self.transferPlusFee(UNIT) + 1
        mine_tx(self.transfer(target, owner, qty))

        self.assertEqual(self.balanceOf(owner), remainder + qty)
        self.assertEqual(self.balanceOf(target), 0)

    def test_transferFrom(self):
        owner = self.owner()
        oracle = self.oracle()
        target = W3.eth.accounts[1]
        proxy = W3.eth.accounts[2]

        # Unauthorized transfers should not work
        assertReverts(self, self.transferFrom, [proxy, owner, target, UNIT])

        # Neither should transfers that are too large for the allowance.
        mine_tx(self.approve(owner, proxy, UNIT))
        assertReverts(self, self.transferFrom, [proxy, owner, target, 2 * UNIT])

        mine_tx(self.approve(owner, proxy, 10000 * UNIT))

        mine_tx(self.updatePrice(oracle, UNIT))
        mine_tx(self.issue(owner, 10 * UNIT, 20 * ETHER))
        ethercost = self.purchaseCostEther(10 * UNIT)
        mine_tx(self.buy(owner, 10 * UNIT, ethercost))

        self.assertEqual(self.balanceOf(owner), 10 * UNIT)
        self.assertEqual(self.balanceOf(target), 0)

        mine_tx(self.transferFrom(proxy, owner, target, 5 * UNIT))
        remainder = 10 * UNIT - self.transferPlusFee(5 * UNIT)
        self.assertEqual(self.balanceOf(owner), remainder)
        self.assertEqual(self.balanceOf(target), 5 * UNIT)

        mine_tx(self.debugFreezeAccount(owner, target))

        assertReverts(self, self.transferFrom, [proxy, owner, target, UNIT])
        assertReverts(self, self.transferFrom, [proxy, target, owner, UNIT])

        mine_tx(self.unfreezeAccount(owner, target))

        qty = (5 * UNIT * UNIT) // self.transferPlusFee(UNIT) + 1
        mine_tx(self.transfer(target, owner, qty))

        self.assertEqual(self.balanceOf(owner), remainder + qty)
        self.assertEqual(self.balanceOf(target), 0)

    def test_issue(self):
        owner = self.owner()
        oracle = self.oracle()

        # Only the contract owner should be able to issue new nomins.
        mine_tx(self.updatePrice(oracle, UNIT))
        assertReverts(self, self.issue, [W3.eth.accounts[4], UNIT, 2 * ETHER])

        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.nominPool(), 0)

        # Revert if less than 2x collateral is provided 
        assertReverts(self, self.issue, [owner, UNIT, 2 * ETHER - 1])

        # Issue a nomin into the pool
        mine_tx(self.issue(owner, UNIT, 2 * ETHER))
        self.assertEqual(self.totalSupply(), UNIT)
        self.assertEqual(self.nominPool(), UNIT)
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 2 * ETHER)

        # Issuing more nomins should stack with existing supply
        mine_tx(self.issue(owner, UNIT, 2 * ETHER))
        self.assertEqual(self.totalSupply(), 2 * UNIT)
        self.assertEqual(self.nominPool(), 2 * UNIT)
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 4 * ETHER)

        # Issue more into the pool for free if price goes up
        self.updatePrice(oracle, 2 * UNIT)
        self.assertFalse(self.isLiquidating())
        assertReverts(self, self.issue, [owner, 2 * UNIT + 1, 0])
        mine_tx(self.issue(owner, 2 * UNIT, 0))
        self.assertEqual(self.totalSupply(), 4 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT)
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 4 * ETHER)

        # provide more than 2x collateral for new issuance if price drops
        self.updatePrice(oracle, UNIT)
        self.assertFalse(self.isLiquidating())
        assertReverts(self, self.issue, [owner, UNIT, 2 * ETHER])
        assertReverts(self, self.issue, [owner, UNIT, 6 * ETHER - 1])
        mine_tx(self.issue(owner, UNIT, 6 * ETHER))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 10 * ETHER)

    def test_burn(self):
        owner = self.owner()
        oracle = self.oracle()

        # issue some nomins to be burned
        self.updatePrice(oracle, UNIT)
        mine_tx(self.issue(owner, 10 * UNIT, 20 * ETHER))

        # Only the contract owner should be able to burn nomins.
        assertReverts(self, self.burn, [W3.eth.accounts[4], UNIT])

        # It should not be possible to burn more nomins than are in the pool.
        assertReverts(self, self.burn, [owner, 11 * UNIT])

        # Burn part of the pool
        self.assertEqual(self.totalSupply(), 10 * UNIT)
        self.assertEqual(self.nominPool(), 10 * UNIT)
        mine_tx(self.burn(owner, UNIT))
        self.assertEqual(self.totalSupply(), 9 * UNIT)
        self.assertEqual(self.nominPool(), 9 * UNIT)

        # Burn the remainder of the pool
        mine_tx(self.burn(owner, self.nominPool()))
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.nominPool(), 0)

    def test_buy(self):
        self.updatePrice(self.oracle(), UNIT)
        buyer = W3.eth.accounts[4]

        # Should not be possible to buy when there's no supply
        cost = self.purchaseCostEther(UNIT)
        assertReverts(self, self.buy, [buyer, UNIT, cost])

        # issue some nomins to be burned
        mine_tx(self.issue(self.owner(), 5 * UNIT, 10 * ETHER))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)

        # Should not be able to purchase with the wrong quantity of ether.
        assertReverts(self, self.buy, [buyer, UNIT, cost + 1])
        assertReverts(self, self.buy, [buyer, UNIT, cost - 1])

        self.assertEqual(self.balanceOf(buyer), 0)
        mine_tx(self.buy(buyer, UNIT, cost))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT)
        self.assertEqual(self.balanceOf(buyer), UNIT)

        # It should not be possible to buy fewer nomins than the purchase minimum
        purchaseMin = UNIT // 100
        assertReverts(self, self.buy, [buyer, purchaseMin - 1, self.purchaseCostEther(purchaseMin - 1)])

        # But it should be possible to buy exactly that quantity
        mine_tx(self.buy(buyer, purchaseMin, self.purchaseCostEther(purchaseMin)))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 4 * UNIT - (UNIT // 100))
        self.assertEqual(self.balanceOf(buyer), UNIT + UNIT // 100)

        # It should not be possible to buy more tokens than are in the pool
        total = self.nominPool()
        assertReverts(self, self.buy, [buyer, total + 1, self.purchaseCostEther(total + 1)])

        mine_tx(self.buy(buyer, total, self.purchaseCostEther(total)))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 0)
        self.assertEqual(self.balanceOf(buyer), 5 * UNIT)

        # Should not be possible to buy when there's nothing in the pool
        assertReverts(self, self.buy, [buyer, UNIT, self.purchaseCostEther(UNIT)])

    def test_sell(self):
        # Prepare a seller who owns some nomins.
        self.updatePrice(self.oracle(), UNIT)
        seller = W3.eth.accounts[4]
        mine_tx(self.issue(self.owner(), 5 * UNIT, 10 * ETHER))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 5 * UNIT)
        self.assertEqual(self.balanceOf(seller), 0)

        # It should not be possible to sell nomins if you have none.
        assertReverts(self, self.sell, [seller, UNIT])

        mine_tx(self.buy(seller, 5 * UNIT, self.purchaseCostEther(5 * UNIT)))
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 0)
        self.assertEqual(self.balanceOf(seller), 5 * UNIT)

        # It should not be possible to sell more nomins than you possess.
        assertReverts(self, self.sell, [seller, 5 * UNIT + 1])

        # Selling nomins should yield back the right amount of ether.
        pre_balance = W3.eth.getBalance(seller)
        mine_tx(self.sell(seller, 2 * UNIT))
        # This assertAlmostEqual hack is only because ganache refuses to be sensible about gas prices.
        # The receipt refuses to include the gas price and the values appear are inconsistent anyway.
        self.assertAlmostEqual(self.saleProceedsEther(2 * UNIT) / UNIT, (W3.eth.getBalance(seller) - pre_balance) / UNIT)
        self.assertEqual(self.totalSupply(), 5 * UNIT)
        self.assertEqual(self.nominPool(), 2 * UNIT)
        self.assertEqual(self.balanceOf(seller), 3 * UNIT)

    def test_isLiquidating(self):
        pass

    def test_forceLiquidation(self):
        # non-owners should not be able to force liquidation.
        assertReverts(self, self.forceLiquidation, [W3.eth.accounts[5]])

        owner = self.owner()
        self.assertFalse(self.isLiquidating())
        mine_tx(self.forceLiquidation(owner))
        self.assertTrue(self.isLiquidating())

        # This call should not work if liquidation has begun.
        assertReverts(self, self.forceLiquidation, [owner])

    def test_liquidation(self):
        pass

    def test_autoLiquidation(self):
        pass

    def test_extendLiquidationPeriod(self):
        pass

    def test_terminateLiquidation(self):
        pass

    def test_selfDestruct(self):
        pass

    def test_confiscateBalance(self):
        owner = self.owner()
        target = W3.eth.accounts[2]

        mine_tx(self.setCourt(owner, self.fake_court.address))

        # The target must have some nomins. We will issue 10 for him to buy
        mine_tx(self.updatePrice(self.oracle(), UNIT))
        mine_tx(self.issue(owner, 10 * UNIT, 20 * ETHER))
        ethercost = self.purchaseCostEther(10 * UNIT)
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': target, 'value': ethercost}))
        mine_tx(self.buy(target, 10 * UNIT, ethercost))
        self.assertEqual(self.balanceOf(target), 10 * UNIT)

        # Attempt to confiscate even though the conditions are not met.
        mine_tx(self.fake_court.setConfirming(owner, target, False))
        mine_tx(self.fake_court.setVotePasses(owner, target, False))
        assertReverts(self, self.fake_court.confiscateBalance, [owner, target])

        mine_tx(self.fake_court.setConfirming(owner, target, True))
        mine_tx(self.fake_court.setVotePasses(owner, target, False))
        assertReverts(self, self.fake_court.confiscateBalance, [owner, target])

        mine_tx(self.fake_court.setConfirming(owner, target, False))
        mine_tx(self.fake_court.setVotePasses(owner, target, True))
        assertReverts(self, self.fake_court.confiscateBalance, [owner, target])

        # Set up the target balance to be confiscatable.
        mine_tx(self.fake_court.setConfirming(owner, target, True))
        mine_tx(self.fake_court.setVotePasses(owner, target, True))

        # Only the court should be able to confiscate balances.
        assertReverts(self, self.confiscateBalance, [owner, target])

        # Actually confiscate the balance.
        pre_feePool = self.feePool()
        pre_balance = self.balanceOf(target)
        mine_tx(self.fake_court.confiscateBalance(owner, target))
        self.assertEqual(self.balanceOf(target), 0)
        self.assertEqual(self.feePool(), pre_feePool + pre_balance)
        self.assertTrue(self.isFrozen(target))

    def test_unfreezeAccount(self):
        owner = self.owner()
        target = W3.eth.accounts[1]

        self.assertFalse(self.isFrozen(target))
        # TODO: Unfreezing a not yet frozen account should not emit an unfreeze event.
        # mine_tx(self.unfreezeAccount(owner, target))

        mine_tx(self.debugFreezeAccount(owner, target))
        self.assertTrue(self.isFrozen(target))

        # Only the owner should be able to unfreeze an account.
        assertReverts(self, self.unfreezeAccount, [target, target])

        # Unfreeze
        mine_tx(self.unfreezeAccount(owner, target))
        self.assertFalse(self.isFrozen(target))


    def test_fallback(self):
        # Fallback function should be payable.
        owner = self.owner()
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        mine_tx(self.debugEmptyFeePool(owner))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 0)
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), ETHER)

    def test_scenario(self):
        pass

    # Events

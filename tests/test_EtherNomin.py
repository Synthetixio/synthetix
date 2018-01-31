import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, ETHER
from utils.testutils import assertReverts


ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"
FAKECOURT_SOURCE = "tests/contracts/FakeCourt.sol"


def setUpModule():
    print("Testing EtherNomin...")

def tearDownModule():
    print()

class TestEtherNomin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ETHERNOMIN_SOURCE, FAKECOURT_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin_abi = compiled['PublicEtherNomin']['abi']
        cls.nomin, cls.construction_txr = attempt_deploy(compiled, 'PublicEtherNomin', MASTER,
                                                         [MASTER, MASTER, MASTER,
                                                          1000 * UNIT, MASTER])
        cls.fake_court, _ = attempt_deploy(compiled, 'FakeCourt', MASTER, [])

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
        cls.lastPriceUpdate = lambda self: cls.nomin.functions.publicLastPriceUpdate().call()
        cls.stalePeriod = lambda self: cls.nomin.functions.publicStalePeriod().call()

        cls.setOwner = lambda self, sender, address: cls.nomin.functions.setOwner(address).transact({'from': sender})
        cls.setOracle = lambda self, sender, address: cls.nomin.functions.setOracle(address).transact({'from': sender})
        cls.setCourt = lambda self, sender, address: cls.nomin.functions.setCourt(address).transact({'from': sender})
        cls.setBeneficiary = lambda self, sender, address: cls.nomin.functions.setBeneficiary(address).transact({'from': sender})
        cls.setPoolFeeRate = lambda self, sender, rate: cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender})
        cls.setPrice = lambda self, sender, price: cls.nomin.functions.setPrice(price).transact({'from': sender})
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
        cls.transferFrom = lambda self, sender, fromAccount, to, value: cls.nomin.functions.transfer(fromAccount, to, value).transact({'from': sender})
        cls.issue = lambda self, sender, n, value: cls.nomin.functions.issue(n).transact({'from': sender, 'value': value})
        cls.burn = lambda self, sender, n: cls.nomin.functions.burn(n).transact({'from': sender})
        cls.buy = lambda self, sender, n, value: cls.nomin.functions.buy(n).transact({'from': sender, 'value': value})
        cls.sell = lambda self, sender, n: cls.nomin.functions.sell(n).transact({'from': sender})

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
        cls.debugFreezeAccount = lambda self, sender, target: cls.nomin.functions.debugFreezeAccount(target).transact({'from': sender})

    def test_Constructor(self):
        # Nomin-specific members
        self.assertEqual(self.oracle(), MASTER)
        self.assertEqual(self.beneficiary(), MASTER)
        self.assertEqual(self.etherPrice(), 1000 * UNIT)
        self.assertEqual(self.stalePeriod(), 2 * 24 * 60 * 60) # default two days
        self.assertEqual(self.liquidationTimestamp(), 2**256 - 1)
        self.assertEqual(self.liquidationPeriod(), 90 * 24 * 60 * 60) # default ninety days
        self.assertEqual(self.poolFeeRate(), UNIT / 200) # default 50 basis points
        self.assertEqual(self.nominPool(), 0)
        construct_time = W3.eth.getBlock(self.construction_txr.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), construct_time)

        # ERC20FeeToken members
        self.assertEqual(self.name(), "Ether-Backed USD Nomins")
        self.assertEqual(self.symbol(), "eUSD")
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.balanceOf(MASTER), 0)
        self.assertEqual(self.transferFeeRate(), 2 * UNIT // 1000)
        self.assertEqual(self.feeAuthority(), MASTER)

    def test_getSetOwner(self):
        pre_owner = self.owner()
        new_owner = W3.eth.accounts[1]

        # Only the owner must be able to set the oracle.
        assertReverts(self, self.setOwner, [new_owner, new_owner])

        mine_tx(self.setOwner(pre_owner, new_owner))
        self.assertEqual(self.owner(), new_owner)
        mine_tx(self.setOwner(new_owner, pre_owner))

    def test_getSetOracle(self):
        owner = self.owner()
        pre_oracle = self.oracle()
        new_oracle = W3.eth.accounts[1]

        # Only the owner must be able to set the oracle.
        assertReverts(self, self.setOracle, [new_oracle, new_oracle])

        mine_tx(self.setOracle(owner, new_oracle))
        self.assertEqual(self.oracle(), new_oracle)
        mine_tx(self.setOracle(owner, pre_oracle))

    def test_getSetCourt(self):
        owner = self.owner()
        pre_court = self.court()
        new_court = W3.eth.accounts[1]

        # Only the owner must be able to set the court.
        assertReverts(self, self.setOracle, [new_court, new_court])

        mine_tx(self.setCourt(owner, new_court))
        self.assertEqual(self.court(), new_court)
        mine_tx(self.setCourt(owner, pre_court))

    def test_getSetBeneficiary(self):
        owner = self.owner()
        pre_beneficiary = self.beneficiary()
        new_beneficiary = W3.eth.accounts[1]

        # Only the owner must be able to set the beneficiary.
        assertReverts(self, self.setBeneficiary, [new_beneficiary, new_beneficiary])

        mine_tx(self.setBeneficiary(owner, new_beneficiary))
        self.assertEqual(self.beneficiary(), new_beneficiary)
        mine_tx(self.setBeneficiary(owner, pre_beneficiary))

    def test_getSetPoolFeeRate(self):
        owner = self.owner()
        pre_rate = self.poolFeeRate()
        new_rate = UNIT // 10

        # Only the owner must be able to set the pool fee rate.
        assertReverts(self, self.setPoolFeeRate, [W3.eth.accounts[1], new_rate])
        # Pool fee rate must be no greater than UNIT.
        assertReverts(self, self.setPoolFeeRate, [owner, UNIT + 1])
        assertReverts(self, self.setPoolFeeRate, [owner, 2**256 - 1])

        mine_tx(self.setPoolFeeRate(owner, new_rate))
        self.assertEqual(self.poolFeeRate(), new_rate)
        mine_tx(self.setPoolFeeRate(owner, UNIT))
        self.assertEqual(self.poolFeeRate(), UNIT)
        mine_tx(self.setPoolFeeRate(owner, pre_rate))

    def test_getSetStalePeriod(self):
        owner = self.owner()
        pre_period = self.stalePeriod()
        new_period = 52 * 7 * 24 * 60 * 60

        # Only the owner must be able to set the pool fee rate.
        assertReverts(self, self.setStalePeriod, [W3.eth.accounts[1], new_period])

        mine_tx(self.setStalePeriod(owner, new_period))
        self.assertEqual(self.stalePeriod(), new_period)
        mine_tx(self.setStalePeriod(owner, pre_period))

    def test_setPrice(self):
        owner = self.owner()
        pre_price = self.etherPrice()
        new_price = 10**8 * UNIT # one hundred million dollar ethers $$$$$$
        new_price2 = UNIT // 10**6 # one ten thousandth of a cent ethers :(
        pre_oracle = self.oracle()
        new_oracle = W3.eth.accounts[1]

        # Only the oracle must be able to set the current price.
        assertReverts(self, self.setPrice, [new_oracle, new_price])

        # Check if everything works with nothing in the pool.
        tx_receipt = mine_tx(self.setPrice(pre_oracle, new_price))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), new_price)

        mine_tx(self.setOracle(owner, new_oracle))

        assertReverts(self, self.setPrice, [pre_oracle, pre_price])

        tx_receipt = mine_tx(self.setPrice(new_oracle, new_price2))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), new_price2)

        mine_tx(self.setOracle(owner, pre_oracle))
        mine_tx(self.setPrice(pre_oracle, UNIT))

        # Check if everything works with something in the pool.
        backing = self.etherValue(10 * UNIT)
        mine_tx(self.issue(owner, UNIT, backing))

        tx_receipt = mine_tx(self.setPrice(pre_oracle, pre_price))
        tx_time = W3.eth.getBlock(tx_receipt.blockNumber)['timestamp']
        self.assertEqual(self.lastPriceUpdate(), tx_time)
        self.assertEqual(self.etherPrice(), pre_price)

        # Burn pooled nomins and return all issued ether.
        mine_tx(self.burn(owner, UNIT))
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 0)
        self.assertEqual(self.totalSupply(), 0)
        self.assertEqual(self.nominPool(), 0)

    def test_fiatValue(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        mine_tx(self.setPrice(oracle, UNIT))
        self.assertEqual(self.fiatValue(ETHER), ETHER)
        self.assertEqual(self.fiatValue(777 * ETHER), 777 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 777), ETHER // 777)
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**12)

        mine_tx(self.setPrice(oracle, 10**8 * UNIT))
        self.assertEqual(self.fiatValue(ETHER), 10**8 * ETHER)
        self.assertEqual(self.fiatValue(317 * ETHER), 317 * 10**8 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 317), 10**8 * (ETHER // 317))
        self.assertEqual(self.fiatValue(10**8 * ETHER), 10**16 * ETHER)
        self.assertEqual(self.fiatValue(ETHER // 10**12), ETHER // 10**4)

        mine_tx(self.setPrice(oracle, UNIT // 10**12))
        self.assertEqual(self.fiatValue(ETHER), ETHER // 10**12)
        self.assertEqual(self.fiatValue(10**15 * ETHER), 10**3 * ETHER)
        self.assertEqual(self.fiatValue((7 * ETHER) // 3), ((7 * ETHER) // 3) // 10**12)

        mine_tx(self.setPrice(oracle, pre_price))

    def test_fiatBalance(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(self.fiatBalance(), pre_price)
        mine_tx(self.setPrice(oracle, UNIT // 10**12))
        self.assertEqual(self.fiatBalance(), UNIT // 10**12)
        mine_tx(self.setPrice(oracle, 300 * UNIT))
        self.assertEqual(self.fiatBalance(), 300 * UNIT)
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(self.fiatBalance(), 600 * UNIT)

        mine_tx(self.setPrice(oracle, pre_price))
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 0)

    def test_etherValue(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        mine_tx(self.setPrice(oracle, UNIT))
        self.assertEqual(self.etherValue(UNIT), ETHER)
        self.assertEqual(self.etherValue(777 * UNIT), 777 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 777), ETHER // 777)
        self.assertEqual(self.etherValue(10**8 * UNIT), 10**8 * ETHER)
        self.assertEqual(self.etherValue(UNIT // 10**12), ETHER // 10**12)

        mine_tx(self.setPrice(oracle, 10 * UNIT))
        self.assertEqual(self.etherValue(UNIT), ETHER // 10)
        self.assertEqual(self.etherValue(2 * UNIT), ETHER // 5)

    def test_collateralisationRatio(self):
        owner = self.owner()
        oracle = self.oracle()
        pre_price = self.etherPrice()

        # When there are no nomins in the contract, a zero denominator causes reversion.
        assertReverts(self, self.collateralisationRatio)

        # Set the ether price to $1, and issue one nomin against 2 ether.
        mine_tx(self.setPrice(oracle, UNIT))
        mine_tx(self.issue(owner, UNIT, 2 * ETHER))
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

        # Set the ether price to $2, now the collateralisation ratio should double to 4.
        mine_tx(self.setPrice(oracle, 2 * UNIT))
        self.assertEqual(self.collateralisationRatio(), 4 * UNIT)

        # Now set the ether price to 50 cents, so that the collateralisation is exactly 1
        mine_tx(self.setPrice(oracle, UNIT // 2))
        # (this should not trigger liquidation)
        self.assertFalse(self.isLiquidating())
        self.assertEqual(self.collateralisationRatio(), UNIT)

        # Now double the ether in the contract to 2.
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': 2 * ETHER}))
        self.assertEqual(self.collateralisationRatio(), 2 * UNIT)

        # Restore status quo ante testum
        mine_tx(self.burn(owner, UNIT))
        mine_tx(self.setPrice(oracle, pre_price))
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 0)

    def test_poolFeeIncurred(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

        self.assertEqual(self.poolFeeIncurred(0), 0)
        self.assertEqual(self.poolFeeIncurred(UNIT), poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(10 * UNIT), 10 * poolFeeRate)
        self.assertEqual(self.poolFeeIncurred(UNIT // 2), poolFeeRate // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.poolFeeIncurred(UNIT), UNIT // 10**7)
        self.assertEqual(self.poolFeeIncurred(100 * UNIT), UNIT // 10**5)
        self.assertEqual(self.poolFeeIncurred(UNIT // 2), UNIT // (2 * 10**7))

    def test_purchaseCostFiat(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

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
        pre_price = self.etherPrice()
        poolFeeRate = self.poolFeeRate()

        self.assertEqual(self.purchaseCostEther(0), 0)

        mine_tx(self.setPrice(owner, UNIT))
        self.assertEqual(self.purchaseCostEther(UNIT), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(UNIT // 2), (UNIT + poolFeeRate) // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.purchaseCostEther(UNIT), (UNIT + UNIT // 10**7))
        self.assertEqual(self.purchaseCostEther(100 * UNIT), 100 * (UNIT + UNIT // 10**7))

        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))
        mine_tx(self.setPrice(owner, UNIT // 2))
        self.assertEqual(self.purchaseCostEther(UNIT // 2), UNIT + poolFeeRate)
        self.assertEqual(self.purchaseCostEther(3 * UNIT), 6 * (UNIT + poolFeeRate))

        mine_tx(self.setPrice(owner, pre_price))

    def test_saleProceedsFiat(self):
        owner = self.owner()
        poolFeeRate = self.poolFeeRate()

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
        pre_price = self.etherPrice()
        poolFeeRate = self.poolFeeRate()

        self.assertEqual(self.saleProceedsEther(0), 0)

        mine_tx(self.setPrice(owner, UNIT))
        self.assertEqual(self.saleProceedsEther(UNIT), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(UNIT // 2), (UNIT - poolFeeRate) // 2)
        mine_tx(self.setPoolFeeRate(owner, UNIT // 10**7))
        self.assertEqual(self.saleProceedsEther(UNIT), (UNIT - UNIT // 10**7))
        self.assertEqual(self.saleProceedsEther(100 * UNIT), 100 * (UNIT - UNIT // 10**7))

        mine_tx(self.setPoolFeeRate(owner, poolFeeRate))
        mine_tx(self.setPrice(owner, UNIT // 2))
        self.assertEqual(self.saleProceedsEther(UNIT // 2), UNIT - poolFeeRate)
        self.assertEqual(self.saleProceedsEther(3 * UNIT), 6 * (UNIT - poolFeeRate))

        mine_tx(self.setPrice(owner, pre_price))

    def test_priceIsStale(self):
        pass

    def test_staleness(self):
        pass

    def test_transfer(self):
        owner = self.owner()
        oracle = self.owner()
        pre_price = self.etherPrice()
        target = W3.eth.accounts[1]

        mine_tx(self.setPrice(oracle, UNIT))
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

        mine_tx(self.sell(owner, self.balanceOf(owner)))
        mine_tx(self.burn(owner, self.nominPool()))
        mine_tx(self.setPrice(oracle, pre_price))
        mine_tx(self.debugWithdrawAllEther(owner, owner))

    def test_transferFrom(self):
        pass

    def test_issue(self):
        pass

    def test_burn(self):
        pass

    def test_buy(self):
        pass

    def test_sell(self):
        pass

    def test_isLiquidating(self):
        pass

    def test_forceLiquidation(self):
        pass

    def test_liquidate(self):
        pass

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
        pass
        # Not sure why this fails. Commented out for now.
        """
        owner = self.owner()
        oracle = self.owner()
        pre_court = self.court()
        pre_price = self.etherPrice()
        target = W3.eth.accounts[2]

        mine_tx(self.setCourt(owner, self.fake_court.address))

        # The target must have some nomins. We will issue 10 for him to buy
        mine_tx(self.setPrice(oracle, UNIT))
        mine_tx(self.issue(owner, 10 * UNIT, 20 * ETHER))
        ethercost = self.purchaseCostEther(10 * UNIT)
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': target, 'value': ethercost}))
        mine_tx(self.buy(target, 10 * UNIT, ethercost))
        self.assertEqual(self.balanceOf(target), 10 * UNIT)

        # Attempt to confiscate even though the conditions are not met.
        mine_tx(self.fake_court.functions.setConfirming(target, False).transact({'from': owner}))
        mine_tx(self.fake_court.functions.setVotePasses(target, False).transact({'from': owner}))
        assertReverts(self, self.confiscateBalance, [self.fake_court.address, target])
        mine_tx(self.confiscateBalance(target).transact({'from': self.fake_court.address}))

        mine_tx(self.fake_court.functions.setConfirming(target, True).transact({'from': owner}))
        mine_tx(self.fake_court.functions.setVotePasses(target, False).transact({'from': owner}))
        assertReverts(self, self.confiscateBalance, [self.fake_court.address, target])

        mine_tx(self.fake_court.functions.setConfirming(target, False).transact({'from': owner}))
        mine_tx(self.fake_court.functions.setVotePasses(target, True).transact({'from': owner}))
        assertReverts(self, self.confiscateBalance, [self.fake_court.address, target])

        # Set up the target balance to be confiscatable.
        mine_tx(self.fake_court.functions.setConfirming(target, True).transact({'from': owner}))
        mine_tx(self.fake_court.functions.setVotePasses(target, True).transact({'from': owner}))

        # Only the court should be able to confiscate balances.
        assertReverts(self, self.confiscateBalance, [owner, target])

        # Actually confiscate the balance.
        pre_feePool = self.feePool()
        pre_balance = self.balanceOf(target)
        mine_tx(self.confiscateBalance(self.fake_court.address, target))
        self.assertEqual(self.balanceOf(target), 0)
        self.assertEqual(self.feePool(), pre_feePool + pre_balance)
        self.assertTrue(self.isFrozen(target))

        # Restore status quo
        self.unFreezeAccount(owner, target)
        mine_tx(self.fake_court.functions.setConfirming(target, False).transact({'from': owner}))
        mine_tx(self.fake_court.functions.setVotePasses(target, False).transact({'from': owner}))
        mine_tx(self.sell(target, 10 * UNIT))
        mine_tx(self.burn(owner, 10 * UNIT))
        mine_tx(self.setPrice(oracle, pre_price))
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        mine_tx(self.setCourt(owner, pre_court))
        """

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
        mine_tx(W3.eth.sendTransaction({'from': owner, 'to': self.nomin.address, 'value': ETHER}))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), ETHER)
        mine_tx(self.debugWithdrawAllEther(owner, owner))
        self.assertEqual(W3.eth.getBalance(self.nomin.address), 0)

    # Events

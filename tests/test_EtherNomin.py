import unittest
from deploy import UNIT, MASTER
from deployutils import W3, compile_contracts, attempt_deploy, mine_tx
from testutils import assertCallReverts, assertTransactionReverts

ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"

def setUpModule():
    print("Testing EtherNomin...")

def tearDownModule():
    print()

class TestEtherNomin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([ETHERNOMIN_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin = attempt_deploy(compiled, 'PublicEtherNomin', MASTER,
                                   [MASTER, MASTER, MASTER,
                                    1000 * UNIT, MASTER])

        cls.oracle = lambda self: cls.nomin.functions.oracle()
        cls.court = lambda self: cls.nomin.functions.court()
        cls.beneficiary = lambda self: cls.nomin.functions.beneficiary()
        cls.nominPool = lambda self: cls.nomin.functions.nominPool()
        cls.poolFeeRate = lambda self: cls.nomin.functions.poolFeeRate()
        cls.liquidationPeriod = lambda self: cls.nomin.functions.liquidationPeriod()
        cls.liquidationTimestamp = lambda self: cls.nomin.functions.liquidationTimestamp()
        cls.etherPrice = lambda self: cls.nomin.functions.etherPrice()
        cls.isFrozen = lambda self, address: cls.nomin.functions.isFrozen(address)
        cls.lastPriceUpdate = lambda self: cls.nomin.functions.publicLastPriceUpdate()
        cls.stalePeriod = lambda self: cls.nomin.functions.publicStalePeriod()

        cls.setOracle = lambda self, address: cls.nomin.functions.setOracle(address)
        cls.setCourt = lambda self, address: cls.nomin.functions.setCourt(address)
        cls.setBeneficiary = lambda self, address: cls.nomin.functions.setBeneficiary(address)
        cls.setPoolFeeRate = lambda self, rate: cls.nomin.functions.setPoolFeeRate(rate)
        cls.setPrice = lambda self, price: cls.nomin.functions.setPrice(price)
        cls.setStalePeriod = lambda self, period: cls.nomin.functions.setStalePeriod(period)

        cls.fiatValue = lambda self, eth: cls.nomin.functions.fiatValue(eth)
        cls.fiatBalance = lambda self: cls.nomin.functions.fiatBalance()
        cls.collateralisationRatio = lambda self: cls.nomin.functions.collateralisationRatio()
        cls.etherValue = lambda self, fiat: cls.nomin.functions.etherValue(fiat)
        cls.poolFeeIncurred = lambda self, n: cls.nomin.functions.poolFeeIncurred(n)
        cls.purchaseCostFiat = lambda self, n: cls.nomin.functions.purchaseCostFiat(n)
        cls.purchaseCostEther = lambda self, n: cls.nomin.functions.purchaseCostEther(n)
        cls.saleProceedsFiat = lambda self, n: cls.nomin.functions.saleProceedsFiat(n)
        cls.saleProceedsEther = lambda self, n: cls.nomin.functions.saleProceedsEther(n)
        cls.priceIsStale = lambda self: cls.nomin.functions.priceIsStale()
        cls.isLiquidating = lambda self: cls.nomin.functions.isLiquidating()

        cls.transfer = lambda self, to, value: cls.nomin.functions.transfer(to, value)
        cls.transferFrom = lambda self, fromAccount, to, value: cls.nomin.functions.transfer(fromAccount, to, value)
        cls.issue = lambda self, n: cls.nomin.functions.issue(n)
        cls.burn = lambda self, n: cls.nomin.functions.burn(n)
        cls.buy = lambda self, n: cls.nomin.functions.buy(n)
        cls.sell = lambda self, n: cls.nomin.functions.sell(n)

        cls.forceLiquidation = lambda self: cls.nomin.functions.forceLiquidation()
        cls.liquidate = lambda self: cls.nomin.functions.liquidate()
        cls.extendLiquidationPeriod = lambda self, extension: cls.nomin.functions.extendLiquidationPeriod(extension)
        cls.terminateLiquidation = lambda self: cls.nomin.functions.terminateLiquidation()
        cls.selfDestruct = lambda self: cls.nomin.functions.selfDestruct()

        cls.confiscateBalance = lambda self, target: cls.nomin.functions.confiscateBalance(target)
        cls.unFreezeAccount = lambda self, target: cls.nomin.functions.unFreezeAccount(target)

        cls.name = lambda self: cls.nomin.functions.name()
        cls.symbol = lambda self: cls.nomin.functions.symbol()
        cls.totalSupply = lambda self: cls.nomin.functions.totalSupply()
        cls.balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account)
        cls.transferFeeRate = lambda self: cls.nomin.functions.transferFeeRate()
        cls.feePool = lambda self: cls.nomin.functions.feePool()
        cls.feeAuthority = lambda self: cls.nomin.functions.feeAuthority()


    def test_Constructor(self):
        # Nomin-specific members
        self.assertEqual(self.oracle().call(), MASTER)
        self.assertEqual(self.beneficiary().call(), MASTER)
        self.assertEqual(self.etherPrice().call(), 1000 * UNIT)
        self.assertNotEqual(self.lastPriceUpdate().call(), 0)
        self.assertEqual(self.stalePeriod().call(), 2 * 24 * 60 * 60) # default two days
        self.assertEqual(self.liquidationTimestamp().call(), 2**256 - 1)
        self.assertEqual(self.liquidationPeriod().call(), 90 * 24 * 60 * 60) # default ninety days
        self.assertEqual(self.poolFeeRate().call(), UNIT / 200) # default 50 basis points
        self.assertEqual(self.nominPool().call(), 0)

        # ERC20FeeToken members
        self.assertEqual(self.name().call(), "Ether-Backed USD Nomins")
        self.assertEqual(self.symbol().call(), "eUSD")
        self.assertEqual(self.totalSupply().call(), 0)
        self.assertEqual(self.balanceOf(MASTER).call(), 0)
        self.assertEqual(self.transferFeeRate().call(), 2 * UNIT // 1000)
        self.assertEqual(self.feeAuthority().call(), MASTER)

    def test_getSetOracle(self):
        pre_oracle = self.oracle().call()
        new_oracle = W3.eth.accounts[1]

        # Only the owner must be able to set the oracle.
        assertTransactionReverts(self, self.setOracle(new_oracle), new_oracle)

        mine_tx(self.setOracle(new_oracle).transact({'from': MASTER}))
        self.assertEqual(self.oracle().call(), new_oracle)
        mine_tx(self.setOracle(pre_oracle).transact({'from': MASTER}))

    def test_getSetCourt(self):
        pre_court = self.court().call()
        new_court = W3.eth.accounts[1]

        # Only the owner must be able to set the court.
        assertTransactionReverts(self, self.setOracle(new_court), new_court)

        mine_tx(self.setCourt(new_court).transact({'from': MASTER}))
        self.assertEqual(self.court().call(), new_court)
        mine_tx(self.setCourt(pre_court).transact({'from': MASTER}))

    def test_getSetBeneficiary(self):
        pre_beneficiary = self.beneficiary().call()
        new_beneficiary = W3.eth.accounts[1]

        # Only the owner must be able to set the beneficiary.
        assertTransactionReverts(self, self.setBeneficiary(new_beneficiary), new_beneficiary)

        mine_tx(self.setBeneficiary(new_beneficiary).transact({'from': MASTER}))
        self.assertEqual(self.beneficiary().call(), new_beneficiary)
        mine_tx(self.setBeneficiary(pre_beneficiary).transact({'from': MASTER}))

    def test_getSetPoolFeeRate(self):
        pre_rate = self.poolFeeRate().call()
        new_rate = UNIT // 10

        # Only the owner must be able to set the pool fee rate.
        assertTransactionReverts(self, self.setPoolFeeRate(new_rate), W3.eth.accounts[1])

        mine_tx(self.setPoolFeeRate(new_rate).transact({'from': MASTER}))
        self.assertEqual(self.poolFeeRate().call(), new_rate)
        mine_tx(self.setPoolFeeRate(pre_rate).transact({'from': MASTER}))
"""
    def test_getSetStalePeriod(self):
        pre_period = self.stalePeriod().call()
        new_period = UNIT // 10

        # Only the owner must be able to set the pool fee rate.
        assertTransactionReverts(self, self.setPoolFeeRate(new_rate), W3.eth.accounts[1])

        mine_tx(self.setPoolFeeRate(new_rate).transact({'from': MASTER}))
        self.assertEqual(self.poolFeeRate().call(), new_rate)
        mine_tx(self.setPoolFeeRate(pre_rate).transact({'from': MASTER}))
"""
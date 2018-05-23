from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    mine_tx, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS, block_time
)
from tests.contract_interfaces.issuanceController_interface import IssuanceControllerInterface

def setUpModule():
    print("Testing IssuanceController...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestIssuanceController(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = [
            "contracts/Havven.sol",
            "contracts/Nomin.sol",
            "contracts/IssuanceController.sol",
            "tests/contracts/PublicHavven.sol"
        ]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)
        nomin_abi = compiled['Nomin']['abi']
        havven_abi = compiled['Havven']['abi']
        issuance_controller_abi = compiled['IssuanceController']['abi']

        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=havven_abi)
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=nomin_abi)

        havven_contract, hvn_txr = attempt_deploy(
            compiled, 'PublicHavven', MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER, UNIT//2]
        )
        nomin_contract, nom_txr = attempt_deploy(
            compiled, 'Nomin', MASTER, [nomin_proxy.address, havven_contract.address, MASTER, ZERO_ADDRESS]
        )

        issuanceControllerContract, _ = attempt_deploy(
            compiled, 'IssuanceController', MASTER,
                [
                    cls.contractOwner,
                    cls.beneficiary,
                    cls.delay,
                    havven_contract.address,
                    nomin_contract.address,
                    cls.oracleAddress,
                    cls.usdToEthPrice,
                    cls.usdToHavPrice
                ]
            )

        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, havven_contract, nomin_contract, nomin_abi, issuanceControllerContract

    @classmethod
    def setUpClass(cls):
        cls.contractOwner = MASTER
        cls.oracleAddress = fresh_accounts(1)[0]
        cls.beneficiary = fresh_accounts(1)[0]
        cls.delay = 100 * 60
        cls.usdToEthPrice = 500 * (10 ** 18)
        cls.usdToHavPrice = int(0.65 * (10 ** 18))
        cls.priceStalePeriod = 3 * 60 * 60
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.havven_contract, cls.nomin_contract, cls.nomin_abi, cls.issuanceControllerContract = cls.deployContracts()
        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")

    def test_constructor(self):
        self.assertEqual(self.issuanceController.owner(), self.contractOwner)
        self.assertEqual(self.issuanceController.oracle(), self.oracleAddress)
        self.assertEqual(self.issuanceController.selfDestructBeneficiary(), self.beneficiary)
        self.assertEqual(self.issuanceController.selfDestructDelay(), self.delay)
        self.assertEqual(self.issuanceController.oracle(), self.oracleAddress)
        self.assertEqual(self.issuanceController.usdToEthPrice(), self.usdToEthPrice)
        self.assertEqual(self.issuanceController.usdToHavPrice(), self.usdToHavPrice)
        self.assertEqual(self.issuanceController.havven(), self.havven_contract.address)
        self.assertEqual(self.issuanceController.nomin(), self.nomin_contract.address)

    # Oracle address setter and getter tests

    def test_getOracleAddress(self):
        oracleAddress = self.issuanceController.oracle()
        self.assertEqual(oracleAddress, self.oracleAddress)

    def test_setOracleAddress(self):
        newOracleAddress = fresh_accounts(1)[0]
        self.issuanceController.setOracle(self.contractOwner, newOracleAddress)
        oracleAddressToCheck = self.issuanceController.oracle()
        self.assertEqual(newOracleAddress, oracleAddressToCheck)

    def test_cannotSetOracleIfUnauthorised(self):
        newOracleAddress, notOwner = fresh_accounts(2)
        originalOracleAddress = self.issuanceController.oracle()
        self.assertReverts(self.issuanceController.setOracle, notOwner, newOracleAddress)
        oracleAddressToCheck = self.issuanceController.oracle()
        self.assertEqual(oracleAddressToCheck, originalOracleAddress)

    # Price stale period setter and getter tests

    def test_getPriceStalePeriod(self):
        priceStalePeriod = self.issuanceController.priceStalePeriod()
        self.assertEqual(priceStalePeriod, self.priceStalePeriod)

    def test_setPriceStalePeriod(self):
        newPriceStalePeriod = 400 * 60 * 60
        self.issuanceController.setPriceStalePeriod(self.contractOwner, newPriceStalePeriod)
        priceStalePeriodToCheck = self.issuanceController.priceStalePeriod()
        self.assertEqual(newPriceStalePeriod, priceStalePeriodToCheck)

    def test_cannotSetPriceStalePeriodIfUnauthorised(self):
        notOwner = fresh_accounts(1)[0]
        originalPriceStalePeriod = self.issuanceController.priceStalePeriod()
        newPriceStalePeriod = originalPriceStalePeriod + 100
        self.assertReverts(self.issuanceController.setPriceStalePeriod, notOwner, newPriceStalePeriod)
        priceStalePeriodToCheck = self.issuanceController.priceStalePeriod()
        self.assertEqual(originalPriceStalePeriod, priceStalePeriodToCheck)

    # Update prices (aka exchange rate) setter and getter tests

    def test_updatePrices(self):
        newEthPrice = self.usdToEthPrice + 100
        newHavPrice = self.usdToHavPrice + 100
        timeSent = block_time()
        self.issuanceController.updatePrices(self.oracleAddress, newEthPrice, newHavPrice, timeSent)
        self.assertEqual(self.issuanceController.usdToEthPrice(), newEthPrice)
        self.assertEqual(self.issuanceController.usdToHavPrice(), newHavPrice)
        self.assertEqual(self.issuanceController.lastPriceUpdateTime(), timeSent)

    def test_updatePricesTooEarly(self):
        timeSent = block_time() - 120
        self.assertReverts(self.issuanceController.updatePrices, self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)

    def test_updatePricesTooLate(self):
        ORACLE_FUTURE_LIMIT = 10 * 60
        timeSent = block_time() + ORACLE_FUTURE_LIMIT + 60
        self.assertReverts(self.issuanceController.updatePrices, self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)

    # TODO

    # def test_etherChargedForNominsIsCorrect(self):
    #     amountOfNominsToBuy = 67

    #     self.issuanceController.setNominEtherExchangeRate(MASTER, 1.67)
    #     exchangeRate = self.issuanceController.getNominEthExchangeRate()
    #     conversionFeePercentage = self.issuanceController.getConversionFee()

    #     totalNominsConsideration = amountOfNominsToBuy * (1 + conversionFeePercentage)
    #     nominsToPayInFees = totalNominsConsideration - amountOfNominsToBuy
    #     etherToSpend = totalNominsConsideration * exchangeRate

    #     self.issuanceController.buy(DUMMY, etherToSpend)        
    #     # TODO: Check I have the correct amount of Ether

    


        

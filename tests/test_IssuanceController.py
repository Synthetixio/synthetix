from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    mine_tx, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
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
            "contracts/Owned.sol",
            "contracts/SelfDestructible.sol",
            "contracts/Pausable.sol",
            "contracts/SafeDecimalMath.sol",
            "contracts/IssuanceController.sol"
        ]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        issuanceControllerContract, _ = attempt_deploy(
            compiled, 'IssuanceController', MASTER,
                [
                    cls.contractOwner,
                    cls.beneficiary,
                    cls.delay,
                    cls.oracleAddress,
                    cls.usdToEthPrice,
                    cls.usdToHavPrice
                ]
            )
        
        issuanceController = W3.eth.contract(address=issuanceControllerContract.address, abi=compiled['IssuanceController']['abi'])
        return issuanceControllerContract, issuanceController

    @classmethod
    def setUpClass(cls):
        cls.contractOwner = MASTER
        cls.oracleAddress = fresh_accounts(1)[0]
        cls.beneficiary = fresh_accounts(1)[0]
        cls.delay = 100 * 60
        cls.usdToEthPrice = 500 * (10 ** 18)
        cls.usdToHavPrice = int(0.65 * (10 ** 18))
        cls.priceStalePeriod = 3 * 60 * 60
        cls.issuanceControllerContract, cls.issuanceController = cls.deployContracts()
        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")

    def test_constructor(self):
        self.assertEqual(self.issuanceController.oracle(), self.oracleAddress)
        self.assertEqual(self.issuanceController.selfDestructBeneficiary(), self.beneficiary)
        self.assertEqual(self.issuanceController.selfDestructDelay(), self.delay)
        self.assertEqual(self.issuanceController.oracle(), self.oracleAddress)
        self.assertEqual(self.issuanceController.usdToEthPrice(), self.usdToEthPrice)
        self.assertEqual(self.issuanceController.usdToHavPrice(), self.usdToHavPrice)
        self.assertEqual(self.issuanceController.priceStalePeriod(), self.priceStalePeriod)

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

    


        

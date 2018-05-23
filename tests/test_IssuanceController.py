from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
#     fresh_account, fresh_accounts,
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

        issuanceControllerContract, _ = attempt_deploy(compiled, 'IssuanceController', MASTER,
                                                    [MASTER, DUMMY, 100 * 60, havven_contract.address, nomin_contract.address, MASTER, 500 * (10 ** 18), int(0.65 * (10 ** 18))])
        
        issuanceController = W3.eth.contract(address=issuanceControllerContract.address, abi=issuance_controller_abi)

        return issuanceControllerContract, issuanceController

    @classmethod
    def setUpClass(cls):
        cls.issuanceControllerContract, cls.issuanceController = cls.deployContracts()

        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")


    # def test_constructor(self):
    #     TODO

    def test_sample(self):
        self.assertEqual(self.issuanceController.priceStalePeriod(), 10800)

    # def test_sample2(self):
    #     txr = self.issuanceController.setSomeValue(MASTER, 950)
    #     self.assertEqual(self.issuanceController.getSomeValue(), 950)

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

    


        

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
        sources = ["contracts/IssuanceController.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        issuanceControllerContract, _ = attempt_deploy(compiled, 'IssuanceController', MASTER, [])
        issuanceController = W3.eth.contract(address=issuanceControllerContract.address, abi=compiled['IssuanceController']['abi'])

        return issuanceControllerContract, issuanceController

    @classmethod
    def setUpClass(cls):
        cls.issuanceControllerContract, cls.issuanceController = cls.deployContracts()

        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")


    # def test_constructor(self):
    #     TODO

    def test_sample(self):
        self.assertEqual(self.issuanceController.getSomeValue(), 900)

    def test_sample2(self):
        txr = self.issuanceController.setSomeValue(MASTER, 950)
        self.assertEqual(self.issuanceController.getSomeValue(), 950)

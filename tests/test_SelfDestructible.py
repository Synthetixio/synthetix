from utils.deployutils import attempt_deploy, W3, MASTER, DUMMY, UNIT
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import HavvenTestCase, send_value, block_time

from tests.contract_interfaces.self_destructible_interface import SelfDestructibleInterface

SD_SOURCE = "tests/contracts/PayableSD.sol"


def setUpModule():
    print("Testing SelfDestructible...")


def tearDownModule():
    print()


class TestSelfDestructible(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.sd_duration = 60 * 60 * 24 * 7 * 4
        cls.NULL_INITIATION = (2**256 - 1) // 2
        cls.contract_balance = 10 * UNIT

        cls.setUpHavvenTestClass([SD_SOURCE], remappings=['""=contracts'], event_primary='SelfDestructible')
        cls.sd_contract, cls.deploy_tx = attempt_deploy(cls.compiled, 'PayableSD', MASTER,
                                                        [MASTER, DUMMY, cls.sd_duration])
        cls.sd = SelfDestructibleInterface(cls.sd_contract, 'SelfDestructible')

        # Send some value to the contract so that we can test receipt of funds by beneficiary
        send_value(MASTER, cls.sd_contract.address, cls.contract_balance)

    def test_constructor(self):
        self.assertNotEqual(MASTER, DUMMY)
        self.assertEqual(self.sd.owner(), MASTER)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)
        self.assertEqual(self.sd.selfDestructDelay(), self.sd_duration)
        self.assertEventEquals(self.deploy_tx.logs[1],
                               "SelfDestructBeneficiaryUpdated",
                               {"newBeneficiary": self.sd.selfDestructBeneficiary()})

    def test_setBeneficiary(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # Only the owner may set the beneficiary
        self.assertReverts(self.sd.setBeneficiary, notowner, owner)

        # The owner can correctly set the variable...
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        tx = self.sd.setBeneficiary(owner, owner)
        self.assertEqual(self.sd.selfDestructBeneficiary(), owner) 
        # Event is properly emitted.
        self.assertEventEquals(tx.logs[0],
                               "SelfDestructBeneficiaryUpdated",
                               {"newBeneficiary": owner})

        # ...and set it back.
        self.sd.setBeneficiary(owner, DUMMY)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)

    def test_initiateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # Non-owners cannot SD the contract.
        self.assertReverts(self.sd.initiateSelfDestruct, notowner)

        # Initiation time starts at 0.
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)

        tx = self.sd.initiateSelfDestruct(owner)

        # Initiated at the right time.
        self.assertEqual(self.sd.initiationTime(), block_time(tx['blockNumber']))

        # Event is properly emitted.
        self.assertEventEquals(tx.logs[0],
                               "SelfDestructInitiated",
                               {"duration": self.sd_duration})

    def test_terminateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        self.sd.initiateSelfDestruct(owner)
        self.assertNotEqual(self.sd.initiationTime(), self.NULL_INITIATION)
        self.assertReverts(self.sd.terminateSelfDestruct, notowner)

        tx = self.sd.terminateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)

        self.assertEventEquals(tx.logs[0], "SelfDestructTerminated")

    def test_selfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # The contract cannot be self-destructed before the SD has been initiated.
        self.assertReverts(self.sd.selfDestruct, owner)

        tx = self.sd.initiateSelfDestruct(owner)
        self.assertEventEquals(tx.logs[0],
                               "SelfDestructInitiated",
                               {"duration": self.sd_duration})

        # Neither owners nor non-owners may not self-destruct before the time has elapsed.
        self.assertReverts(self.sd.selfDestruct, notowner)
        self.assertReverts(self.sd.selfDestruct, owner)
        fast_forward(seconds=self.sd_duration, days=-1)
        self.assertReverts(self.sd.selfDestruct, notowner)
        self.assertReverts(self.sd.selfDestruct, owner)
        fast_forward(seconds=10, days=1)

        beneficiary = self.sd.selfDestructBeneficiary()
        self.assertEqual(beneficiary, DUMMY)
        pre_balance = W3.eth.getBalance(beneficiary)

        # Non-owner should not be able to self-destruct even if the time has elapsed.
        self.assertReverts(self.sd.selfDestruct, notowner)
        address = self.sd.contract.address
        tx = self.sd.selfDestruct(owner)

        # The balance in the contract is correctly refunded to the beneficiary.
        self.assertEqual(W3.eth.getBalance(beneficiary), pre_balance + self.contract_balance)
        
        self.assertEventEquals(tx.logs[0], "SelfDestructed",
                               {"beneficiary": beneficiary})

        # Check contract not exist 
        self.assertEqual(W3.eth.getCode(address), b'\x00')

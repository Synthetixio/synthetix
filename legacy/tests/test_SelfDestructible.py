from utils.deployutils import attempt_deploy, W3, MASTER, DUMMY, UNIT
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import HavvenTestCase, send_value, block_time, ZERO_ADDRESS

from tests.contract_interfaces.self_destructible_interface import SelfDestructibleInterface



def setUpModule():
    print("Testing SelfDestructible...")
    print("===========================")
    print()


def tearDownModule():
    print()
    print()


class TestSelfDestructible(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.sd_duration = 60 * 60 * 24 * 7 * 4
        cls.contract_balance = 10 * UNIT

        sources = ["tests/contracts/PayableSD.sol"]

        cls.compiled, cls.event_maps = cls.compileAndMapEvents(sources, remappings=['""=contracts'])
        cls.event_map = cls.event_maps['SelfDestructible']

        cls.sd_contract, cls.deploy_tx = attempt_deploy(cls.compiled, 'PayableSD', MASTER,
                                                        [MASTER])
        cls.sd = SelfDestructibleInterface(cls.sd_contract, 'SelfDestructible')
        cls.sd.setSelfDestructBeneficiary(MASTER, DUMMY)

        # Send some value to the contract so that we can test receipt of funds by beneficiary
        send_value(MASTER, cls.sd_contract.address, cls.contract_balance)

    def test_constructor(self):
        self.assertNotEqual(MASTER, DUMMY)
        self.assertEqual(self.sd.owner(), MASTER)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        self.assertFalse(self.sd.selfDestructInitiated())
        self.assertEqual(self.sd.initiationTime(), 0)
        self.assertEqual(self.sd.SELFDESTRUCT_DELAY(), self.sd_duration)
        self.assertEventEquals(self.event_map, self.deploy_tx.logs[1],
                               "SelfDestructBeneficiaryUpdated",
                               {"newBeneficiary": MASTER},
                               location=self.sd_contract.address)

    def test_setSelfDestructBeneficiary(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # Only the owner may set the beneficiary
        self.assertReverts(self.sd.setSelfDestructBeneficiary, notowner, owner)

        # Beneficiary must be nonzero
        self.assertReverts(self.sd.setSelfDestructBeneficiary, owner, ZERO_ADDRESS)

        # The owner can correctly set the variable...
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        tx = self.sd.setSelfDestructBeneficiary(owner, owner)
        self.assertEqual(self.sd.selfDestructBeneficiary(), owner) 
        # Event is properly emitted.
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructBeneficiaryUpdated",
                               {"newBeneficiary": owner},
                               location=self.sd_contract.address)

        # ...and set it back.
        self.sd.setSelfDestructBeneficiary(owner, DUMMY)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)

    def test_initiateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # Non-owners cannot SD the contract.
        self.assertReverts(self.sd.initiateSelfDestruct, notowner)

        # Initiation time starts at 0.
        self.assertEqual(self.sd.initiationTime(), 0)
        self.assertFalse(self.sd.selfDestructInitiated())

        tx = self.sd.initiateSelfDestruct(owner)

        # Initiated at the right time.
        self.assertEqual(self.sd.initiationTime(), block_time(tx['blockNumber']))
        self.assertTrue(self.sd.selfDestructInitiated())

        # Event is properly emitted.
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructInitiated",
                               {"selfDestructDelay": self.sd_duration},
                               location=self.sd_contract.address)

    def test_terminateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        self.assertFalse(self.sd.selfDestructInitiated())
        self.sd.initiateSelfDestruct(owner)
        self.assertNotEqual(self.sd.initiationTime(), 0)
        self.assertTrue(self.sd.selfDestructInitiated())
        self.assertReverts(self.sd.terminateSelfDestruct, notowner)

        tx = self.sd.terminateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), 0)
        self.assertFalse(self.sd.selfDestructInitiated())

        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructTerminated",
                               location=self.sd_contract.address)

    def test_selfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # The contract cannot be self-destructed before the SD has been initiated.
        self.assertReverts(self.sd.selfDestruct, owner)

        tx = self.sd.initiateSelfDestruct(owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructInitiated",
                               {"selfDestructDelay": self.sd_duration},
                               location=self.sd_contract.address)

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
        
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructed",
                               {"beneficiary": beneficiary},
                               location=self.sd_contract.address)

        # Check contract not exist 
        self.assertEqual(W3.eth.getCode(address), b'\x00')

    def test_event_SelfDestructTerminated(self):
        owner = self.sd.owner()
        self.sd.initiateSelfDestruct(owner)
        tx = self.sd.terminateSelfDestruct(owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructTerminated",
                               location=self.sd_contract.address)

    def test_event_SelfDestructInitiated(self):
        owner = self.sd.owner()
        tx = self.sd.initiateSelfDestruct(owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructInitiated",
                               {"selfDestructDelay": self.sd_duration},
                               location=self.sd_contract.address)

    def test_event_SelfDestructed(self):
        owner = self.sd.owner()
        beneficiary = self.sd.selfDestructBeneficiary()
        self.sd.initiateSelfDestruct(owner)
        fast_forward(self.sd_duration + 1)
        tx = self.sd.selfDestruct(owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructed",
                               {"beneficiary": beneficiary},
                               location=self.sd_contract.address)

    def test_event_SelfDestructBeneficiaryUpdated(self):
        owner = self.sd.owner()
        tx = self.sd.setSelfDestructBeneficiary(owner, owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructBeneficiaryUpdated",
                               {"newBeneficiary": owner},
                               location=self.sd_contract.address)

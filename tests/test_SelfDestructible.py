import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, W3, MASTER, DUMMY, UNIT
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward, fresh_account
from utils.testutils import assertReverts, assertClose, send_value, block_time

from tests.contract_interfaces.self_destructible_interface import SelfDestructibleInterface

SD_SOURCE = "tests/contracts/PayableSD.sol"


def setUpModule():
    print("Testing SelfDestructible...")


def tearDownModule():
    print()


class TestSelfDestructible(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        compiled = compile_contracts([SD_SOURCE],
                                     remappings=['""=contracts'])

        cls.sd_contract, txr = attempt_deploy(compiled, 'PayableSD', MASTER, [MASTER, DUMMY])

        cls.sd = SelfDestructibleInterface(cls.sd_contract)

        send_value(MASTER, cls.sd_contract.address, 10 * UNIT)

    def test_constructor(self):
        self.assertEqual(self.sd.owner(), MASTER)
        self.assertEqual(self.sd.beneficiary(), DUMMY)
        self.assertEqual(self.sd.initiationTime(), 2**256 - 1)

    def test_setBeneficiary(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.assertReverts(self.sd.setBeneficiary, DUMMY, MASTER)
        self.assertEqual(self.sd.beneficiary(), DUMMY)
        self.sd.setBeneficiary(MASTER, MASTER)
        self.assertEqual(self.sd.beneficiary(), MASTER)
        self.sd.setBeneficiary(MASTER, DUMMY)
        self.assertEqual(self.sd.beneficiary(), DUMMY)

    def test_initiateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.assertReverts(self.sd.initiateSelfDestruct, notowner)
        self.assertEqual(self.sd.initiationTime(), 2**256 - 1)
        tx_receipt = self.sd.initiateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), block_time(tx_receipt['blockNumber']))

    def test_terminateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.sd.initiateSelfDestruct(owner)
        self.assertNotEqual(self.sd.initiationTime(), 2**256 - 1)
        self.assertReverts(self.sd.terminateSelfDestruct, notowner)
        self.sd.terminateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), 2**256 - 1)

    def test_selfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.sd.initiateSelfDestruct(owner)
        self.assertReverts(self.sd.selfDestruct, notowner)
        self.assertReverts(self.sd.selfDestruct, owner)
        fast_forward(days=2)
        self.assertReverts(self.sd.selfDestruct, owner)
        fast_forward(seconds=10, days=1)

        beneficiary = self.sd.beneficiary()
        self.assertEqual(beneficiary, DUMMY)
        pre_balance = W3.eth.getBalance(beneficiary)
        self.sd.selfDestruct(owner)
        self.assertGreater(W3.eth.getBalance(beneficiary), pre_balance)


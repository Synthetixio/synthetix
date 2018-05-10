import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, W3, MASTER, DUMMY, UNIT
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward, fresh_account
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

        compiled = compile_contracts([SD_SOURCE],
                                     remappings=['""=contracts'])
        cls.sd_contract, txr = attempt_deploy(compiled, 'PayableSD', MASTER, [MASTER, DUMMY, cls.sd_duration])
        cls.sd = SelfDestructibleInterface(cls.sd_contract)

        # Send some value to the contract so that we can test receipt of funds by beneficiary
        send_value(MASTER, cls.sd_contract.address, cls.contract_balance)


    def test_constructor(self):
        self.assertNotEqual(MASTER, DUMMY)
        self.assertEqual(self.sd.owner(), MASTER)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)

    def test_setBeneficiary(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # Only the owner may set the beneficiary
        self.assertReverts(self.sd.setBeneficiary, notowner, owner)

        # The owner can correctly set the variable...
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)
        self.sd.setBeneficiary(owner, owner)
        self.assertEqual(self.sd.selfDestructBeneficiary(), owner)

        # ...and set it back.
        self.sd.setBeneficiary(owner, DUMMY)
        self.assertEqual(self.sd.selfDestructBeneficiary(), DUMMY)

    def test_initiateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.assertReverts(self.sd.initiateSelfDestruct, notowner)
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)
        tx_receipt = self.sd.initiateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), block_time(tx_receipt['blockNumber']))

    def test_terminateSelfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.sd.initiateSelfDestruct(owner)
        self.assertNotEqual(self.sd.initiationTime(), self.NULL_INITIATION)
        self.assertReverts(self.sd.terminateSelfDestruct, notowner)
        self.sd.terminateSelfDestruct(owner)
        self.assertEqual(self.sd.initiationTime(), self.NULL_INITIATION)

    def test_selfDestruct(self):
        owner = self.sd.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # The contract cannot be self-destructed before the SD has been initiated.
        self.assertReverts(self.sd.selfDestruct, owner)

        self.sd.initiateSelfDestruct(owner)

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

        self.sd.selfDestruct(owner)

        # The balance in the contract is correctly refunded to the beneficiary.
        self.assertEqual(W3.eth.getBalance(beneficiary), pre_balance + self.contract_balance)


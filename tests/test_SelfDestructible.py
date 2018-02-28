import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, W3, MASTER, DUMMY, UNIT
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward, fresh_account
from utils.testutils import assertReverts, assertClose, ZERO_ADDRESS, send_value, block_time

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


        cls.sd, txr = attempt_deploy(compiled, 'PayableSD', MASTER, [MASTER, DUMMY],
                        value=10*UNIT)

        cls.owner = lambda self: cls.sd.functions.owner().call()
        cls.nominateOwner = lambda self, sender, newOwner: mine_tx(
            cls.sd.functions.nominateOwner(newOwner).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.sd.functions.acceptOwnership().transact({'from': sender}))

        cls.initiationTime = lambda self: cls.sd.functions.initiationTime().call()
        cls.beneficiary = lambda self: cls.sd.functions.beneficiary().call()

        cls.setBeneficiary = lambda self, sender, beneficiary: mine_tx(
            cls.sd.functions.setBeneficiary(beneficiary).transact({'from': sender}))
        cls.initiateSelfDestruct = lambda self, sender: mine_tx(
            cls.sd.functions.initiateSelfDestruct().transact({'from': sender}))
        cls.terminateSelfDestruct = lambda self, sender: mine_tx(
            cls.sd.functions.terminateSelfDestruct().transact({'from': sender}))
        cls.selfDestruct = lambda self, sender: mine_tx(
            cls.sd.functions.selfDestruct().transact({'from': sender}))

        send_value(MASTER, cls.sd.address, 10 * UNIT)

    def test_constructor(self):
        self.assertEqual(self.owner(), MASTER)
        self.assertEqual(self.beneficiary(), DUMMY)
        self.assertEqual(self.initiationTime(), 2**256 - 1)

    def test_setBeneficiary(self):
        owner = self.owner()
        notowner = DUMMY
        newBeneficiary = fresh_account()
        self.assertNotEqual(owner, notowner)
        self.assertReverts(self.setBeneficiary, DUMMY, MASTER)
        self.assertEqual(self.beneficiary(), DUMMY)
        self.setBeneficiary(MASTER, MASTER)
        self.assertEqual(self.beneficiary(), MASTER)
        self.setBeneficiary(MASTER, DUMMY)
        self.assertEqual(self.beneficiary(), DUMMY)

    def test_initiateSelfDestruct(self):
        owner = self.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.assertReverts(self.initiateSelfDestruct, notowner)
        self.assertEqual(self.initiationTime(), 2**256 - 1)
        tx_receipt = self.initiateSelfDestruct(owner)
        self.assertEqual(self.initiationTime(), block_time(tx_receipt['blockNumber']))

    def test_terminateSelfDestruct(self):
        owner = self.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.initiateSelfDestruct(owner)
        self.assertNotEqual(self.initiationTime(), 2**256 - 1)
        self.assertReverts(self.terminateSelfDestruct, notowner)
        self.terminateSelfDestruct(owner)
        self.assertEqual(self.initiationTime(), 2**256 - 1)

    def test_selfDestruct(self):
        owner = self.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)
        self.initiateSelfDestruct(owner)
        self.assertReverts(self.selfDestruct, notowner)
        self.assertReverts(self.selfDestruct, owner)
        fast_forward(days=2)
        self.assertReverts(self.selfDestruct, owner)
        fast_forward(seconds=10, days=1)

        beneficiary = self.beneficiary()
        self.assertEqual(beneficiary, DUMMY)
        pre_balance = W3.eth.getBalance(beneficiary)
        self.selfDestruct(owner)
        self.assertGreater(W3.eth.getBalance(beneficiary), pre_balance)


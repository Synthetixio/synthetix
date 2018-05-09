import unittest

from utils.deployutils import compile_contracts, attempt_deploy, MASTER, fast_forward
from utils.testutils import assertReverts, block_time
from utils.generalutils import to_seconds


def setUpModule():
    print("Testing LimitedSetup...")


def tearDownModule():
    print()


class TestLimitedSetup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts(["tests/contracts/OneWeekSetup.sol"],
                                     remappings=['""=contracts'])
        cls.setup, txr = attempt_deploy(compiled, 'OneWeekSetup', MASTER, [])
        cls.contractConstructionTime = block_time(txr.blockNumber)

        cls.testFunc = lambda self: cls.setup.functions.testFunc().call()
        cls.setupExpiryTime = lambda self: cls.setup.functions.publicSetupExpiryTime().call()

    def test_setupFunc(self):
        self.assertTrue(self.testFunc())
        fast_forward(days=1)
        self.assertTrue(self.testFunc())
        fast_forward(days=1)        
        self.assertTrue(self.testFunc())
        fast_forward(days=4)
        self.assertTrue(self.testFunc())
        fast_forward(days=1)        
        self.assertReverts(self.testFunc)

    def test_setupDuration(self):
        self.assertEqual(self.contractConstructionTime + to_seconds(weeks=1), self.setupExpiryTime())

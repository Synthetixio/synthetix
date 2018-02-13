import unittest

from utils.deployutils import compile_contracts, attempt_deploy, MASTER, fast_forward
from utils.testutils import assertReverts


SETUP_SOURCE = "tests/contracts/OneWeekSetup.sol"


def setUpModule():
    print("Testing LimitedSetup...")


def tearDownModule():
    print()


class TestLimitedSetup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([SETUP_SOURCE],
                                     remappings=['""=contracts'])
        cls.setup, txr = attempt_deploy(compiled, 'OneWeekSetup', MASTER, [])

        cls.testFunc = lambda self: cls.setup.functions.testFunc().call()

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

 
if __name__ == '__main__':
    unittest.main()

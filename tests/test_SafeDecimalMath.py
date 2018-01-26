import unittest
import deploy
from test_utils import assertCallReverts

deployed_contract = None
MATH_MODULE_SOURCE = "tests/PublicMath.sol"
class TestSafeDecimalMath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = deploy.compile_contracts([MATH_MODULE_SOURCE],
                                            remappings=['""=contracts'])
        cls.math = deploy.attempt_deploy(compiled, 'PublicMath', deploy.MASTER, [],
                                         print_exception=True)

    # Test addIsSafe

    def test_addIsSafe(self):
        self.assertTrue(self.math.functions.pubAddIsSafe(1, 1).call())

    def test_overflowAddIsUnSafe(self):
        self.assertFalse(self.math.functions.pubAddIsSafe(((2**256) - 1), (2**256 - 1)).call())
    # Test safeAdd

    def test_addSafe(self):
        self.assertEqual(self.math.functions.pubSafeAdd(1, 1).call(), 2)

    def test_addHuge(self):
        self.assertEqual(self.math.functions.pubSafeAdd(2**128, 3**17).call(), 2**128 + 3**17)
    def test_addZero(self):
        self.assertEqual(self.math.functions.pubSafeAdd(1, 0).call(), 1)

    def test_addOverflow(self):
        assertCallReverts(self, self.math.functions.pubSafeAdd(((2**256) - 1), (2**256 - 1)))
        assertCallReverts(self, self.math.functions.pubSafeAdd(((2**256) - 1), 1))
"""
    # Test subIsSafe

    def test_subIsSafe(self):
        self.assertTrue(False)

    def test_overflowSubIsUnSafe(self):
        self.assertTrue(False)

    # Test safeSub

    def test_safeSub(self):
        self.assertTrue(False)

    def test_subZero(self):
        self.assertTrue(False)

    def test_subOne(self):
        self.assertTrue(False)

    def test_subHuge(self):
        self.assertTrue(False)

    def test_subHugeLargeResult(self):
        self.assertTrue(False)

    def test_subHugeSmallResult(self):
        self.assertTrue(False)

    def test_subEqual(self):
        self.assertTrue(False)

    def test_subJustOverflow(self):
        self.assertTrue(False)

    def test_subMajorOverflow(self):
        self.assertTrue(False)

    def test_subMinMinusMax(self):
        self.assertTrue(False)

    # Test mulIsSafe

    def test_mulIsSafe(self):
        self.assertTrue(False)

    def test_zeroMulIsSafe(self):
        self.assertTrue(False)

    def test_overflowMulIsUnSafe(self):
        self.assertTrue(False)

    # Test safeDecMul

    def test_safeMul(self):
        self.assertTrue(False)

    def test_mulZero(self):
        self.assertTrue(False)

    def test_mulOne(self):
        self.assertTrue(False)

    def test_mulHuge(self):
        self.assertTrue(False)

    def test_mulMedium(self):
        self.assertTrue(False)

    def test_mulZero(self):
        self.assertTrue(False)
"""

    # Test divIsSafe
    # Test safeDecDiv
    # Test intToDec

if __name__ == '__main__':
    unittest.main()
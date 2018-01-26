import unittest
from deploy import UNIT, MASTER
from deploy_utils import compile_contracts, attempt_deploy
from test_utils import assertCallReverts

MATH_MODULE_SOURCE = "tests/PublicMath.sol"

def setUpModule():
    print("Testing SafeDecimalMath...")

def tearDownModule():
    print()

class TestSafeDecimalMath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([MATH_MODULE_SOURCE],
                                     remappings=['""=contracts'])
        cls.math = attempt_deploy(compiled, 'PublicMath', MASTER, [],
                                  print_exception=True)

        cls.addIsSafe = lambda self, x, y: cls.math.functions.pubAddIsSafe(x, y)
        cls.safeAdd = lambda self, x, y: cls.math.functions.pubSafeAdd(x, y)
        cls.subIsSafe = lambda self, x, y: cls.math.functions.pubSubIsSafe(x, y)
        cls.safeSub = lambda self, x, y: cls.math.functions.pubSafeSub(x, y)
        cls.mulIsSafe = lambda self, x, y: cls.math.functions.pubMulIsSafe(x, y)
        cls.safeMul = lambda self, x, y: cls.math.functions.pubSafeMul(x, y)
        cls.safeDecMul = lambda self, x, y: cls.math.functions.pubSafeDecMul(x, y)
        cls.divIsSafe = lambda self, x, y: cls.math.functions.pubDivIsSafe(x, y)
        cls.safeDiv = lambda self, x, y: cls.math.functions.pubSafeDiv(x, y)
        cls.safeDecDiv = lambda self, x, y: cls.math.functions.pubSafeDecDiv(x, y)
        cls.intToDec = lambda self, i: cls.math.functions.pubIntToDec(i)

    # Test addIsSafe

    def test_addIsSafe(self):
        self.assertTrue(self.addIsSafe(1, 1).call())
        self.assertTrue(self.addIsSafe(1235151, 9249).call())
        self.assertTrue(self.addIsSafe(0, 0).call())
        self.assertTrue(self.addIsSafe(2**256 - 20, 17).call())
        self.assertTrue(self.addIsSafe(2**256 - 20, 19).call())

    def test_addIsUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        self.assertFalse(self.addIsSafe(2**256 - 1, 1).call())
        self.assertFalse(self.addIsSafe(2**255, 2**255).call())
        self.assertFalse(self.addIsSafe(2**256 - 1, 2**256 - 1).call())

    # Test safeAdd

    def test_addSafe(self):
        self.assertEqual(self.safeAdd(1, 1).call(), 2)
        self.assertEqual(self.safeAdd(1235151, 9249).call(), 1235151 + 9249)
        self.assertEqual(self.safeAdd(0, 0).call(), 0)

        # Larger examples
        self.assertEqual(self.safeAdd(2**128, 3**17).call(), 2**128 + 3**17)
        self.assertEqual(self.safeAdd(2**250, 2**250).call(), 2**251)
        self.assertEqual(self.safeAdd(2**256 - 20, 17).call(), 2**256 - 3)

        # Additive identity
        self.assertEqual(self.safeAdd(1, 0).call(), 1)
        self.assertEqual(self.safeAdd(0, 100).call(), 100)
        self.assertEqual(self.safeAdd(10**24, 0).call(), 10**24)

        # Commutativity
        self.assertEqual(self.safeAdd(10114, 17998).call(), self.safeAdd(17998, 10114).call())

    def test_addUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        assertCallReverts(self, self.safeAdd(2**256 - 1, 2**256 - 1))
        assertCallReverts(self, self.safeAdd(2**255, 2**255))
        assertCallReverts(self, self.safeAdd(((2**256) - 1), 1))
        assertCallReverts(self, self.safeAdd(((2**256) - 100), 1000))

    # Test subIsSafe

    def test_subIsSafe(self):
        self.assertTrue(self.subIsSafe(1, 1).call())
        self.assertTrue(self.subIsSafe(10, 9).call())
        self.assertTrue(self.subIsSafe(20, 0).call())
        self.assertTrue(self.subIsSafe(100000000, 123456).call())
        self.assertTrue(self.subIsSafe(2**256-1, 2**256-1).call())
        self.assertTrue(self.subIsSafe(2**256-1, 17**34).call())
        self.assertTrue(self.subIsSafe(2**255, 2**254).call())

    def test_subIsUnsafe(self):
        self.assertFalse(self.subIsSafe(0, 1).call())
        self.assertFalse(self.subIsSafe(10, 11).call())
        self.assertFalse(self.subIsSafe(1121311, 1231241414).call())
        self.assertFalse(self.subIsSafe(2**255, 2**256-1).call())
        self.assertFalse(self.subIsSafe(2**255, 2**255+1).call())

    # Test safeSub

    def test_safeSub(self):
        self.assertEqual(self.safeSub(10, 9).call(), 1)
        self.assertEqual(self.safeSub(10, 1).call(), 9)
        self.assertEqual(self.safeSub(100000000, 123456).call(), 100000000 - 123456)

        self.assertEqual(self.safeSub(2**256 - 1, 2**256 - 1).call(), 0)
        self.assertEqual(self.safeSub(2**256 - 1, 17**34).call(), (2**256-1) - 17**34)
        self.assertEqual(self.safeSub(2**255, 2**254).call(), 2**254)
        self.assertEqual(self.safeSub(2**255, (2**255 - 1)).call(), 1)

        # Subtractive identity element
        self.assertEqual(self.safeSub(20, 0).call(), 20)
        self.assertEqual(self.safeSub(2**256 - 1, 0).call(), 2**256 - 1)

        # Yields the identity element
        self.assertEqual(self.safeSub(1, 1).call(), 0)
        self.assertEqual(self.safeSub(10**24 + 1, 10**24 + 1).call(), 0)
        self.assertEqual(self.safeSub(2**256-1, 2**256-1).call(), 0)

    def test_unsafeSub(self):
        # Small overflows
        assertCallReverts(self, self.safeSub(0, 1))
        assertCallReverts(self, self.safeSub(10, 11))
        assertCallReverts(self, self.safeSub(100, 100000))
        # Larger overflows
        assertCallReverts(self, self.safeSub(2**255, 2**256 - 11))
        assertCallReverts(self, self.safeSub(2**256 - 11, 2**256 - 10))
        # min - max
        assertCallReverts(self, self.safeSub(0, 2**256 - 1))

    # Test mulIsSafe

    def test_mulIsSafe(self):
        self.assertTrue(self.mulIsSafe(1, 0).call())
        self.assertTrue(self.mulIsSafe(0, 1).call())
        self.assertTrue(self.mulIsSafe(1, 1).call())
        self.assertTrue(self.mulIsSafe(2**254, 2).call())
        self.assertTrue(self.mulIsSafe(2**254, 3).call())
        self.assertTrue(self.mulIsSafe(2**254 - 1, 4).call())
        self.assertTrue(self.mulIsSafe(2**128, 2**127).call())
        self.assertTrue(self.mulIsSafe(2**128 - 1, 2**128 - 1).call())

    def test_mulIsUnSafe(self):
        self.assertFalse(self.mulIsSafe(2**255, 2).call())
        self.assertFalse(self.mulIsSafe(2**128, 2**128).call())
        self.assertFalse(self.mulIsSafe(2**128, 3**100).call())
        self.assertFalse(self.mulIsSafe(7**50, 2**200).call())

    # Test safeMul

    def test_safeMul(self):
        self.assertEqual(self.safeMul(99999, 777777).call(), 99999 * 777777)
        self.assertEqual(self.safeMul(2**254, 2).call(), 2**255)
        self.assertEqual(self.safeMul(2**254 - 1, 4).call(), (2**254 - 1) * 4)
        self.assertEqual(self.safeMul(2**128, 2**127).call(), 2**255)
        self.assertEqual(self.safeMul(2**128 - 1, 2**128 - 1).call(), (2**128 - 1)**2)

        # Identity
        self.assertEqual(self.safeMul(1, 1).call(), 1)
        self.assertEqual(self.safeMul(1, 2**256 - 1).call(), 2**256 - 1)
        self.assertEqual(self.safeMul(2**256 - 1, 1).call(), 2**256 - 1)

        # Zero
        self.assertEqual(self.safeMul(1, 0).call(), 0)
        self.assertEqual(self.safeMul(0, 1).call(), 0)
        self.assertEqual(self.safeMul(0, 2**256 - 1).call(), 0)
        self.assertEqual(self.safeMul(2**256 - 1, 0).call(), 0)

        # Commutativity
        self.assertEqual(self.safeMul(10114, 17998).call(), self.safeMul(17998, 10114).call())

    #def test_unsafeMul(self):
    #    self.assertTrue(False)

    # Test safeDecMul
    # Test divIsSafe
    # Test safeDiv
    # Test safeDecDiv
    # Test intToDec

if __name__ == '__main__':
    unittest.main()
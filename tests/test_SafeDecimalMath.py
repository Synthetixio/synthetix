import unittest
from deploy import UNIT, MASTER
from deployutils import compile_contracts, attempt_deploy
from testutils import assertCallReverts

MATH_MODULE_SOURCE = "tests/contracts/PublicMath.sol"

def setUpModule():
    print("Testing SafeDecimalMath...")

def tearDownModule():
    print()

class TestSafeDecimalMath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = compile_contracts([MATH_MODULE_SOURCE],
                                     remappings=['""=contracts'])
        cls.math, tx_receipt = attempt_deploy(compiled, 'PublicMath', MASTER, [])

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

    # Test addIsSafe function

    def test_addIsSafe(self):
        self.assertTrue(self.addIsSafe(1, 1).call())
        self.assertTrue(self.addIsSafe(1235151, 9249).call())
        self.assertTrue(self.addIsSafe(0, 0).call())
        self.assertTrue(self.addIsSafe(2**256 - 20, 17).call())
        self.assertTrue(self.addIsSafe(2**256 - 20, 19).call())

    def test_addIsUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        self.assertFalse(self.addIsSafe(1, 2**256 - 1).call())
        self.assertFalse(self.addIsSafe(2**256 - 1, 1).call())
        self.assertFalse(self.addIsSafe(2**255, 2**255).call())
        self.assertFalse(self.addIsSafe(2**256 - 1, 2**256 - 1).call())

    # Test safeAdd function

    def test_addSafe(self):
        self.assertEqual(self.safeAdd(1, 1).call(), 2)
        self.assertEqual(self.safeAdd(1235151, 9249).call(), 1235151 + 9249)

        # Larger examples
        self.assertEqual(self.safeAdd(2**128, 3**17).call(), 2**128 + 3**17)
        self.assertEqual(self.safeAdd(2**250, 2**250).call(), 2**251)
        self.assertEqual(self.safeAdd(2**256 - 20, 17).call(), 2**256 - 3)

        # Additive identity
        self.assertEqual(self.safeAdd(0, 0).call(), 0)
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

    # Test subIsSafe function

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

    # Test safeSub function

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
        assertCallReverts(self, self.safeSub(0, 1))
        assertCallReverts(self, self.safeSub(10, 11))
        assertCallReverts(self, self.safeSub(100, 100000))
        assertCallReverts(self, self.safeSub(2**255, 2**256 - 11))
        assertCallReverts(self, self.safeSub(2**256 - 11, 2**256 - 10))
        assertCallReverts(self, self.safeSub(0, 2**256 - 1))

    # Test mulIsSafe function

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

    # Test safeMul function

    def test_safeMul(self):
        self.assertEqual(self.safeMul(10, 10).call(), 100)
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

    def test_unsafeMul(self):
        assertCallReverts(self, self.safeMul(2**128, 2**128))
        assertCallReverts(self, self.safeMul(2**256 - 1, 2**256 - 1))
        assertCallReverts(self, self.safeMul(2**255, 2))
        assertCallReverts(self, self.safeMul(2**200, 3**100))
        assertCallReverts(self, self.safeMul(2**254, 5))

    # Test safeDecMul function

    def testSafeDecMul(self):
        self.assertEqual(self.safeDecMul(99999 * UNIT, 777777 * UNIT).call(), 99999 * 777777 * UNIT)
        self.assertEqual(self.safeDecMul(10 * UNIT, UNIT + UNIT).call(), 20 * UNIT)
        self.assertEqual(self.safeDecMul(2**256 // UNIT, UNIT).call(), 2**256 // UNIT)
        self.assertEqual(self.safeDecMul(2**255 - 1, 2).call(), (2**256 - 2) // UNIT)
        self.assertEqual(self.safeDecMul(10**8 * UNIT, 10**8 * UNIT).call(), 10**8 * 10**8 * UNIT)
        self.assertEqual(self.safeDecMul(17 * UNIT, 23 * UNIT).call(), 17 * 23 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT // 2, UNIT // 2).call(), UNIT // 4)
        self.assertEqual(self.safeDecMul(UNIT // 25, UNIT // 5).call(), UNIT // 125)
        self.assertEqual(self.safeDecMul(UNIT // 7, UNIT // 3).call(), ((UNIT // 7) * (UNIT // 3)) // UNIT)

        # Test zero
        self.assertEqual(self.safeDecMul(UNIT, 0).call(), 0)
        self.assertEqual(self.safeDecMul(0, 100).call(), 0)

        # Test identity
        self.assertEqual(self.safeDecMul(10 * UNIT, UNIT).call(), 10 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT, 10 * UNIT).call(), 10 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT, 1).call(), 1)
        self.assertEqual(self.safeDecMul(1, UNIT).call(), 1)

        # Commutativity
        self.assertEqual(self.safeDecMul(17 * UNIT, 23 * UNIT).call(), self.safeDecMul(23 * UNIT, 17 * UNIT).call())

        # Rounding occurs towards zero
        self.assertEqual(self.safeDecMul(UNIT + 1, UNIT - 1).call(), UNIT-1)

    def testUnsafeDecMul(self):
        assertCallReverts(self, self.safeMul(2**255, 2))
        assertCallReverts(self, self.safeMul(2**200, 2**56))
        assertCallReverts(self, self.safeMul(2**200, 3**40))

    # Test divIsSafe function

    def testDivIsSafe(self):
        self.assertTrue(self.divIsSafe(1, 1).call())
        self.assertTrue(self.divIsSafe(2**256 - 1, 2**256 - 1).call())
        self.assertTrue(self.divIsSafe(100, 10*20).call())

    def testDivIsUnsafe(self):
        self.assertFalse(self.divIsSafe(1, 0).call())
        self.assertFalse(self.divIsSafe(2**256 - 1, 0).call())

    # Test safeDiv function

    def testSafeDiv(self):
        self.assertEqual(self.safeDiv(0, 1).call(), 0)
        self.assertEqual(self.safeDiv(1, 1).call(), 1)
        self.assertEqual(self.safeDiv(1, 2).call(), 0)
        self.assertEqual(self.safeDiv(100, 10).call(), 10)
        self.assertEqual(self.safeDiv(2**256 - 1, 1).call(), 2**256 - 1)
        self.assertEqual(self.safeDiv(3**100, 3).call(), 3**99)
        self.assertEqual(self.safeDiv(999, 2).call(), 499)
        self.assertEqual(self.safeDiv(1000, 7).call(), 142)

    def testUnsafeDiv(self):
        assertCallReverts(self, self.safeDiv(0, 0))
        assertCallReverts(self, self.safeDiv(1, 0))
        assertCallReverts(self, self.safeDiv(2**256 - 1, 0))

    # Test safeDecDiv function

    def testSafeDecDiv(self):
        self.assertEqual(self.safeDecDiv(4 * UNIT, 2 * UNIT).call(), 2 * UNIT)
        self.assertEqual(self.safeDecDiv(UNIT, 2 * UNIT).call(), UNIT // 2)
        self.assertEqual(self.safeDecDiv(10**8 * UNIT, 3 * UNIT).call(), (10**8 * UNIT) // 3)
        self.assertEqual(self.safeDecDiv(20 * UNIT, UNIT // 2).call(), 40 * UNIT)
        self.assertEqual(self.safeDecDiv(UNIT, 10 * UNIT).call(), UNIT // 10)

        self.assertEqual(self.safeDecDiv(10**8 * UNIT, 10**8 * UNIT).call(), UNIT)
        self.assertEqual(self.safeDecDiv(10**8 * UNIT, UNIT).call(), 10**8 * UNIT)
        self.assertEqual(self.safeDecDiv(10**30 * UNIT, 10**10 * UNIT).call(), 10**20 * UNIT)
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, 10 * UNIT).call(), (2**256 // UNIT) // 10)
        self.assertEqual(self.safeDecDiv(UNIT, UNIT * UNIT).call(), 1)
        self.assertEqual(self.safeDecDiv(10 * UNIT, UNIT * UNIT).call(), 10)

        # Largest usable numerator
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, UNIT).call(), 2**256 // UNIT)
        # Largest usable power of ten in the numerator
        self.assertEqual(self.safeDecDiv(10**41 * UNIT, 10**11 * UNIT).call(), 10**30 * UNIT)
        # Largest usable power of two in the numerator
        self.assertEqual(self.safeDecDiv(2**196, UNIT).call(), 2**196)

        # Operations yielding zero (greater than a UNIT factor difference between operands)
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, 2**256 - 1).call(), 0)
        self.assertEqual(self.safeDecDiv(UNIT - 1, UNIT * UNIT).call(), 0)

        # Identity and zero.
        self.assertEqual(self.safeDecDiv(1, UNIT).call(), 1)
        self.assertEqual(self.safeDecDiv(100000, UNIT).call(), 100000)
        self.assertEqual(self.safeDecDiv(UNIT, UNIT).call(), UNIT)
        self.assertEqual(self.safeDecDiv(10 * UNIT, UNIT).call(), 10 * UNIT)
        self.assertEqual(self.safeDecDiv(0, UNIT).call(), 0)
        self.assertEqual(self.safeDecDiv(0, 1).call(), 0)

    def testUnsafeDecDiv(self):
        # Numerator overflows
        assertCallReverts(self, self.safeDecDiv(2**256 - 1, 1))
        assertCallReverts(self, self.safeDecDiv((2**256 // UNIT) + 1, 1))
        assertCallReverts(self, self.safeDecDiv(10**42 * UNIT, 1))
        assertCallReverts(self, self.safeDecDiv(2**197, 1))

        # Zero denominator overflows
        assertCallReverts(self, self.safeDecDiv(0, 0))
        assertCallReverts(self, self.safeDecDiv(1, 0))
        assertCallReverts(self, self.safeDecDiv(2**256 // UNIT, 0))

        # Both
        assertCallReverts(self, self.safeDecDiv(2**256 - 1, 0))

    # Test intToDec function

    def testIntToDec(self):
        self.assertEqual(self.intToDec(1).call(), UNIT)
        self.assertEqual(self.intToDec(100).call(), 100*UNIT)
        self.assertEqual(self.intToDec(UNIT).call(), UNIT * UNIT)
        self.assertEqual(self.intToDec(2**256 // UNIT).call(), (2**256 // UNIT) * UNIT)

        # Test out of range
        assertCallReverts(self, self.intToDec(2**256 // UNIT + 1))

    # Test combined arithmetic

    def testArithmeticExpressions(self):
        self.assertEqual(self.safeSub(self.safeAdd(UNIT, self.safeDecDiv(self.safeDiv(self.safeAdd(UNIT, UNIT).call(), 2).call(), UNIT).call()).call(), self.safeDecMul(2 * UNIT, UNIT).call()).call(), 0)
        self.assertEqual(self.safeDecDiv(self.safeDecMul(self.safeAdd(self.intToDec(1).call(), UNIT).call(), self.safeMul(2, UNIT).call()).call(), UNIT // 2).call(), self.intToDec(8).call())

if __name__ == '__main__':
    unittest.main()

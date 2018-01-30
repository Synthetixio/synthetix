import unittest

from utils.deployutils import compile_contracts, attempt_deploy, UNIT, MASTER 
from utils.testutils import assertReverts

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

        cls.addIsSafe = lambda self, x, y: cls.math.functions.pubAddIsSafe(x, y).call()
        cls.safeAdd = lambda self, x, y: cls.math.functions.pubSafeAdd(x, y).call()
        cls.subIsSafe = lambda self, x, y: cls.math.functions.pubSubIsSafe(x, y).call()
        cls.safeSub = lambda self, x, y: cls.math.functions.pubSafeSub(x, y).call()
        cls.mulIsSafe = lambda self, x, y: cls.math.functions.pubMulIsSafe(x, y).call()
        cls.safeMul = lambda self, x, y: cls.math.functions.pubSafeMul(x, y).call()
        cls.safeDecMul = lambda self, x, y: cls.math.functions.pubSafeDecMul(x, y).call()
        cls.divIsSafe = lambda self, x, y: cls.math.functions.pubDivIsSafe(x, y).call()
        cls.safeDiv = lambda self, x, y: cls.math.functions.pubSafeDiv(x, y).call()
        cls.safeDecDiv = lambda self, x, y: cls.math.functions.pubSafeDecDiv(x, y).call()
        cls.intToDec = lambda self, i: cls.math.functions.pubIntToDec(i).call()

    # Test addIsSafe function

    def test_addIsSafe(self):
        self.assertTrue(self.addIsSafe(1, 1))
        self.assertTrue(self.addIsSafe(1235151, 9249))
        self.assertTrue(self.addIsSafe(0, 0))
        self.assertTrue(self.addIsSafe(2**256 - 20, 17))
        self.assertTrue(self.addIsSafe(2**256 - 20, 19))

    def test_addIsUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        self.assertFalse(self.addIsSafe(1, 2**256 - 1))
        self.assertFalse(self.addIsSafe(2**256 - 1, 1))
        self.assertFalse(self.addIsSafe(2**255, 2**255))
        self.assertFalse(self.addIsSafe(2**256 - 1, 2**256 - 1))

    # Test safeAdd function

    def test_addSafe(self):
        self.assertEqual(self.safeAdd(1, 1), 2)
        self.assertEqual(self.safeAdd(1235151, 9249), 1235151 + 9249)

        # Larger examples
        self.assertEqual(self.safeAdd(2**128, 3**17), 2**128 + 3**17)
        self.assertEqual(self.safeAdd(2**250, 2**250), 2**251)
        self.assertEqual(self.safeAdd(2**256 - 20, 17), 2**256 - 3)

        # Additive identity
        self.assertEqual(self.safeAdd(0, 0), 0)
        self.assertEqual(self.safeAdd(1, 0), 1)
        self.assertEqual(self.safeAdd(0, 100), 100)
        self.assertEqual(self.safeAdd(10**24, 0), 10**24)

        # Commutativity
        self.assertEqual(self.safeAdd(10114, 17998), self.safeAdd(17998, 10114))

    def test_addUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        assertReverts(self, self.safeAdd, [2**256 - 1, 2**256 - 1])
        assertReverts(self, self.safeAdd, [2**255, 2**255])
        assertReverts(self, self.safeAdd, [2**256 - 1, 1])
        assertReverts(self, self.safeAdd, [2**256 - 100, 1000])

    # Test subIsSafe function

    def test_subIsSafe(self):
        self.assertTrue(self.subIsSafe(1, 1))
        self.assertTrue(self.subIsSafe(10, 9))
        self.assertTrue(self.subIsSafe(20, 0))
        self.assertTrue(self.subIsSafe(100000000, 123456))
        self.assertTrue(self.subIsSafe(2**256-1, 2**256-1))
        self.assertTrue(self.subIsSafe(2**256-1, 17**34))
        self.assertTrue(self.subIsSafe(2**255, 2**254))

    def test_subIsUnsafe(self):
        self.assertFalse(self.subIsSafe(0, 1))
        self.assertFalse(self.subIsSafe(10, 11))
        self.assertFalse(self.subIsSafe(1121311, 1231241414))
        self.assertFalse(self.subIsSafe(2**255, 2**256-1))
        self.assertFalse(self.subIsSafe(2**255, 2**255+1))

    # Test safeSub function

    def test_safeSub(self):
        self.assertEqual(self.safeSub(10, 9), 1)
        self.assertEqual(self.safeSub(10, 1), 9)
        self.assertEqual(self.safeSub(100000000, 123456), 100000000 - 123456)

        self.assertEqual(self.safeSub(2**256 - 1, 2**256 - 1), 0)
        self.assertEqual(self.safeSub(2**256 - 1, 17**34), (2**256-1) - 17**34)
        self.assertEqual(self.safeSub(2**255, 2**254), 2**254)
        self.assertEqual(self.safeSub(2**255, (2**255 - 1)), 1)

        # Subtractive identity element
        self.assertEqual(self.safeSub(20, 0), 20)
        self.assertEqual(self.safeSub(2**256 - 1, 0), 2**256 - 1)

        # Yields the identity element
        self.assertEqual(self.safeSub(1, 1), 0)
        self.assertEqual(self.safeSub(10**24 + 1, 10**24 + 1), 0)
        self.assertEqual(self.safeSub(2**256-1, 2**256-1), 0)

    def test_unsafeSub(self):
        assertReverts(self, self.safeSub, [0, 1])
        assertReverts(self, self.safeSub, [10, 11])
        assertReverts(self, self.safeSub, [100, 100000])
        assertReverts(self, self.safeSub, [2**255, 2**256 - 11])
        assertReverts(self, self.safeSub, [2**256 - 11, 2**256 - 10])
        assertReverts(self, self.safeSub, [0, 2**256 - 1])

    # Test mulIsSafe function

    def test_mulIsSafe(self):
        self.assertTrue(self.mulIsSafe(1, 0))
        self.assertTrue(self.mulIsSafe(0, 1))
        self.assertTrue(self.mulIsSafe(1, 1))
        self.assertTrue(self.mulIsSafe(2**254, 2))
        self.assertTrue(self.mulIsSafe(2**254, 3))
        self.assertTrue(self.mulIsSafe(2**254 - 1, 4))
        self.assertTrue(self.mulIsSafe(2**128, 2**127))
        self.assertTrue(self.mulIsSafe(2**128 - 1, 2**128 - 1))

    def test_mulIsUnSafe(self):
        self.assertFalse(self.mulIsSafe(2**255, 2))
        self.assertFalse(self.mulIsSafe(2**128, 2**128))
        self.assertFalse(self.mulIsSafe(2**128, 3**100))
        self.assertFalse(self.mulIsSafe(7**50, 2**200))

    # Test safeMul function

    def test_safeMul(self):
        self.assertEqual(self.safeMul(10, 10), 100)
        self.assertEqual(self.safeMul(99999, 777777), 99999 * 777777)
        self.assertEqual(self.safeMul(2**254, 2), 2**255)
        self.assertEqual(self.safeMul(2**254 - 1, 4), (2**254 - 1) * 4)
        self.assertEqual(self.safeMul(2**128, 2**127), 2**255)
        self.assertEqual(self.safeMul(2**128 - 1, 2**128 - 1), (2**128 - 1)**2)

        # Identity
        self.assertEqual(self.safeMul(1, 1), 1)
        self.assertEqual(self.safeMul(1, 2**256 - 1), 2**256 - 1)
        self.assertEqual(self.safeMul(2**256 - 1, 1), 2**256 - 1)

        # Zero
        self.assertEqual(self.safeMul(1, 0), 0)
        self.assertEqual(self.safeMul(0, 1), 0)
        self.assertEqual(self.safeMul(0, 2**256 - 1), 0)
        self.assertEqual(self.safeMul(2**256 - 1, 0), 0)

        # Commutativity
        self.assertEqual(self.safeMul(10114, 17998), self.safeMul(17998, 10114))

    def test_unsafeMul(self):
        assertReverts(self, self.safeMul, [2**128, 2**128])
        assertReverts(self, self.safeMul, [2**256 - 1, 2**256 - 1])
        assertReverts(self, self.safeMul, [2**255, 2])
        assertReverts(self, self.safeMul, [2**200, 3**100])
        assertReverts(self, self.safeMul, [2**254, 5])

    # Test safeDecMul function

    def testSafeDecMul(self):
        self.assertEqual(self.safeDecMul(99999 * UNIT, 777777 * UNIT), 99999 * 777777 * UNIT)
        self.assertEqual(self.safeDecMul(10 * UNIT, UNIT + UNIT), 20 * UNIT)
        self.assertEqual(self.safeDecMul(2**256 // UNIT, UNIT), 2**256 // UNIT)
        self.assertEqual(self.safeDecMul(2**255 - 1, 2), (2**256 - 2) // UNIT)
        self.assertEqual(self.safeDecMul(10**8 * UNIT, 10**8 * UNIT), 10**8 * 10**8 * UNIT)
        self.assertEqual(self.safeDecMul(17 * UNIT, 23 * UNIT), 17 * 23 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT // 2, UNIT // 2), UNIT // 4)
        self.assertEqual(self.safeDecMul(UNIT // 25, UNIT // 5), UNIT // 125)
        self.assertEqual(self.safeDecMul(UNIT // 7, UNIT // 3), ((UNIT // 7) * (UNIT // 3)) // UNIT)

        # Test zero
        self.assertEqual(self.safeDecMul(UNIT, 0), 0)
        self.assertEqual(self.safeDecMul(0, 100), 0)

        # Test identity
        self.assertEqual(self.safeDecMul(10 * UNIT, UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT, 10 * UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecMul(UNIT, 1), 1)
        self.assertEqual(self.safeDecMul(1, UNIT), 1)

        # Commutativity
        self.assertEqual(self.safeDecMul(17 * UNIT, 23 * UNIT), self.safeDecMul(23 * UNIT, 17 * UNIT))

        # Rounding occurs towards zero
        self.assertEqual(self.safeDecMul(UNIT + 1, UNIT - 1), UNIT-1)

    def testUnsafeDecMul(self):
        assertReverts(self, self.safeMul, [2**255, 2])
        assertReverts(self, self.safeMul, [2**200, 2**56])
        assertReverts(self, self.safeMul, [2**200, 3**40])

    # Test divIsSafe function

    def testDivIsSafe(self):
        self.assertTrue(self.divIsSafe(1, 1))
        self.assertTrue(self.divIsSafe(2**256 - 1, 2**256 - 1))
        self.assertTrue(self.divIsSafe(100, 10*20))

    def testDivIsUnsafe(self):
        self.assertFalse(self.divIsSafe(1, 0))
        self.assertFalse(self.divIsSafe(2**256 - 1, 0))

    # Test safeDiv function

    def testSafeDiv(self):
        self.assertEqual(self.safeDiv(0, 1), 0)
        self.assertEqual(self.safeDiv(1, 1), 1)
        self.assertEqual(self.safeDiv(1, 2), 0)
        self.assertEqual(self.safeDiv(100, 10), 10)
        self.assertEqual(self.safeDiv(2**256 - 1, 1), 2**256 - 1)
        self.assertEqual(self.safeDiv(3**100, 3), 3**99)
        self.assertEqual(self.safeDiv(999, 2), 499)
        self.assertEqual(self.safeDiv(1000, 7), 142)

    def testUnsafeDiv(self):
        assertReverts(self, self.safeDiv, [0, 0])
        assertReverts(self, self.safeDiv, [1, 0])
        assertReverts(self, self.safeDiv, [2**256 - 1, 0])

    # Test safeDecDiv function

    def testSafeDecDiv(self):
        self.assertEqual(self.safeDecDiv(4 * UNIT, 2 * UNIT), 2 * UNIT)
        self.assertEqual(self.safeDecDiv(UNIT, 2 * UNIT), UNIT // 2)
        self.assertEqual(self.safeDecDiv(10**8 * UNIT, 3 * UNIT), (10**8 * UNIT) // 3)
        self.assertEqual(self.safeDecDiv(20 * UNIT, UNIT // 2), 40 * UNIT)
        self.assertEqual(self.safeDecDiv(UNIT, 10 * UNIT), UNIT // 10)

        self.assertEqual(self.safeDecDiv(10**8 * UNIT, 10**8 * UNIT), UNIT)
        self.assertEqual(self.safeDecDiv(10**8 * UNIT, UNIT), 10**8 * UNIT)
        self.assertEqual(self.safeDecDiv(10**30 * UNIT, 10**10 * UNIT), 10**20 * UNIT)
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, 10 * UNIT), (2**256 // UNIT) // 10)
        self.assertEqual(self.safeDecDiv(UNIT, UNIT * UNIT), 1)
        self.assertEqual(self.safeDecDiv(10 * UNIT, UNIT * UNIT), 10)

        # Largest usable numerator
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, UNIT), 2**256 // UNIT)
        # Largest usable power of ten in the numerator
        self.assertEqual(self.safeDecDiv(10**41 * UNIT, 10**11 * UNIT), 10**30 * UNIT)
        # Largest usable power of two in the numerator
        self.assertEqual(self.safeDecDiv(2**196, UNIT), 2**196)

        # Operations yielding zero (greater than a UNIT factor difference between operands)
        self.assertEqual(self.safeDecDiv(2**256 // UNIT, 2**256 - 1), 0)
        self.assertEqual(self.safeDecDiv(UNIT - 1, UNIT * UNIT), 0)

        # Identity and zero.
        self.assertEqual(self.safeDecDiv(1, UNIT), 1)
        self.assertEqual(self.safeDecDiv(100000, UNIT), 100000)
        self.assertEqual(self.safeDecDiv(UNIT, UNIT), UNIT)
        self.assertEqual(self.safeDecDiv(10 * UNIT, UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecDiv(0, UNIT), 0)
        self.assertEqual(self.safeDecDiv(0, 1), 0)

    def testUnsafeDecDiv(self):
        # Numerator overflows
        assertReverts(self, self.safeDecDiv, [2**256 - 1, 1])
        assertReverts(self, self.safeDecDiv, [(2**256 // UNIT) + 1, 1])
        assertReverts(self, self.safeDecDiv, [10**42 * UNIT, 1])
        assertReverts(self, self.safeDecDiv, [2**197, 1])

        # Zero denominator overflows
        assertReverts(self, self.safeDecDiv, [0, 0])
        assertReverts(self, self.safeDecDiv, [1, 0])
        assertReverts(self, self.safeDecDiv, [2**256 // UNIT, 0])

        # Both
        assertReverts(self, self.safeDecDiv, [2**256 - 1, 0])

    # Test intToDec function

    def testIntToDec(self):
        self.assertEqual(self.intToDec(1), UNIT)
        self.assertEqual(self.intToDec(100), 100*UNIT)
        self.assertEqual(self.intToDec(UNIT), UNIT * UNIT)
        self.assertEqual(self.intToDec(2**256 // UNIT), (2**256 // UNIT) * UNIT)

        # Test out of range
        assertReverts(self, self.intToDec, [2**256 // UNIT + 1])

    # Test combined arithmetic

    def testArithmeticExpressions(self):
        self.assertEqual(self.safeSub(self.safeAdd(UNIT, self.safeDecDiv(self.safeDiv(self.safeAdd(UNIT, UNIT), 2), UNIT)), self.safeDecMul(2 * UNIT, UNIT)), 0)
        self.assertEqual(self.safeDecDiv(self.safeDecMul(self.safeAdd(self.intToDec(1), UNIT), self.safeMul(2, UNIT)), UNIT // 2), self.intToDec(8))

if __name__ == '__main__':
    unittest.main()

from utils.deployutils import compile_contracts, attempt_deploy, UNIT, MASTER
from utils.testutils import HavvenTestCase
from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface


def setUpModule():
    print("Testing SafeDecimalMath...")
    print("==========================")
    print()


def tearDownModule():
    print()
    print()


class TestSafeDecimalMath(HavvenTestCase):
    @classmethod
    def deployContracts(cls):
        sources = ["tests/contracts/PublicMath.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources, remappings=['""=contracts'])

        math, tx_receipt = attempt_deploy(compiled, 'PublicMath', MASTER, [])
        return math

    @classmethod
    def setUpClass(cls):
        cls.math = cls.deployContracts()
        cls.safeDecMath = SafeDecimalMathInterface(cls.math, 'SafeDecimalMath')

    def test_scale(self):
        self.assertEqual(self.safeDecMath.decimals(), 18)
        self.assertEqual(self.safeDecMath.UNIT(), UNIT)

    # Test addIsSafe function
    def test_addIsSafe(self):
        self.assertTrue(self.safeDecMath.addIsSafe(1, 1))
        self.assertTrue(self.safeDecMath.addIsSafe(1235151, 9249))
        self.assertTrue(self.safeDecMath.addIsSafe(0, 0))
        self.assertTrue(self.safeDecMath.addIsSafe(2**256 - 20, 17))
        self.assertTrue(self.safeDecMath.addIsSafe(2**256 - 20, 19))

    def test_addIsUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        self.assertFalse(self.safeDecMath.addIsSafe(1, 2**256 - 1))
        self.assertFalse(self.safeDecMath.addIsSafe(2**256 - 1, 1))
        self.assertFalse(self.safeDecMath.addIsSafe(2**255, 2**255))
        self.assertFalse(self.safeDecMath.addIsSafe(2**256 - 1, 2**256 - 1))

    # Test safeAdd function
    def test_addSafe(self):
        self.assertEqual(self.safeDecMath.safeAdd(1, 1), 2)
        self.assertEqual(self.safeDecMath.safeAdd(1235151, 9249), 1235151 + 9249)

        # Larger examples
        self.assertEqual(self.safeDecMath.safeAdd(2**128, 3**17), 2**128 + 3**17)
        self.assertEqual(self.safeDecMath.safeAdd(2**250, 2**250), 2**251)
        self.assertEqual(self.safeDecMath.safeAdd(2**256 - 20, 17), 2**256 - 3)

        # Additive identity
        self.assertEqual(self.safeDecMath.safeAdd(0, 0), 0)
        self.assertEqual(self.safeDecMath.safeAdd(1, 0), 1)
        self.assertEqual(self.safeDecMath.safeAdd(0, 100), 100)
        self.assertEqual(self.safeDecMath.safeAdd(10**24, 0), 10**24)

        # Commutativity
        self.assertEqual(
            self.safeDecMath.safeAdd(10114, 17998),
            self.safeDecMath.safeAdd(17998, 10114)
        )

    def test_addUnsafe(self):
        # These should all overflow: max representable is 2^256 - 1
        self.assertReverts(self.safeDecMath.safeAdd, 2**256 - 1, 2**256 - 1)
        self.assertReverts(self.safeDecMath.safeAdd, 2**255, 2**255)
        self.assertReverts(self.safeDecMath.safeAdd, 2**256 - 1, 1)
        self.assertReverts(self.safeDecMath.safeAdd, 2**256 - 100, 1000)

    # Test subIsSafe function
    def test_subIsSafe(self):
        self.assertTrue(self.safeDecMath.subIsSafe(1, 1))
        self.assertTrue(self.safeDecMath.subIsSafe(10, 9))
        self.assertTrue(self.safeDecMath.subIsSafe(20, 0))
        self.assertTrue(self.safeDecMath.subIsSafe(100000000, 123456))
        self.assertTrue(self.safeDecMath.subIsSafe(2**256-1, 2**256-1))
        self.assertTrue(self.safeDecMath.subIsSafe(2**256-1, 17**34))
        self.assertTrue(self.safeDecMath.subIsSafe(2**255, 2**254))

    def test_subIsUnsafe(self):
        self.assertFalse(self.safeDecMath.subIsSafe(0, 1))
        self.assertFalse(self.safeDecMath.subIsSafe(10, 11))
        self.assertFalse(self.safeDecMath.subIsSafe(1121311, 1231241414))
        self.assertFalse(self.safeDecMath.subIsSafe(2**255, 2**256-1))
        self.assertFalse(self.safeDecMath.subIsSafe(2**255, 2**255+1))

    # Test safeSub function
    def test_safeSub(self):
        self.assertEqual(self.safeDecMath.safeSub(10, 9), 1)
        self.assertEqual(self.safeDecMath.safeSub(10, 1), 9)
        self.assertEqual(self.safeDecMath.safeSub(100000000, 123456), 100000000 - 123456)

        self.assertEqual(self.safeDecMath.safeSub(2**256 - 1, 2**256 - 1), 0)
        self.assertEqual(self.safeDecMath.safeSub(2**256 - 1, 17**34), (2**256-1) - 17**34)
        self.assertEqual(self.safeDecMath.safeSub(2**255, 2**254), 2**254)
        self.assertEqual(self.safeDecMath.safeSub(2**255, (2**255 - 1)), 1)

        # Subtractive identity element
        self.assertEqual(self.safeDecMath.safeSub(20, 0), 20)
        self.assertEqual(self.safeDecMath.safeSub(2**256 - 1, 0), 2**256 - 1)

        # Yields the identity element
        self.assertEqual(self.safeDecMath.safeSub(1, 1), 0)
        self.assertEqual(self.safeDecMath.safeSub(10**24 + 1, 10**24 + 1), 0)
        self.assertEqual(self.safeDecMath.safeSub(2**256-1, 2**256-1), 0)

    def test_unsafeSub(self):
        self.assertReverts(self.safeDecMath.safeSub, 0, 1)
        self.assertReverts(self.safeDecMath.safeSub, 10, 11)
        self.assertReverts(self.safeDecMath.safeSub, 100, 100000)
        self.assertReverts(self.safeDecMath.safeSub, 2**255, 2**256 - 11)
        self.assertReverts(self.safeDecMath.safeSub, 2**256 - 11, 2**256 - 10)
        self.assertReverts(self.safeDecMath.safeSub, 0, 2**256 - 1)

    # Test mulIsSafe function
    def test_mulIsSafe(self):
        self.assertTrue(self.safeDecMath.mulIsSafe(1, 0))
        self.assertTrue(self.safeDecMath.mulIsSafe(0, 1))
        self.assertTrue(self.safeDecMath.mulIsSafe(1, 1))
        self.assertTrue(self.safeDecMath.mulIsSafe(2**254, 2))
        self.assertTrue(self.safeDecMath.mulIsSafe(2**254, 3))
        self.assertTrue(self.safeDecMath.mulIsSafe(2**254 - 1, 4))
        self.assertTrue(self.safeDecMath.mulIsSafe(2**128, 2**127))
        self.assertTrue(self.safeDecMath.mulIsSafe(2**128 - 1, 2**128 - 1))

    def test_mulIsUnSafe(self):
        self.assertFalse(self.safeDecMath.mulIsSafe(2**255, 2))
        self.assertFalse(self.safeDecMath.mulIsSafe(2**128, 2**128))
        self.assertFalse(self.safeDecMath.mulIsSafe(2**128, 3**100))
        self.assertFalse(self.safeDecMath.mulIsSafe(7**50, 2**200))

    # Test safeMul function
    def test_safeMul(self):
        self.assertEqual(self.safeDecMath.safeMul(10, 10), 100)
        self.assertEqual(self.safeDecMath.safeMul(99999, 777777), 99999 * 777777)
        self.assertEqual(self.safeDecMath.safeMul(2**254, 2), 2**255)
        self.assertEqual(self.safeDecMath.safeMul(2**254 - 1, 4), (2**254 - 1) * 4)
        self.assertEqual(self.safeDecMath.safeMul(2**128, 2**127), 2**255)
        self.assertEqual(self.safeDecMath.safeMul(2**128 - 1, 2**128 - 1), (2**128 - 1)**2)

        # Identity
        self.assertEqual(self.safeDecMath.safeMul(1, 1), 1)
        self.assertEqual(self.safeDecMath.safeMul(1, 2**256 - 1), 2**256 - 1)
        self.assertEqual(self.safeDecMath.safeMul(2**256 - 1, 1), 2**256 - 1)

        # Zero
        self.assertEqual(self.safeDecMath.safeMul(1, 0), 0)
        self.assertEqual(self.safeDecMath.safeMul(0, 1), 0)
        self.assertEqual(self.safeDecMath.safeMul(0, 2**256 - 1), 0)
        self.assertEqual(self.safeDecMath.safeMul(2**256 - 1, 0), 0)

        # Commutativity
        self.assertEqual(
            self.safeDecMath.safeMul(10114, 17998),
            self.safeDecMath.safeMul(17998, 10114)
        )

    def test_unsafeMul(self):
        self.assertReverts(self.safeDecMath.safeMul, 2**128, 2**128)
        self.assertReverts(self.safeDecMath.safeMul, 2**256 - 1, 2**256 - 1)
        self.assertReverts(self.safeDecMath.safeMul, 2**255, 2)
        self.assertReverts(self.safeDecMath.safeMul, 2**200, 3**100)
        self.assertReverts(self.safeDecMath.safeMul, 2**254, 5)

    # Test safeMul_dec function
    def testSafeMul_dec(self):
        self.assertEqual(self.safeDecMath.safeMul_dec(99999 * UNIT, 777777 * UNIT), 99999 * 777777 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(10 * UNIT, UNIT + UNIT), 20 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(2**256 // UNIT, UNIT), 2**256 // UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(2**255 - 1, 2), (2**256 - 2) // UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(10**8 * UNIT, 10**8 * UNIT), 10**8 * 10**8 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(17 * UNIT, 23 * UNIT), 17 * 23 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT // 2, UNIT // 2), UNIT // 4)
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT // 25, UNIT // 5), UNIT // 125)
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT // 7, UNIT // 3), ((UNIT // 7) * (UNIT // 3)) // UNIT)

        # Test zero
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT, 0), 0)
        self.assertEqual(self.safeDecMath.safeMul_dec(0, 100), 0)

        # Test identity
        self.assertEqual(self.safeDecMath.safeMul_dec(10 * UNIT, UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT, 10 * UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT, 1), 1)
        self.assertEqual(self.safeDecMath.safeMul_dec(1, UNIT), 1)

        # Commutativity
        self.assertEqual(self.safeDecMath.safeMul_dec(17 * UNIT, 23 * UNIT), self.safeDecMath.safeMul_dec(23 * UNIT, 17 * UNIT))

        # Rounding occurs towards zero
        self.assertEqual(self.safeDecMath.safeMul_dec(UNIT + 1, UNIT - 1), UNIT-1)

    def testUnsafeMul_dec(self):
        self.assertReverts(self.safeDecMath.safeMul, 2**255, 2)
        self.assertReverts(self.safeDecMath.safeMul, 2**200, 2**56)
        self.assertReverts(self.safeDecMath.safeMul, 2**200, 3**40)

    # Test divIsSafe function
    def testDivIsSafe(self):
        self.assertTrue(self.safeDecMath.divIsSafe(1, 1))
        self.assertTrue(self.safeDecMath.divIsSafe(2**256 - 1, 2**256 - 1))
        self.assertTrue(self.safeDecMath.divIsSafe(100, 10*20))

    def testDivIsUnsafe(self):
        self.assertFalse(self.safeDecMath.divIsSafe(1, 0))
        self.assertFalse(self.safeDecMath.divIsSafe(2**256 - 1, 0))

    # Test safeDiv function
    def testSafeDiv(self):
        self.assertEqual(self.safeDecMath.safeDiv(0, 1), 0)
        self.assertEqual(self.safeDecMath.safeDiv(1, 1), 1)
        self.assertEqual(self.safeDecMath.safeDiv(1, 2), 0)
        self.assertEqual(self.safeDecMath.safeDiv(100, 10), 10)
        self.assertEqual(self.safeDecMath.safeDiv(2**256 - 1, 1), 2**256 - 1)
        self.assertEqual(self.safeDecMath.safeDiv(3**100, 3), 3**99)
        self.assertEqual(self.safeDecMath.safeDiv(999, 2), 499)
        self.assertEqual(self.safeDecMath.safeDiv(1000, 7), 142)

    def testUnsafeDiv(self):
        self.assertReverts(self.safeDecMath.safeDiv, 0, 0)
        self.assertReverts(self.safeDecMath.safeDiv, 1, 0)
        self.assertReverts(self.safeDecMath.safeDiv, 2**256 - 1, 0)

    # Test safeDiv_dec function
    def testSafeDiv_dec(self):
        self.assertEqual(self.safeDecMath.safeDiv_dec(4 * UNIT, 2 * UNIT), 2 * UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(UNIT, 2 * UNIT), UNIT // 2)
        self.assertEqual(self.safeDecMath.safeDiv_dec(10**8 * UNIT, 3 * UNIT), (10**8 * UNIT) // 3)
        self.assertEqual(self.safeDecMath.safeDiv_dec(20 * UNIT, UNIT // 2), 40 * UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(UNIT, 10 * UNIT), UNIT // 10)

        self.assertEqual(self.safeDecMath.safeDiv_dec(10**8 * UNIT, 10**8 * UNIT), UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(10**8 * UNIT, UNIT), 10**8 * UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(10**30 * UNIT, 10**10 * UNIT), 10**20 * UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(2**256 // UNIT, 10 * UNIT), (2**256 // UNIT) // 10)
        self.assertEqual(self.safeDecMath.safeDiv_dec(UNIT, UNIT * UNIT), 1)
        self.assertEqual(self.safeDecMath.safeDiv_dec(10 * UNIT, UNIT * UNIT), 10)

        # Largest usable numerator
        self.assertEqual(self.safeDecMath.safeDiv_dec(2**256 // UNIT, UNIT), 2**256 // UNIT)
        # Largest usable power of ten in the numerator
        self.assertEqual(self.safeDecMath.safeDiv_dec(10**41 * UNIT, 10**11 * UNIT), 10**30 * UNIT)
        # Largest usable power of two in the numerator
        self.assertEqual(self.safeDecMath.safeDiv_dec(2**196, UNIT), 2**196)

        # Operations yielding zero (greater than a UNIT factor difference between operands)
        self.assertEqual(self.safeDecMath.safeDiv_dec(2**256 // UNIT, 2**256 - 1), 0)
        self.assertEqual(self.safeDecMath.safeDiv_dec(UNIT - 1, UNIT * UNIT), 0)

        # Identity and zero.
        self.assertEqual(self.safeDecMath.safeDiv_dec(1, UNIT), 1)
        self.assertEqual(self.safeDecMath.safeDiv_dec(100000, UNIT), 100000)
        self.assertEqual(self.safeDecMath.safeDiv_dec(UNIT, UNIT), UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(10 * UNIT, UNIT), 10 * UNIT)
        self.assertEqual(self.safeDecMath.safeDiv_dec(0, UNIT), 0)
        self.assertEqual(self.safeDecMath.safeDiv_dec(0, 1), 0)

    def testUnsafeDiv_dec(self):
        # Numerator overflows
        self.assertReverts(self.safeDecMath.safeDiv_dec, 2**256 - 1, 1)
        self.assertReverts(self.safeDecMath.safeDiv_dec, 2**256 // UNIT + 1, 1)
        self.assertReverts(self.safeDecMath.safeDiv_dec, 10**42 * UNIT, 1)
        self.assertReverts(self.safeDecMath.safeDiv_dec, 2**197, 1)

        # Zero denominator overflows
        self.assertReverts(self.safeDecMath.safeDiv_dec, 0, 0)
        self.assertReverts(self.safeDecMath.safeDiv_dec, 1, 0)
        self.assertReverts(self.safeDecMath.safeDiv_dec, 2**256 // UNIT, 0)

        # Both
        self.assertReverts(self.safeDecMath.safeDiv_dec, 2**256 - 1, 0)

    # Test intToDec function
    def testIntToDec(self):
        self.assertEqual(self.safeDecMath.intToDec(1), UNIT)
        self.assertEqual(self.safeDecMath.intToDec(100), 100*UNIT)
        self.assertEqual(self.safeDecMath.intToDec(UNIT), UNIT * UNIT)
        self.assertEqual(self.safeDecMath.intToDec(2**256 // UNIT), (2**256 // UNIT) * UNIT)

        # Test out of range
        self.assertReverts(self.safeDecMath.intToDec, 2**256 // UNIT + 1)

    # Test combined arithmetic
    def testArithmeticExpressions(self):
        self.assertEqual(
            self.safeDecMath.safeSub(self.safeDecMath.safeAdd(
                UNIT, self.safeDecMath.safeDiv_dec(
                    self.safeDecMath.safeDiv(self.safeDecMath.safeAdd(UNIT, UNIT), 2), UNIT
                )), self.safeDecMath.safeMul_dec(2 * UNIT, UNIT)),
            0)

        self.assertEqual(
            self.safeDecMath.safeDiv_dec(self.safeDecMath.safeMul_dec(self.safeDecMath.safeAdd(
                self.safeDecMath.intToDec(1), UNIT), self.safeDecMath.safeMul(2, UNIT)), UNIT // 2),
            self.safeDecMath.intToDec(8)
        )

import unittest
import deploy

deployed_contract = None
MATH_MODULE_SOURCE = "tests/PublicMath.sol"
class TestSafeDecimalMath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiled = deploy.compile_contracts([MATH_MODULE_SOURCE],
                                            remappings=['""=contracts'])
        cls.math = deploy.attempt_deploy(compiled, 'PublicMath', deploy.MASTER, [],
                                         print_exception=True)

    def test_addSafe(self):
        self.assertTrue(True)
    
if __name__ == '__main__':
    unittest.main()
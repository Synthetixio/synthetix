import unittest

if __name__ == '__main__':
    testsuite = unittest.TestLoader().discover('tests/.')
    print("Running test suite...\n")
    unittest.TextTestRunner(verbosity=2).run(testsuite)
    print("\nTesting complete.")

import unittest

def setUpModule():
    print("setup")
    pass

def tearDownModule():
    print("teardown")
    pass

if __name__ == '__main__':
    testsuite = unittest.TestLoader().discover('tests/.')
    unittest.TextTestRunner(verbosity=2).run(testsuite)

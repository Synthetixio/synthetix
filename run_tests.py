from unittest import TestSuite, TestLoader, TextTestRunner
from utils.generalutils import load_test_settings, ganache_error_message

raised_exception = False
try:
    from tests import *
except:
    # use boolean to hide multiple exceptions printing out from requests library
    raised_exception = True

if raised_exception:
    raise Exception(ganache_error_message)


if __name__ == '__main__':
    test_settings = load_test_settings()

    test_suite = TestSuite()
    loader = TestLoader()
    for item in test_settings:
        if test_settings[item]:
            test_suite.addTests(loader.loadTestsFromModule(getattr(tests, item)))

    print("Running test suite...\n")
    TextTestRunner(verbosity=2).run(test_suite)
    print("\nTesting complete.")

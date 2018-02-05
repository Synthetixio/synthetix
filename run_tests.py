from unittest import TestSuite, TestLoader, TextTestRunner
import subprocess
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
    test_suite = TestSuite()

    ver = str(subprocess.check_output(['npm', 'list', 'ganache-cli']))
    if ver.split("@")[-1].split(" ")[0] != "6.1.0-beta.0":
        raise Exception("Please install ganache-cli beta by running `npm install -g ganache-cli@6.1.0-beta.0`")

    test_settings = load_test_settings()

    test_suite = TestSuite()
    loader = TestLoader()
    for item in test_settings:
        if test_settings[item]:
            test_suite.addTests(loader.loadTestsFromModule(getattr(tests, item)))

    print("Running test suite...\n")
    TextTestRunner(verbosity=2).run(test_suite)
    print("\nTesting complete.")

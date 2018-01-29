from unittest import TestSuite, TestLoader, TextTestRunner
from tests import *

run_test = {
    'Court': True,
    'Deploy': True,
    'ERC20FeeToken': True,
    'ERC20Token': True,
    'EtherNomin': True,
    'Havven': True,
    'Owned': True,
    'SafeDecimalMath': True,
    'Upgrade': True
}


def refresh_test_settings():
    with open("utils/test_settings.py", 'w') as f:
        f.write("run_test = {\n")
        for test_name in run_test:
            f.write(f"    '{test_name}': True,\n")
        f.write('}\n')


try:
    from utils.test_settings import run_test as r
    for item in run_test:
        if item not in r:
            raise ImportError
    run_test = r
except ImportError:
    refresh_test_settings()


if __name__ == '__main__':
    test_suite = TestSuite()
    loader = TestLoader()
    if run_test['Court']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_Court))
    if run_test['Deploy']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_Deploy))
    if run_test['ERC20FeeToken']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_ERC20FeeToken))
    if run_test['ERC20Token']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_ERC20Token))
    if run_test['EtherNomin']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_EtherNomin))
    if run_test['Havven']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_Havven))
    if run_test['Owned']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_Owned))
    if run_test['SafeDecimalMath']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_SafeDecimalMath))
    if run_test['Upgrade']:
        test_suite.addTests(loader.loadTestsFromModule(tests.test_Upgrade))

    print("Running test suite...\n")
    TextTestRunner(verbosity=2).run(test_suite)
    print("\nTesting complete.")

#!/usr/local/bin/python3

import sys
import os
import subprocess
import time
from unittest import TestSuite, TestLoader, TextTestRunner
from utils.generalutils import load_test_settings, ganache_error_message

if __name__ == '__main__':
    num_agents = "150"
    eth_per_agent = "1000000000000"
    block_gas_limit = "0x7a213a" # From mainnet on 2018-08-10

    print("Launching ganache", end="", flush=True)
    DEVNULL = open(os.devnull, 'wb')
    command = ["ganache-cli", "-a", num_agents, "-e", eth_per_agent, "-l", block_gas_limit]

    try:
        process = subprocess.Popen(command, stdout=DEVNULL, stderr=subprocess.STDOUT)
    except Exception as e:
        raise Exception(ganache_error_message)

    # Wait for ganache to initialise properly.
    time.sleep(1)
    for _ in range(3):
        print(".", end="", flush=True)
        time.sleep(1)
    print(" Done!")

    # Import here to only initiate RPC connection after ganache is running.
    from tests import *

    test_settings = load_test_settings()

    test_suite = TestSuite()
    loader = TestLoader()
    for item in test_settings:
        if test_settings[item]:
            test_suite.addTests(loader.loadTestsFromModule(getattr(tests, item)))

    print("Running test suite...\n")
    result = TextTestRunner(verbosity=2).run(test_suite)
    from utils.deployutils import PERFORMANCE_DATA

    for i in PERFORMANCE_DATA:
        for j in PERFORMANCE_DATA[i]:
            vals = PERFORMANCE_DATA[i][j]
            # (avg, min, max, calls)
            PERFORMANCE_DATA[i][j] = (vals[0]//vals[1], vals[2], vals[3], vals[1])

    PERFORMANCE_DATA['CONTRACT'] = {'METHOD': ['AVG_GAS', 'MIN_GAS', 'MAX_GAS', "CALLS"]}
    num_fields = len(PERFORMANCE_DATA['CONTRACT']['METHOD'])

    # PRINT TABLE | CONTRACT | METHOD | AVG GAS | MIN GAS | MAX GAS | CALLS |
    max_contract_name = max([len(i) for i in list(PERFORMANCE_DATA.keys())])
    max_method_name = max([max([len(str(i)) for i in PERFORMANCE_DATA[j].keys()]) for j in PERFORMANCE_DATA.keys()])
    max_gas_len = max([max([max([len(str(i)) for i in PERFORMANCE_DATA[k][j]]) for j in PERFORMANCE_DATA[k]]) for k in PERFORMANCE_DATA])

    print("\nGas performance data")
    current = 'CONTRACT'
    remaining = sorted(list(PERFORMANCE_DATA.keys()))
    remaining.pop(remaining.index('CONTRACT'))

    print('┌' + '─'*(2 + max_contract_name) + '┬' +
          '─'*(2 + max_method_name) + '┬' +
          ('─'*(2 + max_gas_len) + '┬')*(num_fields - 1) + '─'*(2 + max_gas_len) + '┐')
    while True:
        for method in sorted(PERFORMANCE_DATA[current].keys()):
            vals = PERFORMANCE_DATA[current][method]
            print('│ ' + current + ' '*(1 + max_contract_name - len(current)) + '│ '
                  + str(method) + ' '*(1 + max_method_name - len(str(method))) + '│ '
                  + ''.join([str(i) + ' ' * (1 + max_gas_len - len(str(i))) + '│ ' for i in vals])
            )
        if len(remaining) == 0:
            break
        print('├' + '─'*(2 + max_contract_name) + '┼' +
              '─'*(2 + max_method_name) + '┼' +
              ('─'*(2 + max_gas_len) + '┼')*(num_fields - 1) + '─'*(2 + max_gas_len) + '┤')
        current = remaining.pop(0)
    print('└' + '─'*(2 + max_contract_name) + '┴' +
          '─'*(2 + max_method_name) + '┴' +
          ('─'*(2 + max_gas_len) + '┴')*(num_fields - 1) + '─'*(2 + max_gas_len) + '┘')

    process.terminate()

    print("\nTesting complete.")

    sys.exit(0 if result.wasSuccessful() else 1)

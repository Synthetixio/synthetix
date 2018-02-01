from utils.deployutils import mine_tx, W3


def current_block_time(block_num=None):
    if block_num is None:
        block_num = W3.eth.blockNumber
    return W3.eth.getBlock(block_num)['timestamp']


def assertCallReverts(testcase, function):
    with testcase.assertRaises(ValueError) as error:
        function.call()
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    testcase.assertEqual(-32000, error.exception.args[0]['code'])


def assertTransactionReverts(testcase, function, caller, gas=5000000):
    with testcase.assertRaises(ValueError) as error:
        mine_tx(function.transact({'from': caller, 'gas': gas}))
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    testcase.assertEqual(-32000, error.exception.args[0]['code'])


def assertFunctionReverts(testcase, function, *args):
    with testcase.assertRaises(ValueError) as error:
        function(*args)
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    testcase.assertEqual(-32000, error.exception.args[0]['code'])


def assertClose(testcase, actual, expected, precision=5, msg=''):
    if expected == 0:
        if actual == 0:
            # this should always pass
            testcase.assertEqual(actual, expected)
        else:
            testcase.assertAlmostEqual(
                expected/actual,
                1,
                places=precision,
                msg=msg+f'\n{actual} ≉ {expected}'
            )
    else:
        testcase.assertAlmostEqual(
            actual/expected,
            1,
            places=precision,
            msg=msg+f'\n{actual} ≉ {expected}'
        )

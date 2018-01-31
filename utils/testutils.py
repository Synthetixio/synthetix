from utils.deployutils import mine_tx

def assertReverts(testcase, function, args=[]):
    with testcase.assertRaises(ValueError) as error:
        function(*args)
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    testcase.assertEqual(-32000, error.exception.args[0]['code'])

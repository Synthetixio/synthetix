from utils.deployutils import mine_tx, W3

def assertReverts(testcase, function, *args):
    with testcase.assertRaises(ValueError) as error:
        function(*args)
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    # ganache-cli beta 6.1.0 does not include a code field.
    # testcase.assertEqual(-32000, error.exception.args[0]['code'])

def block_time(block_num=None):
    if block_num is None:
        block_num = W3.eth.blockNumber
    return W3.eth.getBlock(block_num)['timestamp']

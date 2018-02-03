from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

from utils.deployutils import mine_tx, W3


def current_block_time(block_num=None):
    if block_num is None:
        block_num = W3.eth.blockNumber
    return W3.eth.getBlock(block_num)['timestamp']


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


def assertReverts(testcase, function, *args):
    with testcase.assertRaises(ValueError) as error:
        function(*args)
    testcase.assertTrue("revert" in error.exception.args[0]['message'])
    # The ganache-cli 6.1.0 beta does not include the error code
    # testcase.assertEqual(-32000, error.exception.args[0]['code'])


def generate_topic_event_map(abi):
    events = {}
    for e in abi:
        try:
            if e['type'] == 'event':
                events[event_abi_to_log_topic(e)] = e
        except:
            pass
    return events


def get_event_data_from_log(topic_event_map, log):
    try:
        return get_event_data(topic_event_map[log.topics[0]], log)
    except KeyError:
        return None

from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

from utils.deployutils import mine_tx, W3

ZERO_ADDRESS = "0x" + "0" * 40


def assertClose(testcase, actual, expected, precision=5, msg=''):
    if expected == 0:
        if actual == 0:
            # this should always pass
            testcase.assertEqual(actual, expected)
            return
        expected, actual = actual, expected

    testcase.assertAlmostEqual(
        actual / expected,
        1,
        places=precision,
        msg=msg + f'\n{actual} ≉ {expected}'
    )


def assertReverts(testcase, function, *args):
    with testcase.assertRaises(ValueError) as error:
        function(*args)
    testcase.assertTrue("revert" in error.exception.args[0]['message'])


def block_time(block_num=None):
    if block_num is None:
        block_num = W3.eth.blockNumber
    return W3.eth.getBlock(block_num)['timestamp']


def send_value(sender, recipient, value):
    return mine_tx(W3.eth.sendTransaction({'from': sender, 'to': recipient, 'value': value}))


def get_eth_balance(account):
    return W3.eth.getBalance(account)


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

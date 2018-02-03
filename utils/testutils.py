from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

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

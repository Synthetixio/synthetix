import unittest

from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

from utils.deployutils import mine_txs, W3, compile_contracts, attempt

ZERO_ADDRESS = "0x" + "0" * 40


class HavvenTestCase(unittest.TestCase):
    event_maps = {}
    event_map = {}

    def assertReverts(self, func, *args):
        with self.assertRaises(ValueError) as error:
            func(*args)
        self.assertTrue("revert" in error.exception.args[0]['message'])

    def assertEventEquals(self, event_map, log, event_name, fields=None, location=None):
        if fields is None:
            fields = {}
        event_data = get_event_data_from_log(event_map, log)
        self.assertIsNotNone(event_data)
        self.assertEqual(event_data['event'], event_name)

        # Iterate through the event data rather than the fields parameter
        # to ensure that all fields of the event are checked.
        self.assertEqual(len(fields), len(event_data['args']))
        for k, v in event_data['args'].items():
            self.assertEqual(fields[k], v, msg=f"\nField: <{k}> For event: <{event_name}>")
        if location:
            self.assertEqual(event_data['address'], location)

    def assertClose(self, actual, expected, precision=5, msg=''):
        if expected == 0:
            if actual == 0:
                # this should always pass
                self.assertEqual(actual, expected)
                return
            expected, actual = actual, expected

        self.assertAlmostEqual(
            actual / expected,
            1,
            places=precision,
            msg=msg + f'\n{actual} ≉ {expected}'
        )

    @classmethod
    def compileAndMapEvents(cls, source_paths, remappings=None):
        if remappings is None:
            remappings = []
        compiled = attempt(compile_contracts, [source_paths], "Compiling contracts...",
                           func_kwargs={'remappings': remappings})
        event_maps = {name: generate_topic_event_map(compiled[name]['abi'])
                      for name in compiled}
        return compiled, event_maps


def block_time(block_num=None):
    if block_num is None:
        block_num = W3.eth.blockNumber
    return W3.eth.getBlock(block_num)['timestamp']


def send_value(sender, recipient, value):
    return mine_txs([W3.eth.sendTransaction({'from': sender, 'to': recipient, 'value': value})])


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

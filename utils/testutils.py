import unittest

from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

from utils.deployutils import mine_tx, W3, compile_contracts, attempt

ZERO_ADDRESS = "0x" + "0" * 40


class HavvenTestCase(unittest.TestCase):
    def assertReverts(self, function, *args):
        with self.assertRaises(ValueError) as error:
            function(*args)
        self.assertTrue("revert" in error.exception.args[0]['message'])

    def assertEventEquals(self, log, event_name, fields=None, contract=None):
        if fields is None:
            fields = {}
        event_map = self.event_maps[contract] if contract is not None else self.event_map
        event_data = get_event_data_from_log(event_map, log)
        self.assertEqual(event_data['event'], event_name)
        for k, v in event_data['args'].items():
            self.assertEqual(fields[k], v)

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
    def setUpHavvenTestClass(cls, source_paths, remappings=None, event_primary=None):
        if remappings is None:
            remappings = []
        cls.compiled = attempt(compile_contracts, [source_paths], "Compiling contracts...",
                               func_kwargs={'remappings': remappings})
        cls.event_maps = {name: generate_topic_event_map(cls.compiled[name]['abi'])
                          for name in cls.compiled}
        primary_contract = event_primary if event_primary is not None else list(cls.event_maps.keys())[0]
        cls.event_map = cls.event_maps[primary_contract]


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

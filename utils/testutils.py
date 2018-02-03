from web3.utils.events import get_event_data
from eth_utils import event_abi_to_log_topic

from utils.deployutils import mine_tx

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

def assertReverts(testcase, function, args=[]):
	with testcase.assertRaises(ValueError) as error:
		function(*args)
	testcase.assertTrue("revert" in error.exception.args[0]['message'])
	testcase.assertEqual(-32000, error.exception.args[0]['code'])

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

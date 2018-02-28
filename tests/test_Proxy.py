import unittest
import time

import utils.generalutils
from utils.generalutils import to_seconds
from utils.deployutils import W3, UNIT, MASTER, DUMMY, ETHER
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx
from utils.deployutils import take_snapshot, restore_snapshot, fast_forward
from utils.testutils import assertReverts, block_time, send_value, get_eth_balance
from utils.testutils import generate_topic_event_map, get_event_data_from_log
from utils.testutils import ZERO_ADDRESS


ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"
FAKECOURT_SOURCE = "tests/contracts/FakeCourt.sol"
PROXY_SOURCE = "contracts/Proxy.sol"


def setUpModule():
    print("Testing Proxy...")


def tearDownModule():
    print()


class TestProxy(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([ETHERNOMIN_SOURCE, FAKECOURT_SOURCE, PROXY_SOURCE],
                                     remappings=['""=contracts'])
        cls.nomin_abi = compiled['PublicEtherNomin']['abi']

        cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

        cls.nomin_havven = W3.eth.accounts[1]
        cls.nomin_oracle = W3.eth.accounts[2]
        cls.nomin_beneficiary = W3.eth.accounts[3]
        cls.nomin_owner = W3.eth.accounts[0]

        cls.nomin, cls.construction_txr = attempt_deploy(compiled, 'PublicEtherNomin', MASTER,
                                                         [cls.nomin_havven, cls.nomin_oracle, cls.nomin_beneficiary,
                                                          UNIT, cls.nomin_owner, ZERO_ADDRESS])

        cls.proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER,
                                      [cls.nomin.address, MASTER])

        cls.proxy_nomin = W3.eth.contract(address=cls.proxy.address, abi=cls.nomin_abi)

        cls.construction_price_time = cls.nomin.functions.lastPriceUpdate().call()
        cls.initial_time = cls.construction_price_time

        cls.fake_court, _ = attempt_deploy(compiled, 'FakeCourt', MASTER, [])

        cls.fake_court.setNomin = lambda sender, new_nomin: mine_tx(cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court.setConfirming = lambda sender, target, status: mine_tx(cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court.setVotePasses = lambda sender, target, status: mine_tx(cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court.setTargetMotionID = lambda sender, target, motion_id: mine_tx(cls.fake_court.functions.setTargetMotionID(target, motion_id).transact({'from': sender}))
        cls.fake_court.confiscateBalance = lambda sender, target: mine_tx(cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        cls.fake_court.setNomin(W3.eth.accounts[0], cls.nomin.address)
        mine_tx(cls.nomin.functions.setProxy(cls.proxy.address).transact({'from': cls.nomin_owner}))
        mine_tx(cls.proxy_nomin.functions.setCourt(cls.fake_court.address).transact({'from': cls.nomin_owner}))

        cls.issue = lambda self, sender, n, value: mine_tx(cls.nomin.functions.issue(n).transact({'from': sender, 'value': value}))
        cls.burn = lambda self, sender, n: mine_tx(cls.nomin.functions.burn(n).transact({'from': sender}))
        cls.buy = lambda self, sender, n, value: mine_tx(cls.nomin.functions.buy(n).transact({'from': sender, 'value': value}))
        cls.sell = lambda self, sender, n: mine_tx(cls.nomin.functions.sell(n).transact({'from': sender, 'gasPrice': 10}))
        cls.purchaseCostEther = lambda self, n: cls.nomin.functions.purchaseCostEther(n).call()
        cls.etherValue = lambda self, fiat: cls.nomin.functions.etherValue(fiat).call()

        cls.priceIsStale = lambda self: cls.nomin.functions.priceIsStale().call()
        cls.isLiquidating = lambda self: cls.nomin.functions.isLiquidating().call()

        cls.setMetropolis = lambda self, sender, value: mine_tx(cls.proxy.functions._setMetropolis(value).transact({'from': sender}))

    def test_Something(self):
        backing = self.etherValue(10 * UNIT)
        self.issue(self.nomin_owner, UNIT, backing)
        self.buy(self.nomin_beneficiary, UNIT, self.purchaseCostEther(UNIT))
        self.setMetropolis(MASTER, True)

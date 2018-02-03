import unittest

from utils.deployutils import W3, compile_contracts, attempt_deploy, mine_tx, UNIT, MASTER, DUMMY, fresh_account
from utils.testutils import assertReverts


ETHERNOMIN_SOURCE = "tests/contracts/PublicEtherNomin.sol"

def setUpModule():
    print("Testing EtherNomin...")

def tearDownModule():
    print()

class TestEtherNomin(unittest.TestCase):
    def test_Constructor(self):
        pass



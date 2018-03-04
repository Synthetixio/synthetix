import unittest

from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, MASTER, DUMMY
from utils.deployutils import take_snapshot, restore_snapshot
from utils.testutils import assertReverts, ZERO_ADDRESS
from utils.testutils import generate_topic_event_map, get_event_data_from_log

OWNED_SOURCE = "contracts/Owned.sol"


def setUpModule():
    print("Testing Owned...")


def tearDownModule():
    print()


class TestOwned(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        compiled = compile_contracts([OWNED_SOURCE])
        cls.owned, txr = attempt_deploy(compiled, 'Owned', MASTER, [MASTER])

        cls.owner = lambda self: cls.owned.functions.owner().call()
        cls.nominatedOwner = lambda self: cls.owned.functions.nominatedOwner().call()
        cls.nominateOwner = lambda self, sender, newOwner: mine_tx(
            cls.owned.functions.nominateOwner(newOwner).transact({'from': sender}))
        cls.acceptOwnership = lambda self, sender: mine_tx(
            cls.owned.functions.acceptOwnership().transact({'from': sender}))

        cls.owned_event_map = generate_topic_event_map(compiled['Owned']['abi'])

    def test_owner_is_master(self):
        self.assertEqual(self.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.owner()
        new_owner = DUMMY

        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        nominated_tx = self.nominateOwner(old_owner, new_owner)
        event_data = get_event_data_from_log(self.owned_event_map, nominated_tx.logs[0])
        self.assertEqual(event_data['event'], "NewOwnerNominated")
        self.assertEqual(event_data['args']['newOwner'], new_owner)

        self.assertEqual(self.owner(), old_owner)
        self.assertEqual(self.nominatedOwner(), new_owner)
        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        accepted_tx = self.acceptOwnership(new_owner)
        event_data = get_event_data_from_log(self.owned_event_map, accepted_tx.logs[0])
        self.assertEqual(event_data['event'], "OwnerChanged")
        self.assertEqual(event_data['args']['oldOwner'], old_owner)
        self.assertEqual(event_data['args']['newOwner'], new_owner)

        self.assertEqual(self.nominatedOwner(), ZERO_ADDRESS)
        self.assertEqual(self.owner(), new_owner)
        self.assertReverts(self.nominateOwner, old_owner, new_owner)

        self.nominateOwner(new_owner, old_owner)
        self.acceptOwnership(old_owner)
        self.assertEqual(self.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.nominateOwner, invalid_account, invalid_account)

    def test_undo_change_owner(self):
        old_owner = self.owner()
        new_owner = DUMMY

        self.assertReverts(self.nominateOwner, new_owner, old_owner)
        self.nominateOwner(old_owner, new_owner)
        self.nominateOwner(old_owner, ZERO_ADDRESS)
        self.assertReverts(self.acceptOwnership, new_owner)

from utils.deployutils import (
    MASTER, DUMMY,
    attempt_deploy,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS
)
from tests.contract_interfaces.owned_interface import OwnedInterface




def setUpModule():
    print("Testing Owned...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestOwned(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        sources = ["contracts/Owned.sol"]

        cls.compiled, cls.event_maps = cls.compileAndMapEvents(sources)
        cls.event_map = cls.event_maps['Owned']

        cls.owned_contract, cls.deploy_tx = attempt_deploy(cls.compiled, 'Owned', MASTER, [MASTER])
        cls.owned = OwnedInterface(cls.owned_contract, "Owned")

    def test_constructor(self):
        self.assertEqual(self.owned.owner(), MASTER)
        self.assertEqual(self.owned.nominatedOwner(), ZERO_ADDRESS)
        self.assertEventEquals(self.event_map, self.deploy_tx.logs[0],
                               "OwnerChanged",
                               {"oldOwner": ZERO_ADDRESS,
                                "newOwner": MASTER},
                               location=self.owned_contract.address)

    def test_change_owner(self):
        old_owner = self.owned.owner()
        new_owner = DUMMY
        self.assertNotEqual(old_owner, new_owner)

        # Only the owner may nominate a new owner.
        self.assertReverts(self.owned.nominateNewOwner, new_owner, old_owner)

        # Nominate new owner and ensure event emitted properly.
        nominated_tx = self.owned.nominateNewOwner(old_owner, new_owner)
        self.assertEventEquals(self.event_map, nominated_tx.logs[0],
                               "OwnerNominated",
                               {"newOwner": new_owner},
                               location=self.owned_contract.address)

        # Ensure owner unchanged, nominated owner was set properly.
        self.assertEqual(self.owned.owner(), old_owner)
        self.assertEqual(self.owned.nominatedOwner(), new_owner)

        # Ensure only the nominated owner can accept the ownership.
        self.assertReverts(self.owned.acceptOwnership, old_owner)
        # But the nominee gains no other privileges.
        self.assertReverts(self.owned.nominateNewOwner, new_owner, old_owner)

        # Accept ownership and ensure event emitted properly.
        accepted_tx = self.owned.acceptOwnership(new_owner)
        self.assertEventEquals(self.event_map, accepted_tx.logs[0],
                               "OwnerChanged",
                               {"oldOwner": old_owner,
                                "newOwner": new_owner},
                               location=self.owned_contract.address)

        # Ensure owner changed, nominated owner reset to zero.
        self.assertEqual(self.owned.nominatedOwner(), ZERO_ADDRESS)
        self.assertEqual(self.owned.owner(), new_owner)

        # The old owner may no longer nominate a new owner.
        self.assertReverts(self.owned.nominateNewOwner, old_owner, new_owner)

        # Go backwards.
        self.owned.nominateNewOwner(new_owner, old_owner)
        self.owned.acceptOwnership(old_owner)
        self.assertEqual(self.owned.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.owned.nominateNewOwner, invalid_account, invalid_account)

    def test_undo_change_owner(self):
        old_owner = self.owned.owner()
        new_owner = DUMMY

        self.assertReverts(self.owned.nominateNewOwner, new_owner, old_owner)
        self.owned.nominateNewOwner(old_owner, new_owner)
        self.owned.nominateNewOwner(old_owner, ZERO_ADDRESS)
        self.assertReverts(self.owned.acceptOwnership, new_owner)

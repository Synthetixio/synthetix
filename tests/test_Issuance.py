from utils.deployutils import (
    W3, MASTER, DUMMY, UNIT,
    attempt, attempt_deploy, compile_contracts,
    mine_txs, mine_tx,
    fast_forward, fresh_account,
    take_snapshot, restore_snapshot
)
from utils.testutils import HavvenTestCase, ZERO_ADDRESS, block_time
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_escrow_interface import PublicHavvenEscrowInterface
from tests.contract_interfaces.court_interface import FakeCourtInterface


def setUpModule():
    print("Testing Issuance...")


def tearDownModule():
    print()


class TestIssuance(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = ["contracts/Havven.sol", "tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                   "tests/contracts/FakeCourt.sol", "tests/contracts/PublicHavvenEscrow.sol"]
        print("Deployment initiated.\n")

        cls.compiled, cls.event_maps = cls.compileAndMapEvents(sources, remappings=['""=contracts'])

        # Deploy contracts
        cls.havven_contract, hvn_txr = attempt_deploy(cls.compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER, MASTER])

        cls.nomin_contract, nom_txr = attempt_deploy(cls.compiled, 'PublicNomin',
                                                     MASTER,
                                                     [cls.havven_contract.address, MASTER, ZERO_ADDRESS])
        cls.court_contract, court_txr = attempt_deploy(cls.compiled, 'FakeCourt',
                                                       MASTER,
                                                       [cls.havven_contract.address, cls.nomin_contract.address,
                                                       MASTER])
        cls.escrow_contract, escrow_txr = attempt_deploy(cls.compiled, 'PublicHavvenEscrow',
                                                         MASTER,
                                                         [MASTER, cls.havven_contract.address])

        # Hook up each of those contracts to each other
        txs = [cls.havven_contract.functions.setNomin(cls.nomin_contract.address).transact({'from': MASTER}),
               cls.nomin_contract.functions.setCourt(cls.court_contract.address).transact({'from': MASTER}),
               cls.nomin_contract.functions.setHavven(cls.havven_contract.address).transact({'from': MASTER}),
               cls.havven_contract.functions.setEscrow(cls.escrow_contract.address).transact({'from': MASTER})]
        attempt(mine_txs, [txs], "Linking contracts... ")

        print("\nDeployment complete.\n")

    @classmethod
    def setUpClass(cls):
        cls.deployContracts()
        cls.havven = PublicHavvenInterface(cls.havven_contract, "Havven")
        cls.nomin = PublicNominInterface(cls.nomin_contract, "Nomin")
        cls.escrow = PublicHavvenEscrowInterface(cls.escrow_contract, "HavvenEscrow")
        cls.fake_court = FakeCourtInterface(cls.court_contract, "FakeCourt")

        fast_forward(weeks=102) 

        cls.fake_court.setNomin(MASTER, cls.nomin_contract.address)

    def test_issue(self):
        self.havven.endow(MASTER, MASTER, 1000 * UNIT)
        self.havven.setWhitelisted(MASTER, MASTER, True)

        self.assertEqual(self.havven.balanceOf(MASTER), 1000 * UNIT)

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.issueNomins(MASTER, 5 * UNIT)

        self.assertEqual(self.nomin_contract.functions.balanceOf(MASTER).call(), 5 * UNIT)

    def test_issue_against_escrowed(self):
        alice = fresh_account()
        self.havven.endow(MASTER, self.escrow.contract.address, self.havven.totalSupply())
        self.escrow.appendVestingEntry(MASTER, alice, block_time() + 100000, self.havven.totalSupply() // 2)

        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.issueNomins(alice, 100 * UNIT)

        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.assertEqual(self.nomin.balanceOf(alice), 100 * UNIT)
        self.assertClose(self.havven.availableHavvens(alice) + 100 * UNIT / (self.havven.issuanceRatio() / UNIT), self.havven.totalSupply() // 2)

    def test_issuance_price_shift(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 1000 * UNIT)

        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.issueNomins(alice, 10 * UNIT)
        self.assertEqual(self.havven.availableHavvens(alice), 800 * UNIT)
        fast_forward(2)
        self.havven.updatePrice(self.havven.oracle(), 100 * UNIT, self.havven.currentTime() + 1)
        self.assertEqual(self.havven.availableHavvens(alice), 998 * UNIT)
        fast_forward(2)
        self.havven.updatePrice(self.havven.oracle(), int(0.01 * UNIT), self.havven.currentTime() + 1)
        self.assertEqual(self.havven.availableHavvens(alice), 0)

        self.assertReverts(self.havven.transfer, alice, MASTER, 1)

        fast_forward(2)
        self.havven.updatePrice(self.havven.oracle(), 1 * UNIT, self.havven.currentTime() + 1)
        self.havven.transfer(alice, MASTER, 800 * UNIT)
        self.assertReverts(self.havven.transfer, alice, MASTER, 200 * UNIT)
        self.havven.burnNomins(alice, 10 * UNIT)
        self.havven.transfer(alice, MASTER, 200 * UNIT)
        self.assertEqual(self.nomin.balanceOf(alice), 0)
        self.assertEqual(self.nomin.balanceOf(MASTER), 0)
        self.assertEqual(self.havven.balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.assertEqual(self.havven.nominsIssued(alice), 0)

    def test_issue_revert_conditions(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 1000 * UNIT)
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.assertReverts(self.havven.issueNomins, alice, 10 * UNIT)  # reverts, as not whitelisted
        self.havven.setWhitelisted(MASTER, alice, True)
        fast_forward(days=1)  # fast forward to make price stale
        self.assertReverts(self.havven.issueNomins, alice, 10 * UNIT)  # reverts, as price is stale
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.assertReverts(self.havven.issueNomins, alice, 1000 * UNIT)  # reverts, as too many nomins being issued
        self.havven.setIssuanceRatio(MASTER, 0)
        self.assertReverts(self.havven.issueNomins, alice, 10 * UNIT)  # reverts, as CMAX too low (0)
        self.havven.setIssuanceRatio(MASTER, int(0.05 * UNIT))
        self.havven.issueNomins(alice, self.havven.maxIssuanceRights(alice))
        self.assertEqual(self.havven.nominsIssued(alice), 50 * UNIT)
        self.assertReverts(self.havven.issueNomins, alice, self.havven.maxIssuanceRights(alice))
        self.assertEqual(self.havven.remainingIssuanceRights(alice), 0)
        self.havven.issueNomins(alice, self.havven.remainingIssuanceRights(alice))

    def test_burn(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 1000 * UNIT)
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)
        self.havven.issueNomins(alice, 50 * UNIT)
        for i in range(50):
            self.havven.burnNomins(alice, 1 * UNIT)
        self.assertEqual(self.havven.nominsIssued(alice), 0)
        self.assertEqual(self.nomin.balanceOf(alice), 0)



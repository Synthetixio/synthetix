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


def setUpModule():
    print("Testing Issuance...")


def tearDownModule():
    print()


class TestIssuance(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @staticmethod
    def deployContracts():
        sources = ["contracts/Havven.sol", "tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                   "tests/contracts/FakeCourt.sol", "tests/contracts/PublicHavvenEscrow.sol"]
        print("Deployment initiated.\n")

        compiled = attempt(compile_contracts, [sources], "Compiling contracts... ")

        # Deploy contracts
        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [ZERO_ADDRESS, MASTER, MASTER])

        nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicNomin',
                                                 MASTER,
                                                 [havven_contract.address, MASTER, ZERO_ADDRESS])
        court_contract, court_txr = attempt_deploy(compiled, 'FakeCourt',
                                                   MASTER,
                                                   [havven_contract.address, nomin_contract.address,
                                                    MASTER])
        escrow_contract, escrow_txr = attempt_deploy(compiled, 'PublicHavvenEscrow',
                                                     MASTER,
                                                     [MASTER, havven_contract.address])

        # Hook up each of those contracts to each other
        txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
               nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}),
               nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
               havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})]
        attempt(mine_txs, [txs], "Linking contracts... ")

        print("\nDeployment complete.\n")
        return havven_contract, nomin_contract, court_contract, escrow_contract

    @classmethod
    def setUpClass(cls):
        cls.havven_contract, cls.nomin_contract, cls.fake_court, cls.escrow_contract = cls.deployContracts()

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = PublicNominInterface(cls.nomin_contract)
        cls.escrow = PublicHavvenEscrowInterface(cls.escrow_contract)

        fast_forward(weeks=102)

        cls.fake_court_setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court_setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court_setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court_confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        
        cls.fake_court_setNomin(W3.eth.accounts[0], cls.nomin_contract.address)

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



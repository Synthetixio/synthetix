import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_account, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, assertClose, ZERO_ADDRESS, block_time

from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_escrow_interface import PublicHavvenEscrowInterface

SOLIDITY_SOURCES = ["contracts/Havven.sol", "tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                    "tests/contracts/FakeCourt.sol", "tests/contracts/PublicHavvenEscrow.sol"]


def deploy_public_contracts():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

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


def setUpModule():
    print("Testing Issuance...")


def tearDownModule():
    print()


class TestIssuance(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.havven_contract, cls.nomin_contract, cls.fake_court, cls.escrow_contract = deploy_public_contracts()

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = PublicNominInterface(cls.nomin_contract)
        cls.escrow = PublicHavvenEscrowInterface(cls.escrow_contract)

        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
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
        self.assertClose(self.havven.availableHavvens(alice) + 100 * UNIT / (self.havven.CMax() / UNIT), self.havven.totalSupply() // 2)

    def test_price_shift(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 1000 * UNIT)
        self.havven.setWhitelisted(MASTER, alice, True)
        self.havven.

from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    mine_tx, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot, fast_forward
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
)
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_interface import HavvenInterface
from tests.contract_interfaces.nomin_airdropper_interface import NominAirdropperInterface


def setUpModule():
    print("Testing Nomin Airdropper...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestNominAirdropper(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = ["tests/contracts/PublicNomin.sol", "contracts/NominAirdropper.sol", "contracts/Havven.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['Havven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['PublicNomin']['abi'])

        nomin_state, txr = attempt_deploy(
            compiled, "TokenState", MASTER,
            [MASTER, MASTER]
        )
        nomin_contract, _ = attempt_deploy(
            compiled, 'PublicNomin', MASTER, [nomin_proxy.address, nomin_state.address, MASTER, 0, MASTER]
        )

        havven_contract, _ = attempt_deploy(
            compiled, "Havven", MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER, UNIT//2, [], ZERO_ADDRESS]
        )

        airdropper_contract, _ = attempt_deploy(
            compiled, 'NominAirdropper', MASTER, [MASTER]
        )

        mine_txs([
            nomin_state.functions.setAssociatedContract(nomin_contract.address).transact({'from': MASTER}),
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.giveNomins(airdropper_contract.address, 1000 * UNIT).transact({'from': MASTER})
        ])

        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, nomin_contract, havven_contract, nomin_state, airdropper_contract

    @classmethod
    def setUpClass(cls):
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.nomin_contract, cls.havven_contract, cls.nomin_state, cls.airdropper_contract = cls.deployContracts()

        cls.nomin_event_dict = cls.event_maps['Nomin']

        cls.nomin = PublicNominInterface(cls.proxied_nomin, "Nomin")
        cls.havven = HavvenInterface(cls.proxied_havven, "Havven")
        cls.airdropper = NominAirdropperInterface(cls.airdropper_contract, "NominAirdropper")

        cls.unproxied_nomin = PublicNominInterface(cls.nomin_contract, "UnproxiedNomin")

        cls.nomin.setFeeAuthority(MASTER, cls.havven_contract.address)
        cls.sd_duration = 4 * 7 * 24 * 60 * 60

    def test_assertLengthCheck(self):
        # Sending unequal length transactions should revert.
        self.assertReverts(self.airdropper.multisend, MASTER, self.nomin_contract.address, [MASTER], [1, 2])
    
    def test_assertIfUsedByNonOwner(self):
        # Only owner should be able to use.
        self.assertReverts(self.airdropper.multisend, DUMMY, self.nomin_contract.address, [DUMMY, DUMMY], [50 * UNIT, 100 * UNIT])

    def test_correctlyAirdrops(self):
        # Sending multiple transactions should result in sender paying fees, and correct amount being received.
        self.airdropper.multisend(MASTER, self.nomin_contract.address, [DUMMY, DUMMY], [50 * UNIT, 100 * UNIT])

        self.assertEqual(self.nomin.balanceOf(DUMMY), 150 * UNIT)
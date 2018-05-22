from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY, fresh_account, fresh_accounts,
    compile_contracts, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.extern_state_fee_token_interface import ExternStateFeeTokenInterface
from tests.contract_interfaces.proxy_interface import ProxyInterface
from tests.contract_interfaces.token_state_interface import TokenStateInterface


def setUpModule():
    print("Testing Proxy...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestExternStateFeeToken(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @staticmethod
    def deployContracts():
        sources = ["tests/contracts/PublicESFT.sol",
                   "contracts/ExternStateFeeToken.sol",
                   "contracts/TokenState.sol"]
        compiled = compile_contracts(sources, remappings=['""=contracts'])
        feetoken_abi = compiled['PublicESFT']['abi']

        proxy, _ = attempt_deploy(
            compiled, "Proxy", MASTER, [MASTER]
        )
        proxied_feetoken = W3.eth.contract(address=proxy.address, abi=feetoken_abi)

        feetoken_event_dict = generate_topic_event_map(feetoken_abi)
        feetoken_contract_1, construction_txr_1 = attempt_deploy(
            compiled, "PublicESFT", MASTER,
            [proxy.address, "Test Fee Token", "FEE", UNIT // 20, MASTER, MASTER]
        )

        feetoken_contract_2, construction_txr_2 = attempt_deploy(
            compiled, "PublicESFT", MASTER,
            [proxy.address, "Test Fee Token 2", "FEE", UNIT // 20, MASTER, MASTER]
        )

        feestate, txr = attempt_deploy(
            compiled, "TokenState", MASTER,
            [MASTER, MASTER]
        )

        mine_txs([
            proxy.functions.setTarget(feetoken_contract_1.address).transact({'from': MASTER}),
            feestate.functions.setBalanceOf(DUMMY, 1000 * UNIT).transact({'from': MASTER}),
            feestate.functions.setAssociatedContract(feetoken_contract_1.address).transact({'from': MASTER}),
            feetoken_contract_1.functions.setState(feestate.address).transact({'from': MASTER})]
        )

        return compiled, proxy, proxied_feetoken, feetoken_contract_1, feetoken_contract_2, feetoken_event_dict, feestate

    @classmethod
    def setUpClass(cls):
        cls.compiled, cls.proxy, cls.proxied_feetoken, cls.feetoken_contract_1, cls.feetoken_contract_2, cls.feetoken_event_dict, cls.feestate = cls.deployContracts()

        cls.initial_beneficiary = DUMMY
        cls.fee_authority = fresh_account()

        cls.feetoken = ExternStateFeeTokenInterface(cls.proxied_feetoken, "ExternStateFeeToken")
        cls.proxy = ProxyInterface(cls.proxy, "ExternStateFeeTokenProxy")
        cls.feestate = TokenStateInterface(cls.feestate, "TokenState")

        cls.feetoken.setFeeAuthority(MASTER, cls.fee_authority)

    def test_swap(self):
        self.assertEqual(self.feetoken.name(), "Test Fee Token")
        self.assertEqual(self.feetoken.symbol(), "FEE")
        self.assertEqual(self.feetoken.totalSupply(), 0)
        self.assertEqual(self.feetoken.transferFeeRate(), UNIT // 20)
        self.assertEqual(self.feetoken.feeAuthority(), self.fee_authority)
        self.assertEqual(self.feetoken.state(), self.feestate.contract.address)
        self.assertEqual(self.feestate.associatedContract(), self.feetoken_contract_1.address)

        self.proxy.setTarget(MASTER, self.feetoken_contract_2.address)
        self.feestate.setAssociatedContract(MASTER, self.feetoken_contract_2.address)
        mine_txs([self.feetoken_contract_2.functions.setState(self.feestate.contract.address).transact({'from': MASTER})])

        self.assertEqual(self.feetoken.name(), "Test Fee Token 2")
        self.assertEqual(self.feetoken.state(), self.feestate.contract.address)
        self.assertEqual(self.feestate.associatedContract(), self.feetoken_contract_2.address)

    def test_balance_after_swap(self):
        sender = self.initial_beneficiary

        receiver = fresh_account()
        receiver_balance = self.feetoken.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        tx_receipt = self.feetoken.transfer(sender, receiver, value)

        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value)

        self.proxy.setTarget(MASTER, self.feetoken_contract_2.address)
        self.feestate.setAssociatedContract(MASTER, self.feetoken_contract_2.address)

        mine_txs([self.feetoken_contract_2.functions.setState(self.feestate.contract.address).transact({'from': MASTER})])

        self.assertEqual(self.feetoken.balanceOf(receiver), receiver_balance + value)


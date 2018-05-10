from utils.deployutils import MASTER, DUMMY, fresh_account, mine_tx, fast_forward

from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.destructible_extern_state_token_interface import DestructibleExternStateTokenInterface
from tests.contract_interfaces.extern_state_fee_token_interface import ExternStateFeeTokenInterface


class TestProxiedDestructibleExternStateToken(__import__('tests').test_DestructibleExternStateToken.TestDestructibleExternStateToken):
    @classmethod
    def setUpClass(cls):
        cls.proxy, cls.proxied_token, cls.compiled, cls.token_contract, cls.token_abi, cls.token_event_dict, cls.tokenstate = cls.deploy_contracts()
        cls.token = DestructibleExternStateTokenInterface(cls.proxied_token)


class TestProxiedExternStateFeeToken(__import__('tests').test_ExternStateFeeToken.TestExternStateFeeToken):
    @classmethod
    def setUpClass(cls):

        cls.compiled, cls.proxy, cls.proxied_feetoken, cls.feetoken_contract, cls.feetoken_event_dict, cls.feestate = cls.deployContracts()

        cls.initial_beneficiary = DUMMY
        cls.fee_authority = fresh_account()

        cls.feetoken = ExternStateFeeTokenInterface(cls.proxied_feetoken)
        cls.feetoken.setFeeAuthority(MASTER, cls.fee_authority)


class TestProxiedFeeCollection(__import__('tests').test_FeeCollection.TestFeeCollection):
    @classmethod
    def setUpClass(cls):
        cls.havven_contract, cls.nomin_contract, cls.fake_court = cls.deployContracts()

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = PublicNominInterface(cls.nomin_contract)

        fast_forward(weeks=102)

        cls.fake_court_setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court_setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court_setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court_confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))

        cls.fake_court_setNomin(MASTER, cls.nomin_contract.address)

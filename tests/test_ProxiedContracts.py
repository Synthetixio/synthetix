from utils.testutils import assertReverts, assertClose
from utils.testutils import generate_topic_event_map

from tests.contract_interfaces.court_interface import PublicCourtInterface
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import NominInterface
from tests.contract_interfaces.destructible_extern_state_token_interface import DestructibleExternStateTokenInterface


class TestProxyDestructibleExternStateToken(__import__('tests').test_DestructibleExternStateToken.TestDestructibleExternStateToken):
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.proxy, cls.proxied_token, cls.compiled, cls.token_contract, cls.token_abi, cls.token_event_dict, cls.tokenstate = cls.deploy_contracts()
        cls.token = DestructibleExternStateTokenInterface(cls.proxied_token)



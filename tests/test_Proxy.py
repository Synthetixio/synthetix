from utils.testutils import assertReverts, assertClose
from utils.testutils import generate_topic_event_map

from tests.contract_interfaces.court_interface import PublicCourtInterface
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import NominInterface


class TestProxyCourt(__import__('tests').test_Court.TestCourt):
    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts
        cls.assertClose = assertClose

        # cls.havven_proxy, cls.nomin_proxy, cls.coury_proxy,\
        cls.havven_contract, cls.nomin_contract, cls.court_contract,\
            cls.nomin_abi, cls.court_abi = cls.deployContracts()

        # Event stuff
        cls.court_event_dict = generate_topic_event_map(cls.court_abi)
        cls.nomin_event_dict = generate_topic_event_map(cls.nomin_abi)

        cls.court = PublicCourtInterface(cls.court_contract)

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = NominInterface(cls.nomin_contract)

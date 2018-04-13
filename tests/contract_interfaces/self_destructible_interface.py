from tests.contract_interfaces.owned_interface import OwnedInterface
from utils.deployutils import mine_tx


class SelfDestructibleInterface(OwnedInterface):
    def __init__(self, contract):
        OwnedInterface.__init__(self, contract)

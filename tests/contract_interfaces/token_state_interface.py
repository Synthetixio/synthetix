from tests.contract_interfaces.state_interface import StateInterface
from utils.deployutils import mine_tx


class TokenStateInterface(StateInterface):
    def __init__(self, contract):
        StateInterface.__init__(self, contract)

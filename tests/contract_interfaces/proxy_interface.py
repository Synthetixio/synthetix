from utils.deployutils import mine_tx
from tests.contract_interfaces.owned_interface import OwnedInterface


class ProxyInterface(OwnedInterface):
    def __init__(self, contract, name):
        OwnedInterface.__init__(self, contract, name)
        self.contract = contract
        self.contract_name = name

        self.target = lambda: self.contract.functions.target().call()
        self.useDELEGATECALL = lambda: self.contract.functions.useDELEGATECALL().call()

        self.setTarget = lambda sender, addr: mine_tx(
            self.contract.functions.setTarget(addr).transact({'from': sender}), "setTarget", self.contract_name)


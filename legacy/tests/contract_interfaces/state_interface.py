from tests.contract_interfaces.owned_interface import OwnedInterface
from utils.deployutils import mine_tx


class StateInterface(OwnedInterface):
    def __init__(self, contract, name):
        OwnedInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        self.associatedContract = lambda: self.contract.functions.associatedContract().call()

        self.setAssociatedContract = lambda sender, addr: mine_tx(self.contract.functions.setAssociatedContract(addr).transact({'from': sender}), "setAssociatedContract", self.contract_name)
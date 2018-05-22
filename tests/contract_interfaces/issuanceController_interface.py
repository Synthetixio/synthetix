from utils.deployutils import mine_tx

class IssuanceControllerInterface():
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.getSomeValue = lambda: self.contract.functions.getSomeValue().call()
        self.setSomeValue = lambda sender, address: mine_tx(
            self.contract.functions.setSomeValue(address).transact({'from': sender}), "setSomeValue", self.contract_name
        )

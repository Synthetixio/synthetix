from utils.deployutils import mine_tx


class OwnedInterface:
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.owner = lambda: self.contract.functions.owner().call()
        self.nominatedOwner = lambda: self.contract.functions.nominatedOwner().call()

        self.nominateNewOwner = lambda sender, addr: mine_tx(
            self.contract.functions.nominateNewOwner(addr).transact({'from': sender}), "nominateNewOwner", self.contract_name)
        self.acceptOwnership = lambda sender: mine_tx(
            self.contract.functions.acceptOwnership().transact({'from': sender}), "acceptOwnership", self.contract_name)

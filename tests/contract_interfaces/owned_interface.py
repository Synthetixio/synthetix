from utils.deployutils import mine_tx


class OwnedInterface:
    def __init__(self, contract):
        self.contract = contract

        self.owner = lambda: self.contract.functions.owner().call()

        self.nominateOwner = lambda sender, addr: mine_tx(
            self.contract.functions.nominateOwner(addr).transact({'from': sender}))
        self.acceptOwnership = lambda sender: mine_tx(
            self.contract.functions.acceptOwnership().transact({'from': sender}))

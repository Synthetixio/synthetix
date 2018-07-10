from utils.deployutils import mine_tx

class NominAirdropperInterface:
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.multisend = lambda sender, tokenAddress, destinations, values: mine_tx(
            self.contract.functions.multisend(tokenAddress, destinations, values).transact({'from': sender}), "multisend", self.contract_name)

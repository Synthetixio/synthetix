from utils.deployutils import mine_tx

class PausableInterface():
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.owner = lambda: self.contract.functions.owner().call()
        self.paused = lambda: self.contract.functions.paused().call()
        self.lastPauseTime = lambda: self.contract.functions.lastPauseTime().call()
        self.getSomeValue = lambda: self.contract.functions.someValue().call()

        self.setPaused = lambda sender, paused: mine_tx(
            self.contract.functions.setPaused(paused).transact({'from': sender}), "setPaused", self.contract_name
        )
        self.setSomeValue = lambda sender, someValue: mine_tx(
            self.contract.functions.setSomeValue(someValue).transact({'from': sender}), "setSomeValue", self.contract_name
        )


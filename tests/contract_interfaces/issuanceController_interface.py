from utils.deployutils import mine_tx

class IssuanceControllerInterface():
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.priceStalePeriod = lambda: self.contract.functions.priceStalePeriod().call()
        self.havven = lambda: self.contract.functions.havven().call()
        self.nomin = lambda: self.contract.functions.nomin().call()
        self.oracle = lambda: self.contract.functions.oracle().call()
        self.owner = lambda: self.contract.functions.owner().call()
        self.usdToEthPrice = lambda: self.contract.functions.usdToEthPrice().call()
        self.usdToHavPrice = lambda: self.contract.functions.usdToHavPrice().call()
        self.lastPriceUpdateTime = lambda: self.contract.functions.lastPriceUpdateTime().call()
        self.selfDestructDelay = lambda: self.contract.functions.selfDestructDelay().call()
        self.selfDestructBeneficiary = lambda: self.contract.functions.selfDestructBeneficiary().call()
        self.priceStalePeriod = lambda: self.contract.functions.priceStalePeriod().call()

        self.setOracle = lambda sender, newAddress: mine_tx(
            self.contract.functions.setOracle(newAddress).transact({'from': sender}), "setOracle", self.contract_name
        )
        self.setPriceStalePeriod = lambda sender, newPriceStalePeriod: mine_tx(
            self.contract.functions.setPriceStalePeriod(newPriceStalePeriod).transact({'from': sender}), "setPriceStalePeriod", self.contract_name
        )
        self.updatePrices = lambda sender, newEthPrice, newHavPrice, timeSent: mine_tx(
            self.contract.functions.updatePrices(newEthPrice, newHavPrice, timeSent).transact({'from': sender}), "updatePrices", self.contract_name
        )
        self.exchangeForNomins = lambda sender, value: mine_tx(
            self.contract.functions.exchangeForNomins().transact({'from': sender, 'value': value}), "exchangeForNomins", self.contract_name
        )


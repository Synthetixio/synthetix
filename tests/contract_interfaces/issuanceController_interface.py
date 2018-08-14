from utils.deployutils import mine_tx

class IssuanceControllerInterface():
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.priceStalePeriod = lambda: self.contract.functions.priceStalePeriod().call()
        self.fundsWallet = lambda: self.contract.functions.fundsWallet().call()
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
        self.havvensReceivedForNomins = lambda amount: self.contract.functions.havvensReceivedForNomins(amount).call()
        self.havvensReceivedForEther = lambda amount: self.contract.functions.havvensReceivedForEther(amount).call()
        self.nominsReceivedForEther = lambda amount: self.contract.functions.nominsReceivedForEther(amount).call()

        self.setOracle = lambda sender, newAddress: mine_tx(
            self.contract.functions.setOracle(newAddress).transact({'from': sender}), "setOracle", self.contract_name
        )
        self.setHavven = lambda sender, newAddress: mine_tx(
            self.contract.functions.setHavven(newAddress).transact({'from': sender}), "setHavven", self.contract_name
        )
        self.setNomin = lambda sender, newAddress: mine_tx(
            self.contract.functions.setNomin(newAddress).transact({'from': sender}), "setNomin", self.contract_name
        )
        self.setFundsWallet = lambda sender, newAddress: mine_tx(
            self.contract.functions.setFundsWallet(newAddress).transact({'from': sender}), "setFundsWallet", self.contract_name
        )
        self.setPriceStalePeriod = lambda sender, newPriceStalePeriod: mine_tx(
            self.contract.functions.setPriceStalePeriod(newPriceStalePeriod).transact({'from': sender}), "setPriceStalePeriod", self.contract_name
        )
        self.updatePrices = lambda sender, newEthPrice, newHavPrice, timeSent: mine_tx(
            self.contract.functions.updatePrices(newEthPrice, newHavPrice, timeSent).transact({'from': sender}), "updatePrices", self.contract_name
        )

        # ETH -> nUSD
        self.exchangeEtherForNomins = lambda sender, value: mine_tx(
            self.contract.functions.exchangeEtherForNomins().transact({'from': sender, 'value': value}), "exchangeEtherForNomins", self.contract_name
        )
        self.exchangeEtherForNominsAtRate = lambda sender, value, rate: mine_tx(
            self.contract.functions.exchangeEtherForNominsAtRate(rate).transact({'from': sender, 'value': value}), "exchangeEtherForNominsAtRate", self.contract_name
        )

        # ETH -> HAV
        self.exchangeEtherForHavvens = lambda sender, value: mine_tx(
            self.contract.functions.exchangeEtherForHavvens().transact({'from': sender, 'value': value}), "exchangeEtherForHavvens", self.contract_name
        )
        self.exchangeEtherForHavvensAtRate = lambda sender, value, etherRate, nominRate: mine_tx(
            self.contract.functions.exchangeEtherForHavvensAtRate(etherRate, nominRate).transact({'from': sender, 'value': value}), "exchangeEtherForHavvensAtRate", self.contract_name
        )

        # nUSD -> HAV
        self.exchangeNominsForHavvens = lambda sender, value: mine_tx(
            self.contract.functions.exchangeNominsForHavvens(value).transact({'from': sender}), "exchangeNominsForHavvens", self.contract_name
        )
        self.exchangeNominsForHavvensAtRate = lambda sender, value, rate: mine_tx(
            self.contract.functions.exchangeNominsForHavvensAtRate(value, rate).transact({'from': sender}), "exchangeNominsForHavvensAtRate", self.contract_name
        )

        self.withdrawHavvens = lambda sender, value: mine_tx(
            self.contract.functions.withdrawHavvens(value).transact({'from': sender}), "withdrawHavvens", self.contract_name
        )
        self.withdrawNomins = lambda sender, value: mine_tx(
            self.contract.functions.withdrawNomins(value).transact({'from': sender}), "withdrawNomins", self.contract_name
        )

        # TODO: Add inherited interface here instead
        self.setPaused = lambda sender, paused: mine_tx(
            self.contract.functions.setPaused(paused).transact({'from': sender}), "setPaused", self.contract_name
        )
 


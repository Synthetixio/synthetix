from tests.contract_interfaces.destructible_extern_state_token_interface import DestructibleExternStateTokenInterface
from utils.deployutils import mine_tx


class HavvenInterface(DestructibleExternStateTokenInterface):
    def __init__(self, contract, name):
        DestructibleExternStateTokenInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        # HAVVEN

        # getters
        self.feePeriodStartTime = lambda: self.contract.functions.feePeriodStartTime().call()
        self.lastFeePeriodStartTime = lambda: self.contract.functions.lastFeePeriodStartTime().call()
        self.targetFeePeriodDurationSeconds = lambda: self.contract.functions.targetFeePeriodDurationSeconds().call()
        self.lastFeesCollected = lambda: self.contract.functions.lastFeesCollected().call()
        self.nomin = lambda: self.contract.functions.nomin().call()
        self.escrow = lambda: self.contract.functions.escrow().call()
        self.oracle = lambda: self.contract.functions.oracle().call()
        self.havvenPrice = lambda: self.contract.functions.havvenPrice().call()
        self.lastHavvenPriceUpdateTime = lambda: self.contract.functions.lastHavvenPriceUpdateTime().call()
        self.havvenPriceStalePeriod = lambda: self.contract.functions.havvenPriceStalePeriod().call()
        self.issuanceRatio = lambda: self.contract.functions.issuanceRatio().call()
        self.maxIssuanceRatio = lambda: self.contract.functions.maxIssuanceRatio().call()

        self.havPriceIsStale = lambda: self.contract.functions.havPriceIsStale().call()

        # account specific getters
        self.hasWithdrawnLastPeriodFees = lambda acc: self.contract.functions.hasWithdrawnLastPeriodFees(acc).call()
        self.whitelistedIssuers = lambda acc: self.contract.functions.whitelistedIssuers(acc).call()
        self.nominsIssued = lambda acc: self.contract.functions.nominsIssued(acc).call() 
        self.issuedNominCurrentBalanceSum = lambda acc: self.contract.functions.issuedNominCurrentBalanceSum(acc).call()
        self.issuedNominLastAverageBalance = lambda acc: self.contract.functions.issuedNominLastAverageBalance(acc).call()
        self.issuedNominLastTransferTimestamp = lambda acc: self.contract.functions.issuedNominLastTransferTimestamp(acc).call()
        self.totalIssuedNominCurrentBalanceSum = lambda: self.contract.functions.totalIssuedNominCurrentBalanceSum().call()
        self.totalIssuedNominlastAverageBalance = lambda: self.contract.functions.totalIssuedNominlastAverageBalance().call()
        self.totalIssuedNominLastTransferTimestamp = lambda: self.contract.functions.totalIssuedNominLastTransferTimestamp().call()
        self.availableHavvens = lambda acc: self.contract.functions.availableHavvens(acc).call()
        self.lockedHavvens = lambda acc: self.contract.functions.lockedHavvens(acc).call()
        self.maxIssuanceRights = lambda acc: self.contract.functions.maxIssuanceRights(acc).call()
        self.remainingIssuanceRights = lambda acc: self.contract.functions.remainingIssuanceRights(acc).call()

        # utility function
        self.havValue = lambda havWei: self.contract.functions.havValue(havWei).call()

        # mutable functions
        self.setNomin = lambda sender, addr: mine_tx(self.contract.functions.setNomin(addr).transact({'from': sender}), "setNomin", self.contract_name)
        self.setEscrow = lambda sender, addr: mine_tx(self.contract.functions.setEscrow(addr).transact({'from': sender}), "setEscrow", self.contract_name)
        self.setTargetFeePeriodDuration = lambda sender, duration: mine_tx(self.contract.functions.setTargetFeePeriodDuration(duration).transact({'from': sender}), "setTargetFeePeriodDuration", self.contract_name)
        self.setOracle = lambda sender, addr: mine_tx(self.contract.functions.setOracle(addr).transact({'from': sender}), "setOracle", self.contract_name)
        self.setIssuanceRatio = lambda sender, val: mine_tx(self.contract.functions.setIssuanceRatio(val).transact({'from': sender}), "setIssuanceRatio", self.contract_name)
        self.endow = lambda sender, to, val: mine_tx(self.contract.functions.endow(to, val).transact({'from': sender}), "endow", self.contract_name)
        self.setWhitelisted = lambda sender, acc, val: mine_tx(self.contract.functions.setWhitelisted(acc, val).transact({'from': sender}), "setWhitelisted", self.contract_name)
        self.transfer = lambda sender, to, val: mine_tx(self.contract.functions.transfer(to, val).transact({'from': sender}), "transfer", self.contract_name)
        self.transferFrom = lambda sender, frm, to, val: mine_tx(self.contract.functions.transferFrom(frm, to, val).transact({'from': sender}), "transferFrom", self.contract_name)
        self.withdrawFeeEntitlement = lambda sender: mine_tx(self.contract.functions.withdrawFeeEntitlement().transact({'from': sender}), "withdrawFeeEntitlement", self.contract_name)
        self.recomputeAccountIssuedNominLastAverageBalance = lambda sender, acc: mine_tx(self.contract.functions.recomputeAccountIssuedNominLastAverageBalance(acc).transact({'from': sender}), "recomputeAccountIssuedNominLastAverageBalance", self.contract_name)
        self.checkFeePeriodRollover = lambda sender: mine_tx(self.contract.functions.checkFeePeriodRollover().transact({'from': sender}), "checkFeePeriodRollover", self.contract_name)
        self.issueNominsToMax = lambda sender: mine_tx(self.contract.functions.issueNominsToMax().transact({'from': sender}), "issueNominsToMax", self.contract_name)
        self.issueNomins = lambda sender, amt: mine_tx(self.contract.functions.issueNomins(amt).transact({'from': sender}), "issueNomins", self.contract_name)
        self.burnNomins = lambda sender, amt: mine_tx(self.contract.functions.burnNomins(amt).transact({'from': sender}), "burnNomins", self.contract_name)
        self.updatePrice = lambda sender, price, time: mine_tx(self.contract.functions.updatePrice(price, time).transact({'from': sender}), "updatePrice", self.contract_name)

    @staticmethod
    def balance_data_current_balance_sum(balance_data):
        return balance_data[0]

    @staticmethod
    def balance_data_last_average_balance(balance_data):
        return balance_data[1]

    @staticmethod
    def balance_data_last_transfer_time(balance_data):
        return balance_data[2]


class PublicHavvenInterface(HavvenInterface):
    def __init__(self, contract, name):
        HavvenInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        self.MIN_FEE_PERIOD_DURATION_SECONDS = lambda: self.contract.functions.MIN_FEE_PERIOD_DURATION_SECONDS().call()
        self.MAX_FEE_PERIOD_DURATION_SECONDS = lambda: self.contract.functions.MAX_FEE_PERIOD_DURATION_SECONDS().call()

        self.currentTime = lambda: self.contract.functions.currentTime().call()

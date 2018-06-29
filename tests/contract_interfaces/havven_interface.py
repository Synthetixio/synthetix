from tests.contract_interfaces.extern_state_token_interface import ExternStateTokenInterface
from utils.deployutils import mine_tx


class HavvenInterface(ExternStateTokenInterface):
    def __init__(self, contract, name):
        ExternStateTokenInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        # HAVVEN

        # getters
        self.feePeriodStartTime = lambda: self.contract.functions.feePeriodStartTime().call()
        self.lastFeePeriodStartTime = lambda: self.contract.functions.lastFeePeriodStartTime().call()
        self.feePeriodDuration = lambda: self.contract.functions.feePeriodDuration().call()
        self.lastFeesCollected = lambda: self.contract.functions.lastFeesCollected().call()
        self.nomin = lambda: self.contract.functions.nomin().call()
        self.escrow = lambda: self.contract.functions.escrow().call()
        self.oracle = lambda: self.contract.functions.oracle().call()
        self.price = lambda: self.contract.functions.price().call()
        self.lastPriceUpdateTime = lambda: self.contract.functions.lastPriceUpdateTime().call()
        self.priceStalePeriod = lambda: self.contract.functions.priceStalePeriod().call()
        self.issuanceRatio = lambda: self.contract.functions.issuanceRatio().call()
        self.priceIsStale = lambda: self.contract.functions.priceIsStale().call()

        self.hasWithdrawnFees = lambda acc: self.contract.functions.hasWithdrawnFees(acc).call()
        self.isIssuer = lambda acc: self.contract.functions.isIssuer(acc).call()
        self.nominsIssued = lambda acc: self.contract.functions.nominsIssued(acc).call()
        self.issuanceData = lambda acc: self.contract.functions.issuanceData(acc).call()
        self.totalIssuanceData = lambda: self.contract.functions.totalIssuanceData().call()
        self.issuanceCurrentBalanceSum = lambda acc: self.contract.functions.issuanceCurrentBalanceSum(acc).call()
        self.issuanceLastAverageBalance = lambda acc: self.contract.functions.issuanceLastAverageBalance(acc).call()
        self.issuanceLastModified = lambda acc: self.contract.functions.issuanceLastModified(acc).call()
        self.totalIssuanceCurrentBalanceSum = lambda: self.contract.functions.totalIssuanceCurrentBalanceSum().call()
        self.totalIssuanceLastAverageBalance = lambda: self.contract.functions.totalIssuanceLastAverageBalance().call()
        self.totalIssuanceLastModified = lambda: self.contract.functions.totalIssuanceLastModified().call()

        self.maxIssuableNomins = lambda acc: self.contract.functions.maxIssuableNomins(acc).call()
        self.remainingIssuableNomins = lambda acc: self.contract.functions.remainingIssuableNomins(acc).call()
        self.collateral = lambda acc: self.contract.functions.collateral(acc).call()
        self.issuanceDraft = lambda acc: self.contract.functions.issuanceDraft(acc).call()
        self.lockedCollateral = lambda acc: self.contract.functions.lockedCollateral(acc).call()
        self.unlockedCollateral = lambda acc: self.contract.functions.unlockedCollateral(acc).call()
        self.transferableHavvens = lambda acc: self.contract.functions.transferableHavvens(acc).call()

        # utility function
        self.HAVtoUSD = lambda havWei: self.contract.functions.HAVtoUSD(havWei).call()
        self.USDtoHAV = lambda usdWei: self.contract.functions.USDtoHAV(usdWei).call()

        # mutable functions
        self.setNomin = lambda sender, addr: mine_tx(self.contract.functions.setNomin(addr).transact({'from': sender}), "setNomin", self.contract_name)
        self.setEscrow = lambda sender, addr: mine_tx(self.contract.functions.setEscrow(addr).transact({'from': sender}), "setEscrow", self.contract_name)
        self.setFeePeriodDuration = lambda sender, duration: mine_tx(self.contract.functions.setFeePeriodDuration(duration).transact({'from': sender}), "setFeePeriodDuration", self.contract_name)
        self.setOracle = lambda sender, addr: mine_tx(self.contract.functions.setOracle(addr).transact({'from': sender}), "setOracle", self.contract_name)
        self.setIssuanceRatio = lambda sender, val: mine_tx(self.contract.functions.setIssuanceRatio(val).transact({'from': sender}), "setIssuanceRatio", self.contract_name)
        self.setPriceStalePeriod = lambda sender, val:  mine_tx(self.contract.functions.setPriceStalePeriod(val).transact({'from': sender}), "setPriceStalePeriod", self.contract_name)
        self.endow = lambda sender, to, val: mine_tx(self.contract.functions.endow(to, val).transact({'from': sender}), "endow", self.contract_name)
        self.setIssuer = lambda sender, acc, val: mine_tx(self.contract.functions.setIssuer(acc, val).transact({'from': sender}), "setIssuer", self.contract_name)
        self.transfer = lambda sender, to, val: mine_tx(self.contract.functions.transfer(to, val).transact({'from': sender}), "transfer", self.contract_name)
        self.transferFrom = lambda sender, frm, to, val: mine_tx(self.contract.functions.transferFrom(frm, to, val).transact({'from': sender}), "transferFrom", self.contract_name)
        self.withdrawFees = lambda sender: mine_tx(self.contract.functions.withdrawFees().transact({'from': sender}), "withdrawFees", self.contract_name)
        self.recomputeLastAverageBalance = lambda sender, acc: mine_tx(self.contract.functions.recomputeLastAverageBalance(acc).transact({'from': sender}), "recomputeLastAverageBalance", self.contract_name)
        self.rolloverFeePeriodIfElapsed = lambda sender: mine_tx(self.contract.functions.rolloverFeePeriodIfElapsed().transact({'from': sender}), "rolloverFeePeriodIfElapsed", self.contract_name)
        self.issueMaxNomins = lambda sender: mine_tx(self.contract.functions.issueMaxNomins().transact({'from': sender}), "issueMaxNomins", self.contract_name)
        self.issueNomins = lambda sender, amt: mine_tx(self.contract.functions.issueNomins(amt).transact({'from': sender}), "issueNomins", self.contract_name)
        self.burnNomins = lambda sender, amt: mine_tx(self.contract.functions.burnNomins(amt).transact({'from': sender}), "burnNomins", self.contract_name)
        self.updatePrice = lambda sender, price, time: mine_tx(self.contract.functions.updatePrice(price, time).transact({'from': sender}), "updatePrice", self.contract_name)

    @staticmethod
    def issuance_data_current_balance_sum(issuance_data):
        return issuance_data[0]

    @staticmethod
    def issuance_data_last_average_balance(issuance_data):
        return issuance_data[1]

    @staticmethod
    def issuance_data_last_modified(issuance_data):
        return issuance_data[2]


class PublicHavvenInterface(HavvenInterface):
    def __init__(self, contract, name):
        HavvenInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        self.MIN_FEE_PERIOD_DURATION = lambda: self.contract.functions.MIN_FEE_PERIOD_DURATION().call()
        self.MAX_FEE_PERIOD_DURATION = lambda: self.contract.functions.MAX_FEE_PERIOD_DURATION().call()
        self.MAX_ISSUANCE_RATIO = lambda: self.contract.functions.MAX_ISSUANCE_RATIO().call()

        self.currentTime = lambda: self.contract.functions.currentTime().call()

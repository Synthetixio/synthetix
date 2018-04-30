from tests.contract_interfaces.extern_state_token_interface import ExternStateTokenInterface
from tests.contract_interfaces.self_destructible_interface import SelfDestructibleInterface
from utils.deployutils import mine_tx


class HavvenInterface(ExternStateTokenInterface, SelfDestructibleInterface):
    def __init__(self, contract):
        ExternStateTokenInterface.__init__(self, contract)
        SelfDestructibleInterface.__init__(self, contract)

        self.contract = contract

        # HAVVEN

        # getters
        self.feePeriodStartTime = lambda: self.contract.functions.feePeriodStartTime().call()
        self.lastFeePeriodStartTime = lambda: self.contract.functions.lastFeePeriodStartTime().call()
        self.targetFeePeriodDurationSeconds = lambda: self.contract.functions.targetFeePeriodDurationSeconds().call()
        self.lastFeesCollected = lambda: self.contract.functions.lastFeesCollected().call()
        self.nomin = lambda: self.contract.functions.nomin().call()
        self.escrow = lambda: self.contract.functions.escrow().call()
        self.oracle = lambda: self.contract.functions.oracle().call()
        self.havPrice = lambda: self.contract.functions.havPrice().call()
        self.lastHavPriceUpdateTime = lambda: self.contract.functions.lastHavPriceUpdateTime().call()
        self.havPriceStalePeriod = lambda: self.contract.functions.havPriceStalePeriod().call()
        self.CMax = lambda: self.contract.functions.CMax().call()
        self.MAX_C_MAX = lambda: self.contract.functions.MAX_C_MAX().call()

        self.havPriceIsStale = lambda: self.contract.functions.havPriceIsStale().call()

        # account specific getters
        self.hasWithdrawnLastPeriodFees = lambda acc: self.contract.functions.hasWithdrawnLastPeriodFees(acc).call()
        self.whitelistedIssuers = lambda acc: self.contract.functions.whitelistedIssuers(acc).call()
        self.issuedNomins = lambda acc: self.contract.functions.issuedNomins(acc).call()
        self.currentHavvenBalanceSum = lambda acc: self.contract.functions.currentHavvenBalanceSum(acc).call()
        self.lastAverageHavvenBalance = lambda acc: self.contract.functions.lastAverageHavvenBalance(acc).call()
        self.lastHavvenTransferTimestamp = lambda acc: self.contract.functions.lastHavvenTransferTimestamp(acc).call()
        self.currentIssuedNominBalanceSum = lambda acc: self.contract.functions.currentIssuedNominBalanceSum(acc).call()
        self.lastAverageIssuedNominBalance = lambda acc: self.contract.functions.lastAverageIssuedNominBalance(acc).call()
        self.lastIssuedNominTransferTimestamp = lambda acc: self.contract.functions.lastIssuedNominTransferTimestamp(acc).call()
        self.availableHavvens = lambda acc: self.contract.functions.availableHavvens(acc).call()
        self.maxIssuanceRights = lambda acc: self.contract.functions.maxIssuanceRights(acc).call()
        self.remainingIssuanceRights = lambda acc: self.contract.functions.remainingIssuanceRights(acc).call()

        # utility function
        self.havValue = lambda havWei: self.contract.functions.havValue(havWei).call()

        # mutable functions
        self.setNomin = lambda sender, addr: mine_tx(self.contract.functions.setNomin(addr).transact({"from": sender}))
        self.setEscrow = lambda sender, addr: mine_tx(self.contract.functions.setEscrow(addr).transact({"from": sender}))
        self.setTargetFeePeriodDuration = lambda sender, duration: mine_tx(self.contract.functions.setTargetFeePeriodDuration(duration).transact({"from": sender}))
        self.setOracle = lambda sender, addr: mine_tx(self.contract.functions.setOracle(addr).transact({"from": sender}))
        self.setCMax = lambda sender, val: mine_tx(self.contract.functions.setCMax(val).transact({"from": sender}))
        self.endow = lambda sender, to, val: mine_tx(self.contract.functions.endow(to, val).transact({"from": sender}))
        self.setWhitelisted = lambda sender, acc, val: mine_tx(self.contract.functions.setWhitelisted(acc, val).transact({"from": sender}))
        self.transfer = lambda sender, to, val: mine_tx(self.contract.functions.transfer(to, val).transact({"from": sender}))
        self.transferFrom = lambda sender, frm, to, val: mine_tx(self.contract.functions.transferFrom(frm, to, val).transact({"from": sender}))
        self.withdrawFeeEntitlement = lambda sender: mine_tx(self.contract.functions.withdrawFeeEntitlement().transact({"from": sender}))
        self.recomputeAccountLastHavvenAverageBalance = lambda sender, acc: mine_tx(self.contract.functions.recomputeAccountLastHavvenAverageBalance(acc).transact({"from": sender}))
        self.recomputeAccountLastIssuedNominAverageBalance = lambda sender, acc: mine_tx(self.contract.functions.recomputeAccountLastIssuedNominAverageBalance(acc).transact({"from": sender}))
        self.rolloverFeePeriod = lambda sender: mine_tx(self.contract.functions.rolloverFeePeriod().transact({"from": sender}))
        self.issueNomins = lambda sender, amt: mine_tx(self.contract.functions.issueNomins(amt).transact({"from": sender}))
        self.burnNomins = lambda sender, amt: mine_tx(self.contract.functions.burnNomins(amt).transact({"from": sender}))
        self.updatePrice = lambda sender, price, time: mine_tx(self.contract.functions.updatePrice(price, time).transact({"from": sender}))


class PublicHavvenInterface(HavvenInterface):
    def __init__(self, contract):
        HavvenInterface.__init__(self, contract)

        self.public_contract = contract

        self.MIN_FEE_PERIOD_DURATION_SECONDS = lambda: self.contract.functions.MIN_FEE_PERIOD_DURATION_SECONDS().call()
        self.MAX_FEE_PERIOD_DURATION_SECONDS = lambda: self.contract.functions.MAX_FEE_PERIOD_DURATION_SECONDS().call()

        self.currentTime = lambda: self.contract.functions.currentTime().call()

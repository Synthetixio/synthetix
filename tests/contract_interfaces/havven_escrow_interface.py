from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface
from tests.contract_interfaces.owned_interface import OwnedInterface
from tests.contract_interfaces.limited_setup_interface import LimitedSetupInterface
from utils.deployutils import mine_tx


class HavvenEscrowInterface(SafeDecimalMathInterface, OwnedInterface, LimitedSetupInterface):
    def __init__(self, contract, name):
        SafeDecimalMathInterface.__init__(self, contract, name)
        OwnedInterface.__init__(self, contract, name)
        LimitedSetupInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        self.havven = lambda: self.contract.functions.havven().call()
        self.vestingSchedules = lambda account, index, i: self.contract.functions.vestingSchedules(account, index, i).call()
        self.numVestingEntries = lambda account: self.contract.functions.numVestingEntries(account).call()
        self.getVestingScheduleEntry = lambda account, index: self.contract.functions.getVestingScheduleEntry(account, index).call()
        self.getVestingTime = lambda account, index: self.contract.functions.getVestingTime(account, index).call()
        self.getVestingQuantity = lambda account, index: self.contract.functions.getVestingQuantity(account, index).call()
        self.totalVestedAccountBalance = lambda account: self.contract.functions.totalVestedAccountBalance(account).call()
        self.totalVestedBalance = lambda: self.contract.functions.totalVestedBalance().call()
        self.getNextVestingIndex = lambda account: self.contract.functions.getNextVestingIndex(account).call()
        self.getNextVestingEntry = lambda account: self.contract.functions.getNextVestingEntry(account).call()
        self.getNextVestingTime = lambda account: self.contract.functions.getNextVestingTime(account).call()
        self.getNextVestingQuantity = lambda account: self.contract.functions.getNextVestingQuantity(account).call()
        self.balanceOf = lambda account: self.contract.functions.balanceOf(account).call()

        self.setHavven = lambda sender, account: mine_tx(
            self.contract.functions.setHavven(account).transact({'from': sender}), "setHavven", self.contract_name)
        self.purgeAccount = lambda sender, account: mine_tx(
            self.contract.functions.purgeAccount(account).transact({'from': sender}), "purgeAccount", self.contract_name)
        self.withdrawHavvens = lambda sender, quantity: mine_tx(
            self.contract.functions.withdrawHavvens(quantity).transact({'from': sender}), "withdrawHavvens", self.contract_name)
        self.appendVestingEntry = lambda sender, account, time, quantity: mine_tx(
            self.contract.functions.appendVestingEntry(account, time, quantity).transact({'from': sender}), "appendVestingEntry", self.contract_name)
        self.addVestingSchedule = lambda sender, account, times, quantities: mine_tx(
            self.contract.functions.addVestingSchedule(account, times, quantities).transact({'from': sender}), "addVestingSchedule", self.contract_name)
        self.vest = lambda sender: mine_tx(self.contract.functions.vest().transact({'from': sender}), "vest", self.contract_name)


class PublicHavvenEscrowInterface(HavvenEscrowInterface):
    def __init__(self, contract, name):
        HavvenEscrowInterface.__init__(self, contract, name)
        self.contract = contract
        self.contract_name = name
        self.addRegularVestingSchedule = lambda sender, account, time, quantity, periods: mine_tx(
            self.contract.functions.addRegularVestingSchedule(account, time, quantity, periods).transact({'from': sender}), "addRegularVestingSchedule", self.contract_name)

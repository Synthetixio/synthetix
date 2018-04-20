from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface
from tests.contract_interfaces.owned_interface import OwnedInterface
from tests.contract_interfaces.limited_setup_interface import LimitedSetupInterface
from utils.deployutils import mine_tx


class HavvenEscrowInterface(SafeDecimalMathInterface, OwnedInterface, LimitedSetupInterface):
    def __init__(self, contract):
        SafeDecimalMathInterface.__init__(self, contract)

        self.contract = contract

        self.owner = lambda: self.contract.functions.owner().call()
        self.nominateOwner = lambda sender, newOwner: mine_tx(
            self.contract.functions.nominateOwner(newOwner).transact({'from': sender}))
        self.acceptOwnership = lambda sender: mine_tx(
            self.contract.functions.acceptOwnership().transact({'from': sender}))

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
            self.contract.functions.setHavven(account).transact({'from': sender}))
        self.purgeAccount = lambda sender, account: mine_tx(
            self.contract.functions.purgeAccount(account).transact({'from': sender}))
        self.withdrawHavvens = lambda sender, quantity: mine_tx(
            self.contract.functions.withdrawHavvens(quantity).transact({'from': sender}))
        self.appendVestingEntry = lambda sender, account, time, quantity: mine_tx(
            self.contract.functions.appendVestingEntry(account, time, quantity).transact({'from': sender}))
        self.addVestingSchedule = lambda sender, account, times, quantities: mine_tx(
            self.contract.functions.addVestingSchedule(account, times, quantities).transact({'from': sender}))
        self.addRegularVestingSchedule = lambda sender, account, time, quantity, periods: mine_tx(
            self.contract.functions.addRegularVestingSchedule(account, time, quantity, periods).transact({'from': sender}))
        self.vest = lambda sender: mine_tx(self.contract.functions.vest().transact({'from': sender}))
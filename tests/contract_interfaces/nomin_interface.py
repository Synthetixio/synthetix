from tests.contract_interfaces.extern_state_fee_token_interface import ExternStateFeeTokenInterface
from utils.deployutils import mine_tx


class NominInterface(ExternStateFeeTokenInterface):
    def __init__(self, contract, name):
        ExternStateFeeTokenInterface.__init__(self, contract, name)
        self.contract = contract
        self.name = name

        self.court = lambda: self.contract.functions.court().call()
        self.havven = lambda: self.contract.functions.havven().call()
        self.frozen = lambda address: self.contract.functions.frozen(address).call()

        self.setCourt = lambda sender, address: mine_tx(
            self.contract.functions.setCourt(address).transact({'from': sender}), "setCourt", self.name)
        self.setHavven = lambda sender, address: mine_tx(
            self.contract.functions.setHavven(address).transact({'from': sender}), "setHavven", self.name)

        self.transferPlusFee = lambda value: self.contract.functions.transferPlusFee(value).call()
        self.transfer = lambda sender, recipient, value: mine_tx(
            self.contract.functions.transfer(recipient, value).transact({'from': sender}), "transfer", self.name)
        self.transferFrom = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFrom(frm, to, value).transact({'from': sender}), "transferFrom", self.name)
        self.transferSenderPaysFee = lambda sender, recipient, value: mine_tx(
            self.contract.functions.transferSenderPaysFee(recipient, value).transact({'from': sender}), "transferSenderPaysFee", self.name)
        self.transferFromSenderPaysFee = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFromSenderPaysFee(frm, to, value).transact({'from': sender}), "transferFromSenderPaysFee", self.name)

        self.approve = lambda sender, spender, value: mine_tx(
            self.contract.functions.approve(spender, value).transact({'from': sender}), "approve", self.name)

        # onlyCourt
        self.confiscateBalance = lambda sender, target: mine_tx(
            self.contract.functions.confiscateBalance(target).transact({'from': sender}), "confiscateBalance", self.name)
        # onlyOwner
        self.unfreezeAccount = lambda sender, target: mine_tx(
            self.contract.functions.unfreezeAccount(target).transact({'from': sender}), "unfreezeAccount", self.name)

        # onlyHavven
        self.burn = lambda sender, target, amount: mine_tx(
            self.contract.functions.burn(target, amount).transact({'from': sender}), "burn", self.name)
        self.issue = lambda sender, target, amount: mine_tx(
            self.contract.functions.issue(target, amount).transact({'from': sender}), "issue", self.name)


class PublicNominInterface(NominInterface):
    def __init__(self, contract, name):
        NominInterface.__init__(self, contract, name)
        self.contract = contract
        self.name = name

        self.debugEmptyFeePool = lambda sender: mine_tx(
            self.contract.functions.debugEmptyFeePool().transact({'from': sender}), "debugEmptyFeePool", self.name)
        self.debugFreezeAccount = lambda sender, target: mine_tx(
            self.contract.functions.debugFreezeAccount(target).transact({'from': sender}), "debugFreezeAccount", self.name)

        self.giveNomins = lambda sender, target, amount: mine_tx(
            self.contract.functions.giveNomins(target, amount).transact({'from': sender}), "giveNomins", self.name)
        self.clearNomins = lambda sender, target: mine_tx(
            self.contract.functions.clearNomins(target).transact({'from': sender}), "clearNomins", self.name)

        self.generateFees = lambda sender, amt: mine_tx(
            self.contract.functions.generateFees(amt).transact({'from': sender}), "generateFees", self.name)
from tests.contract_interfaces.extern_state_fee_token_interface import ExternStateFeeTokenInterface
from utils.deployutils import mine_tx


class NominInterface(ExternStateFeeTokenInterface):
    def __init__(self, contract):
        ExternStateFeeTokenInterface.__init__(self, contract)
        self.contract = contract

        self.court = lambda: self.contract.functions.court().call()
        self.havven = lambda: self.contract.functions.havven().call()
        self.frozen = lambda address: self.contract.functions.frozen(address).call()

        self.setCourt = lambda sender, address: mine_tx(
            self.contract.functions.setCourt(address).transact({'from': sender}))
        self.setHavven = lambda sender, address: mine_tx(
            self.contract.functions.setHavven(address).transact({'from': sender}))

        self.transferPlusFee = lambda value: self.contract.functions.transferPlusFee(value).call()
        self.transfer = lambda sender, recipient, value: mine_tx(
            self.contract.functions.transfer(recipient, value).transact({'from': sender}))
        self.transferFrom = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFrom(frm, to, value).transact({'from': sender}))
        self.approve = lambda sender, spender, value: mine_tx(
            self.contract.functions.approve(spender, value).transact({'from': sender}))

        # onlyCourt
        self.confiscateBalance = lambda sender, target: mine_tx(
            self.contract.functions.confiscateBalance(target).transact({'from': sender}))
        # onlyOwner
        self.unfreezeAccount = lambda sender, target: mine_tx(
            self.contract.functions.unfreezeAccount(target).transact({'from': sender}))

        # onlyHavven
        self.burn = lambda sender, target, amount: mine_tx(
            self.contract.functions.burn(target, amount).transact({'from': sender}))
        self.issue = lambda sender, target, amount: mine_tx(
            self.contract.functions.issue(target, amount).transact({'from': sender}))


class PublicNominInterface(NominInterface):
    def __init__(self, contract):
        NominInterface.__init__(self, contract)
        self.contract = contract

        self.debugEmptyFeePool = lambda sender: mine_tx(
            self.contract.functions.debugEmptyFeePool().transact({'from': sender}))
        self.debugFreezeAccount = lambda sender, target: mine_tx(
            self.contract.functions.debugFreezeAccount(target).transact({'from': sender}))

        self.giveNomins = lambda sender, target, amount: mine_tx(
            self.contract.functions.giveNomins(target, amount).transact({'from': sender}))
        self.clearNomins = lambda sender, target: mine_tx(
            self.contract.functions.clearNomins(target).transact({'from': sender}))

        self.generateFees = lambda sender, amt: mine_tx(
            self.contract.functions.generateFees(amt).transact({'from': sender}))
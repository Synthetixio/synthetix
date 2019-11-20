from tests.contract_interfaces.fee_token_interface import FeeTokenInterface
from utils.deployutils import mine_tx


class NominInterface(FeeTokenInterface):
    def __init__(self, contract, name):
        FeeTokenInterface.__init__(self, contract, name)
        self.contract = contract
        self.contract_name = name

        self.havven = lambda: self.contract.functions.havven().call()
        self.frozen = lambda address: self.contract.functions.frozen(
            address).call()

        self.setHavven = lambda sender, address: mine_tx(
            self.contract.functions.setHavven(address).transact({'from': sender}), "setHavven", self.contract_name)

        self.transferPlusFee = lambda value: self.contract.functions.transferPlusFee(
            value).call()
        self.transferFeeIncurred = lambda value: self.contract.functions.transferFeeIncurred(
            value).call()
        self.transfer = lambda sender, recipient, value: mine_tx(
            self.contract.functions.transfer(recipient, value).transact({'from': sender}), "transfer", self.contract_name)
        self.transferFrom = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFrom(frm, to, value).transact({'from': sender}), "transferFrom", self.contract_name)
        self.transferSenderPaysFee = lambda sender, recipient, value: mine_tx(
            self.contract.functions.transferSenderPaysFee(recipient, value).transact({'from': sender}), "transferSenderPaysFee", self.contract_name)
        self.transferFromSenderPaysFee = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFromSenderPaysFee(frm, to, value).transact({'from': sender}), "transferFromSenderPaysFee", self.contract_name)

        self.approve = lambda sender, spender, value: mine_tx(
            self.contract.functions.approve(spender, value).transact({'from': sender}), "approve", self.contract_name)

        # onlyOwner
        self.unfreezeAccount = lambda sender, target: mine_tx(
            self.contract.functions.unfreezeAccount(target).transact({'from': sender}), "unfreezeAccount", self.contract_name)

        # onlyHavven
        self.burn = lambda sender, target, amount: mine_tx(
            self.contract.functions.burn(target, amount).transact({'from': sender}), "burn", self.contract_name)
        self.issue = lambda sender, target, amount: mine_tx(
            self.contract.functions.issue(target, amount).transact({'from': sender}), "issue", self.contract_name)

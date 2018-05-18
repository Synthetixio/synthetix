from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface
from tests.contract_interfaces.owned_interface import OwnedInterface
from utils.deployutils import mine_tx


class ExternStateFeeTokenInterface(SafeDecimalMathInterface, OwnedInterface):
    def __init__(self, contract, name):
        SafeDecimalMathInterface.__init__(self, contract, name)
        OwnedInterface.__init__(self, contract, name)
        
        self.contract = contract
        self.contract_name = name

        self.totalSupply = lambda: self.contract.functions.totalSupply().call()
        self.state = lambda: self.contract.functions.state().call()
        self.name = lambda: self.contract.functions.name().call()
        self.symbol = lambda: self.contract.functions.symbol().call()
        self.balanceOf = lambda account: self.contract.functions.balanceOf(account).call()
        self.allowance = lambda account, spender: self.contract.functions.allowance(account, spender).call()
        self.transferFeeRate = lambda: self.contract.functions.transferFeeRate().call()
        self.feePool = lambda: self.contract.functions.feePool().call()
        self.feeAuthority = lambda: self.contract.functions.feeAuthority().call()

        self.transferFeeIncurred = lambda value: self.contract.functions.transferFeeIncurred(value).call()
        self.transferPlusFee = lambda value: self.contract.functions.transferPlusFee(value).call()
        self.priceToSpend = lambda value: self.contract.functions.priceToSpend(value).call()

        self.setTransferFeeRate = lambda sender, new_fee_rate: mine_tx(
            self.contract.functions.setTransferFeeRate(new_fee_rate).transact({'from': sender}), "setTransferFeeRate", self.contract_name)
        self.setFeeAuthority = lambda sender, new_fee_authority: mine_tx(
            self.contract.functions.setFeeAuthority(new_fee_authority).transact({'from': sender}), "setFeeAuthority", self.contract_name)
        self.setState = lambda sender, new_state: mine_tx(
            self.contract.functions.setState(new_state).transact({'from': sender}), "setState", self.contract_name)
        self.transfer = lambda sender, to, value: mine_tx(
            self.contract.functions.transfer(to, value).transact({'from': sender}), "transfer", self.contract_name)
        self.approve = lambda sender, spender, value: mine_tx(
            self.contract.functions.approve(spender, value).transact({'from': sender}), "approve", self.contract_name)
        self.transferFrom = lambda sender, frm, to, value: mine_tx(
            self.contract.functions.transferFrom(frm, to, value).transact({'from': sender}), "transferFrom", self.contract_name)

        self.withdrawFee = lambda sender, account, value: mine_tx(
            self.contract.functions.withdrawFee(account, value).transact({'from': sender}), "withdrawFee", self.contract_name)
        self.donateToFeePool = lambda sender, value: mine_tx(
            self.contract.functions.donateToFeePool(value).transact({'from': sender}), "donateToFeePool", self.contract_name)

class PublicExternStateFeeTokenInterface(ExternStateFeeTokenInterface):
    def __init__(self, contract, name):
        ExternStateFeeTokenInterface.__init__(self, contract, name)

        self.clearTokens = lambda sender, address: mine_tx(
            self.contract.functions.clearTokens(address).transact({"from": sender}), "clearTokens", self.contract_name)
        self.giveTokens = lambda sender, address, value: mine_tx(
            self.contract.functions.giveTokens(address, value).transact({"from": sender}), "giveTokens", self.contract_name)
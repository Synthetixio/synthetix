from tests.contract_interfaces.state_interface import StateInterface
from utils.deployutils import mine_tx


class TokenStateInterface(StateInterface):
    def __init__(self, contract, name):
        StateInterface.__init__(self, contract, name)
        self.contract = contract
        self.contract_name = name

        self.balanceOf = lambda acc: self.contract.functions.balanceOf(acc).call()
        self.allowance = lambda frm, to: self.contract.functions.allowance(frm, to).call()

        self.setAllowance = lambda sender, token_owner, spender, value: mine_tx(
            self.contract.functions.setAllowance(token_owner, spender, value).transact({'from': sender}), "setAllowance", self.contract_name)
        self.setBalanceOf = lambda sender, account, value: mine_tx(
            self.contract.functions.setBalanceOf(account, value).transact({'from': sender}), "setBalanceOf", self.contract_name)
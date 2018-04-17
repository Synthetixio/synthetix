from tests.contract_interfaces.state_interface import StateInterface
from utils.deployutils import mine_tx


class TokenStateInterface(StateInterface):
    def __init__(self, contract):
        StateInterface.__init__(self, contract)

        cls.balanceOf = lambda self, acc: cls.tokenstate.functions.balanceOf(acc).call()
        cls.allowance = lambda self, frm, to: cls.tokenstate.functions.allowance(frm, to).call()

        cls.setAllowance = lambda self, sender, tokenOwner, spender, value: mine_tx(
            cls.tokenstate.functions.setAllowance(tokenOwner, spender, value).transact({'from': sender}))
        cls.setBalanceOf = lambda self, sender, account, value: mine_tx(
            cls.tokenstate.functions.setBalanceOf(account, value).transact({'from': sender}))
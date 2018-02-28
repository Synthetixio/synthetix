import unittest
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, \
    UNIT, MASTER, DUMMY, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, generate_topic_event_map
from utils.testutils import ZERO_ADDRESS

ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"
ERC20State_SOURCE = "contracts/ERC20State.sol"
ERC20FeeState_SOURCE = "contracts/ERC20FeeState.sol"


def deploy_state(compiled, sender, owner, supply, beneficiary, associated_contract):
    state_contract, construction_tx = attempt_deploy(
        compiled, 'ERC20State', sender, [owner, supply, beneficiary, associated_contract]
    )
    return state_contract


def setUpModule():
    print("Testing Upgrade...")


def tearDownModule():
    print()


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20_abi = cls.compiled['ERC20Token']['abi']
        cls.erc20_event_dict = generate_topic_event_map(cls.erc20_abi)

        cls.erc20token, cls.construction_txr = attempt_deploy(
            cls.compiled, 'ERC20Token', MASTER, ["Test Token", "TEST", 1000 * UNIT, MASTER, ZERO_ADDRESS, MASTER]
        )
        cls.erc20state = deploy_state(cls.compiled, MASTER, MASTER, 1000 * UNIT, MASTER, cls.erc20token.address)

        cls.tok_set_state = lambda self, sender, addr: mine_tx(
            cls.erc20token.functions.setState(addr).transact({'from': sender}))
        cls.tok_state = lambda self: cls.erc20token.functions.state().call()
        cls.tok_totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.tok_name = lambda self: cls.erc20token.functions.name().call()
        cls.tok_symbol = lambda self: cls.erc20token.functions.symbol().call()
        cls.tok_balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account).call()
        cls.tok_allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender).call()

        cls.tok_transfer = lambda self, sender, argSender, to, value: mine_tx(
            cls.erc20token.functions.transfer(argSender, to, value).transact({'from': sender}))
        cls.tok_approve = lambda self, sender, spender, value: mine_tx(
            cls.erc20token.functions.approve(spender, value).transact({'from': sender}))
        cls.tok_transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.erc20token.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.state_setAssociatedContract = lambda self, sender, addr: mine_tx(
            cls.erc20state.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.state_setAllowance = lambda self, sender, frm, to, val: mine_tx(
            cls.erc20state.functions.setAllowance(frm, to, val).transact({'from': sender}))
        cls.state_setBalance = lambda self, sender, acc, val: mine_tx(
            cls.erc20state.functions.setBalance(acc, val).transact({'from': sender}))
        cls.state_setTotalSupply = lambda self, sender, val: mine_tx(
            cls.erc20state.functions.setTotalSupply(val).transact({'from': sender}))

        cls.state_associatedContract = lambda self: cls.erc20state.functions.associatedContract().call()
        cls.state_totalSupply = lambda self: cls.erc20state.functions.totalSupply().call()
        cls.state_balanceOf = lambda self, acc: cls.erc20state.functions.balanceOf(acc).call()
        cls.state_allowance = lambda self, frm, to: cls.erc20state.functions.allowance(frm, to).call()

        cls.tok_set_state(cls, MASTER, cls.erc20state.address)

    def test_constructor(self):
        self.assertEqual(self.tok_name(), "Test Token")
        self.assertEqual(self.tok_symbol(), "TEST")
        self.assertEqual(self.tok_totalSupply(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEquals(self.tok_state(), self.erc20state.address)

    def test_change_state(self):
        new_state = ZERO_ADDRESS
        # ensure only master can set state
        self.assertReverts(self.tok_set_state, DUMMY, new_state)
        self.tok_set_state(MASTER, new_state)
        # assert an invalid state reverts when calling functions that are part of state
        self.assertReverts(self.tok_totalSupply)

        valid_state = deploy_state(self.compiled, MASTER, MASTER, 100 * UNIT, MASTER, self.erc20token.address)
        self.tok_set_state(MASTER, valid_state.address)
        self.assertEqual(self.tok_totalSupply(), 100 * UNIT)

    def test_change_token(self):
        new_token = ZERO_ADDRESS
        self.assertReverts(self.state_setAssociatedContract, DUMMY, new_token)
        self.state_setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.state_associatedContract(), new_token)
        self.assertReverts(self.tok_transfer, MASTER, MASTER, DUMMY, UNIT)

        # valid_state = deploy_state(self.compiled, MASTER, DUMMY, 100 * UNIT, MASTER, self.erc20token.address)

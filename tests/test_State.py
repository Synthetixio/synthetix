import unittest
from utils.deployutils import compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_accounts, take_snapshot, restore_snapshot, ETHER
from utils.testutils import assertReverts, block_time, assertClose, generate_topic_event_map
from utils.testutils import ZERO_ADDRESS

ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"
ERC20State_SOURCE = "contracts/ERC20State.sol"
ERC20FeeState_SOURCE = "contracts/ERC20FeeState.sol"


def deploy_state(name, compiled, sender, owner, supply, beneficiary, associated_contract):
    state_contract, construction_tx = attempt_deploy(
        compiled, name, sender, [owner, supply, beneficiary, associated_contract]
    )
    return state_contract


def setUpModule():
    print("Testing Upgrade...")


def tearDownModule():
    print()


class TestERC20State(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.compiled = compile_contracts([ERC20Token_SOURCE])

        cls.erc20token, cls.construction_txr = attempt_deploy(
            cls.compiled, 'ERC20Token', MASTER, ["Test Token", "TEST", 1000 * UNIT, MASTER, ZERO_ADDRESS, MASTER]
        )
        cls.erc20state = deploy_state('ERC20State', cls.compiled, MASTER, MASTER, 1000 * UNIT, MASTER, cls.erc20token.address)

        cls.tok_set_state = lambda self, sender, addr: mine_tx(cls.erc20token.functions.setState(addr).transact({'from': sender}))
        cls.tok_state = lambda self: cls.erc20token.functions.state().call()
        cls.tok_totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.tok_name = lambda self: cls.erc20token.functions.name().call()
        cls.tok_symbol = lambda self: cls.erc20token.functions.symbol().call()
        cls.tok_balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account).call()
        cls.tok_allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender).call()

        cls.tok_transfer = lambda self, sender, to, value: mine_tx(
            cls.erc20token.functions.transfer(to, value).transact({'from': sender}))
        cls.tok_approve = lambda self, sender, spender, value: mine_tx(
            cls.erc20token.functions.approve(spender, value).transact({'from': sender}))
        cls.tok_transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.erc20token.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.state_setAssociatedContract = lambda self, sender, addr: mine_tx(cls.erc20state.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.state_setAllowance = lambda self, sender, frm, to, val: mine_tx(cls.erc20state.functions.setAllowance(frm, to, val).transact({'from': sender}))
        cls.state_setBalance = lambda self, sender, acc, val: mine_tx(cls.erc20state.functions.setBalance(acc, val).transact({'from': sender}))
        cls.state_setTotalSupply = lambda self, sender, val: mine_tx(cls.erc20state.functions.setTotalSupply(val).transact({'from': sender}))

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

        valid_state = deploy_state('ERC20State', self.compiled, MASTER, MASTER, 100 * UNIT, MASTER, self.erc20token.address)
        self.tok_set_state(MASTER, valid_state.address)
        self.assertEqual(self.tok_totalSupply(), 100 * UNIT)

    def test_change_token(self):
        new_token = ZERO_ADDRESS
        self.assertReverts(self.state_setAssociatedContract, DUMMY, new_token)
        self.state_setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.state_associatedContract(), new_token)
        self.assertReverts(self.tok_transfer, MASTER, DUMMY, UNIT)

        valid_token, txr = attempt_deploy(
            self.compiled, 'ERC20Token', MASTER, ["Test2", "TEST2", 100 * UNIT, MASTER, self.erc20state.address, MASTER]
        )

        self.state_setAssociatedContract(MASTER, valid_token.address)

        mine_tx(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)

    def test_balances_after_swap(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'ERC20Token', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, self.erc20state.address, MASTER]
        )
        # new token only reads balances, but state doesn't accept any changes from it, until the token is
        #   set in the state as the associated contract

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 0)
        self.assertEqual(self.tok_balanceOf(DUMMY), 0)

        self.tok_transfer(MASTER, DUMMY, 10 * UNIT)

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 990 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 10 * UNIT)

        # assert transaction reverts before the state sets the associated contract
        self.assertReverts(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact, {'from': MASTER})

        self.state_setAssociatedContract(MASTER, valid_token.address)

        # do the transaction with the new token
        mine_tx(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact({'from': MASTER}))

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 980 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 20 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)

        self.assertReverts(self.tok_transfer, MASTER, DUMMY, 10 * UNIT)

    def test_allowances(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'ERC20Token', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, self.erc20state.address, MASTER]
        )

        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.tok_approve(MASTER, DUMMY, 100 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 100 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 100 * UNIT)

        self.tok_transferFrom(DUMMY, MASTER, DUMMY, 20 * UNIT)

        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 80 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 80 * UNIT)

        self.state_setAssociatedContract(MASTER, valid_token.address)

        self.assertReverts(self.tok_transferFrom, DUMMY, MASTER, DUMMY, 20 * UNIT)

        mine_tx(valid_token.functions.transferFrom(MASTER, DUMMY, 20 * UNIT).transact({'from': DUMMY}))

        self.assertEqual(self.state_balanceOf(MASTER), 960 * UNIT)
        self.assertEqual(self.state_balanceOf(DUMMY), 40 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 60 * UNIT)
        self.assertEqual(self.state_allowance(MASTER, DUMMY), 60 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 60 * UNIT)

        mine_tx(valid_token.functions.approve(DUMMY, 0).transact({'from': MASTER}))

        self.assertEqual(self.state_balanceOf(MASTER), 960 * UNIT)
        self.assertEqual(self.state_balanceOf(DUMMY), 40 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.assertEqual(self.state_allowance(MASTER, DUMMY), 0)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 0)

        self.assertReverts(valid_token.functions.transferFrom(MASTER, DUMMY, 20 * UNIT).transact, {'from': DUMMY})


class TestERC20FeeState(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.compiled = compile_contracts([ERC20FeeToken_SOURCE])

        cls.fee_beneficiary = fresh_accounts(1)[0]
        cls.erc20feetoken, cls.construction_txr = attempt_deploy(
            cls.compiled, 'ERC20FeeToken', MASTER, ["Test Token", "TEST", 1000 * UNIT, MASTER, UNIT//100, cls.fee_beneficiary, ZERO_ADDRESS, MASTER]
        )
        cls.erc20feestate = deploy_state('ERC20FeeState', cls.compiled, MASTER, MASTER, 1000 * UNIT, MASTER, cls.erc20feetoken.address)

        cls.tok_set_state = lambda self, sender, addr: mine_tx(cls.erc20feetoken.functions.setState(addr).transact({'from': sender}))
        cls.tok_state = lambda self: cls.erc20feetoken.functions.state().call()
        cls.tok_totalSupply = lambda self: cls.erc20feetoken.functions.totalSupply().call()
        cls.tok_name = lambda self: cls.erc20feetoken.functions.name().call()
        cls.tok_symbol = lambda self: cls.erc20feetoken.functions.symbol().call()
        cls.tok_balanceOf = lambda self, account: cls.erc20feetoken.functions.balanceOf(account).call()
        cls.tok_allowance = lambda self, account, spender: cls.erc20feetoken.functions.allowance(account, spender).call()

        cls.tok_transfer = lambda self, sender, to, value: mine_tx(
            cls.erc20feetoken.functions.transfer(to, value).transact({'from': sender}))
        cls.tok_approve = lambda self, sender, spender, value: mine_tx(
            cls.erc20feetoken.functions.approve(spender, value).transact({'from': sender}))
        cls.tok_transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.erc20feetoken.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.state_setAssociatedContract = lambda self, sender, addr: mine_tx(cls.erc20feestate.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.state_setAllowance = lambda self, sender, frm, to, val: mine_tx(cls.erc20feestate.functions.setAllowance(frm, to, val).transact({'from': sender}))
        cls.state_setBalance = lambda self, sender, acc, val: mine_tx(cls.erc20feestate.functions.setBalance(acc, val).transact({'from': sender}))
        cls.state_setTotalSupply = lambda self, sender, val: mine_tx(cls.erc20feestate.functions.setTotalSupply(val).transact({'from': sender}))

        cls.state_associatedContract = lambda self: cls.erc20feestate.functions.associatedContract().call()
        cls.state_totalSupply = lambda self: cls.erc20feestate.functions.totalSupply().call()
        cls.state_balanceOf = lambda self, acc: cls.erc20feestate.functions.balanceOf(acc).call()
        cls.state_allowance = lambda self, frm, to: cls.erc20feestate.functions.allowance(frm, to).call()
        cls.state_frozen = lambda self, acc: cls.erc20feestate.functions.isFrozen(acc).call()
        cls.state_feePool = lambda self: cls.erc20feestate.functions.feePool().call()

        cls.tok_set_state(cls, MASTER, cls.erc20feestate.address)

    def test_constructor(self):
        self.assertEqual(self.tok_name(), "Test Token")
        self.assertEqual(self.tok_symbol(), "TEST")
        self.assertEqual(self.tok_totalSupply(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEquals(self.tok_state(), self.erc20feestate.address)

    def test_change_state(self):
        new_state = ZERO_ADDRESS
        # ensure only master can set state
        self.assertReverts(self.tok_set_state, DUMMY, new_state)
        self.tok_set_state(MASTER, new_state)
        # assert an invalid state reverts when calling functions that are part of state
        self.assertReverts(self.tok_totalSupply)

        valid_state = deploy_state('ERC20FeeState', self.compiled, MASTER, MASTER, 100 * UNIT, MASTER, self.erc20feetoken.address)
        self.tok_set_state(MASTER, valid_state.address)
        self.assertEqual(self.tok_totalSupply(), 100 * UNIT)

    def test_change_token(self):
        new_token = ZERO_ADDRESS
        self.assertReverts(self.state_setAssociatedContract, DUMMY, new_token)
        self.state_setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.state_associatedContract(), new_token)
        self.assertReverts(self.tok_transfer, MASTER, DUMMY, UNIT)

        valid_token, txr = attempt_deploy(
            self.compiled, 'ERC20FeeToken', MASTER, ["Test2", "TEST2", 100 * UNIT, MASTER, UNIT//100, self.fee_beneficiary, self.erc20feestate.address, MASTER]
        )

        self.state_setAssociatedContract(MASTER, valid_token.address)

        mine_tx(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        fee = int(10 * UNIT * 0.01)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT - fee)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

    def test_balances_remain_after_swap(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'ERC20FeeToken', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, UNIT//100, self.fee_beneficiary, self.erc20feestate.address, MASTER]
        )
        # new token only reads balances, but state doesn't accept any changes from it, until the token is
        #   set in the state as the associated contract

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 0)
        self.assertEqual(self.tok_balanceOf(DUMMY), 0)

        self.tok_transfer(MASTER, DUMMY, 10 * UNIT)
        fee = int(10 * UNIT * 0.01)

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(MASTER), 990 * UNIT - fee)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 10 * UNIT)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

        # assert transaction reverts before the state sets the associated contract
        self.assertReverts(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact, {'from': MASTER})

        self.state_setAssociatedContract(MASTER, valid_token.address)

        # do the transaction with the new token
        mine_tx(valid_token.functions.transfer(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        fee = fee*2

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 980 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT - fee)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 20 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

        self.assertReverts(self.tok_transfer, MASTER, DUMMY, 10 * UNIT)

    def test_allowances(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'ERC20FeeToken', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, UNIT//100, self.fee_beneficiary, self.erc20feestate.address, MASTER]
        )

        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.tok_approve(MASTER, DUMMY, 100 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 100 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 100 * UNIT)

        fee = int(20 * UNIT * 0.01)
        self.tok_transferFrom(DUMMY, MASTER, DUMMY, 20 * UNIT)

        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 80 * UNIT - fee)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 80 * UNIT - fee)

        self.state_setAssociatedContract(MASTER, valid_token.address)

        self.assertReverts(self.tok_transferFrom, DUMMY, MASTER, DUMMY, 20 * UNIT)

        fee = int(20 * UNIT * 0.01) + fee

        mine_tx(valid_token.functions.transferFrom(MASTER, DUMMY, 20 * UNIT).transact({'from': DUMMY}))

        self.assertEqual(self.state_balanceOf(MASTER), 960 * UNIT - fee)
        self.assertEqual(self.state_balanceOf(DUMMY), 40 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 60 * UNIT - fee)
        self.assertEqual(self.state_allowance(MASTER, DUMMY), 60 * UNIT - fee)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 60 * UNIT - fee)

        mine_tx(valid_token.functions.approve(DUMMY, 0).transact({'from': MASTER}))

        self.assertEqual(self.state_balanceOf(MASTER), 960 * UNIT - fee)
        self.assertEqual(self.state_balanceOf(DUMMY), 40 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.assertEqual(self.state_allowance(MASTER, DUMMY), 0)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 0)

        self.assertReverts(valid_token.functions.transferFrom(MASTER, DUMMY, 20 * UNIT).transact, {'from': DUMMY})

        self.assertEqual(self.state_feePool(), fee)

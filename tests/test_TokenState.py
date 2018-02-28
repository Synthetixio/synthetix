import unittest
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, \
    UNIT, MASTER, DUMMY, fresh_accounts, take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import ZERO_ADDRESS


ExternStateProxyToken_SOURCE = "tests/contracts/PublicExternStateProxyToken.sol"
ExternStateProxyFeeToken_SOURCE = "tests/contracts/PublicExternStateProxyFeeToken.sol"
TokenState_SOURCE = "contracts/TokenState.sol"
FeeTokenState_SOURCE = "contracts/FeeTokenState.sol"
FAKEPROXY_SOURCE = "tests/contracts/FakeProxy.sol"


def deploy_state(name, compiled, sender, owner, supply, beneficiary, associated_contract):
    state_contract, construction_tx = attempt_deploy(
        compiled, name, sender, [owner, supply, beneficiary, associated_contract]
    )
    return state_contract


def setUpModule():
    print("Testing token state contracts...")


def tearDownModule():
    print()


class TestTokenState(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.compiled = compile_contracts([ExternStateProxyToken_SOURCE, FAKEPROXY_SOURCE],
                                         remappings=['""=contracts'])

        cls.token, cls.construction_txr = attempt_deploy(
            cls.compiled, 'PublicExternStateProxyToken', MASTER, ["Test Token", "TEST", 1000 * UNIT, MASTER, ZERO_ADDRESS, MASTER]
        )
        cls.tokenstate = deploy_state('TokenState', cls.compiled, MASTER, MASTER, 1000 * UNIT, MASTER,
                                      cls.token.address)

        cls.fake_proxy, _ = attempt_deploy(cls.compiled, 'FakeProxy', MASTER, [])
        mine_tx(cls.token.functions.setProxy(cls.fake_proxy.address).transact({'from': MASTER}))

        mine_tx(cls.token.functions.setState(cls.tokenstate.address).transact({'from': MASTER}))

        cls.tok_set_state = lambda self, sender, addr: mine_tx(
            cls.token.functions.setState(addr).transact({'from': sender}))
        cls.tok_state = lambda self: cls.token.functions.state().call()
        cls.tok_totalSupply = lambda self: cls.token.functions.totalSupply().call()
        cls.tok_name = lambda self: cls.token.functions.name().call()
        cls.tok_symbol = lambda self: cls.token.functions.symbol().call()
        cls.tok_balanceOf = lambda self, account: cls.token.functions.balanceOf(account).call()
        cls.tok_allowance = lambda self, account, spender: cls.token.functions.allowance(account, spender).call()

        cls.tok_transfer_byProxy = lambda self, sender, to, value: mine_tx(
            cls.token.functions.transfer_byProxy(to, value).transact({'from': sender}))
        cls.tok_approve = lambda self, sender, spender, value: mine_tx(
            cls.token.functions.approve(spender, value).transact({'from': sender}))
        cls.tok_transferFrom_byProxy = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.token.functions.transferFrom_byProxy(fromAccount, to, value).transact({'from': sender}))

        cls.state_setAssociatedContract = lambda self, sender, addr: mine_tx(
            cls.tokenstate.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.state_setAllowance = lambda self, sender, frm, to, val: mine_tx(
            cls.tokenstate.functions.setAllowance(frm, to, val).transact({'from': sender}))
        cls.state_setBalance = lambda self, sender, acc, val: mine_tx(
            cls.tokenstate.functions.setBalance(acc, val).transact({'from': sender}))
        cls.state_setTotalSupply = lambda self, sender, val: mine_tx(
            cls.tokenstate.functions.setTotalSupply(val).transact({'from': sender}))

        cls.state_associatedContract = lambda self: cls.tokenstate.functions.associatedContract().call()
        cls.state_totalSupply = lambda self: cls.tokenstate.functions.totalSupply().call()
        cls.state_balanceOf = lambda self, acc: cls.tokenstate.functions.balanceOf(acc).call()
        cls.state_allowance = lambda self, frm, to: cls.tokenstate.functions.allowance(frm, to).call()

    def test_constructor(self):
        self.assertEqual(self.tok_name(), "Test Token")
        self.assertEqual(self.tok_symbol(), "TEST")
        self.assertEqual(self.tok_totalSupply(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEquals(self.tok_state(), self.tokenstate.address)

    def test_change_state(self):
        new_state = ZERO_ADDRESS
        # ensure only master can set state
        self.assertReverts(self.tok_set_state, DUMMY, new_state)
        self.tok_set_state(MASTER, new_state)
        # assert an invalid state reverts when calling functions that are part of state
        self.assertReverts(self.tok_totalSupply)

        valid_state = deploy_state('TokenState', self.compiled, MASTER, MASTER, 100 * UNIT, MASTER,
                                   self.token.address)
        self.tok_set_state(MASTER, valid_state.address)
        self.assertEqual(self.tok_totalSupply(), 100 * UNIT)

    def test_change_token(self):
        new_token = ZERO_ADDRESS
        self.assertReverts(self.state_setAssociatedContract, DUMMY, new_token)
        self.state_setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.state_associatedContract(), new_token)
        self.assertReverts(self.tok_transfer_byProxy, MASTER, DUMMY, UNIT)

        valid_token, txr = attempt_deploy(
            self.compiled, 'PublicExternStateProxyToken', MASTER, ["Test2", "TEST2", 100 * UNIT, MASTER, self.tokenstate.address, MASTER]
        )

        self.state_setAssociatedContract(MASTER, valid_token.address)

        mine_tx(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)

    def test_balances_after_swap(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'PublicExternStateProxyToken', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, self.tokenstate.address, MASTER]
        )
        # new token only reads balances, but state doesn't accept any changes from it, until the token is
        #   set in the state as the associated contract

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 0)
        self.assertEqual(self.tok_balanceOf(DUMMY), 0)

        self.tok_transfer_byProxy(MASTER, DUMMY, 10 * UNIT)

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 990 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 10 * UNIT)

        # assert transaction reverts before the state sets the associated contract
        self.assertReverts(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact, {'from': MASTER})

        self.state_setAssociatedContract(MASTER, valid_token.address)

        # do the transaction with the new token
        mine_tx(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact({'from': MASTER}))

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 980 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 20 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)

        self.assertReverts(self.tok_transfer_byProxy, MASTER, DUMMY, 10 * UNIT)

    def test_allowances(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'PublicExternStateProxyToken', MASTER, ["Test2", "TEST2", 0, ZERO_ADDRESS, self.tokenstate.address, MASTER]
        )
        fake_proxy, _ = attempt_deploy(self.compiled, 'FakeProxy', MASTER, [])
        mine_tx(valid_token.functions.setProxy(fake_proxy.address).transact({'from': MASTER}))

        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.tok_approve(MASTER, DUMMY, 100 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 100 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 100 * UNIT)

        self.tok_transferFrom_byProxy(DUMMY, MASTER, DUMMY, 20 * UNIT)

        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 80 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 80 * UNIT)

        self.state_setAssociatedContract(MASTER, valid_token.address)

        self.assertReverts(self.tok_transferFrom_byProxy, DUMMY, MASTER, DUMMY, 20 * UNIT)

        mine_tx(valid_token.functions.transferFrom_byProxy(MASTER, DUMMY, 20 * UNIT).transact({'from': DUMMY}))

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

        self.assertReverts(
            valid_token.functions.transferFrom_byProxy(MASTER, DUMMY, 20 * UNIT).transact, {'from': DUMMY}
        )


class TestFeeTokenState(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertReverts = assertReverts

        cls.compiled = compile_contracts([ExternStateProxyFeeToken_SOURCE, FAKEPROXY_SOURCE],
                                         remappings=['""=contracts'])

        cls.fee_beneficiary = fresh_accounts(1)[0]
        cls.feetoken, cls.construction_txr = attempt_deploy(
            cls.compiled, 'PublicExternStateProxyFeeToken', MASTER,
            ["Test Token", "TEST", MASTER, UNIT // 100, cls.fee_beneficiary, ZERO_ADDRESS, MASTER]
        )
        cls.feestate = deploy_state('FeeTokenState', cls.compiled, MASTER, MASTER, 1000 * UNIT, MASTER,
                                         cls.feetoken.address)

        cls.fake_proxy, _ = attempt_deploy(cls.compiled, 'FakeProxy', MASTER, [])
        mine_tx(cls.feetoken.functions.setProxy(cls.fake_proxy.address).transact({'from': MASTER}))

        mine_tx(cls.feetoken.functions.setState(cls.feestate.address).transact({'from': MASTER}))

        cls.tok_set_state = lambda self, sender, addr: mine_tx(
            cls.feetoken.functions.setState(addr).transact({'from': sender}))
        cls.tok_state = lambda self: cls.feetoken.functions.state().call()
        cls.tok_totalSupply = lambda self: cls.feetoken.functions.totalSupply().call()
        cls.tok_name = lambda self: cls.feetoken.functions.name().call()
        cls.tok_symbol = lambda self: cls.feetoken.functions.symbol().call()
        cls.tok_balanceOf = lambda self, account: cls.feetoken.functions.balanceOf(account).call()
        cls.tok_allowance = lambda self, account, spender: cls.feetoken.functions.allowance(account,
                                                                                                 spender).call()

        cls.tok_transfer_byProxy = lambda self, sender, to, value: mine_tx(
            cls.feetoken.functions.transfer_byProxy(to, value).transact({'from': sender}))
        cls.tok_approve = lambda self, sender, argSender, spender, value: mine_tx(
            cls.feetoken.functions.approve(spender, value).transact({'from': sender}))
        cls.tok_transferFrom_byProxy = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.feetoken.functions.transferFrom_byProxy(fromAccount, to, value).transact({'from': sender}))

        cls.state_setAssociatedContract = lambda self, sender, addr: mine_tx(
            cls.feestate.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.state_setAllowance = lambda self, sender, frm, to, val: mine_tx(
            cls.feestate.functions.setAllowance(frm, to, val).transact({'from': sender}))
        cls.state_setBalance = lambda self, sender, acc, val: mine_tx(
            cls.feestate.functions.setBalance(acc, val).transact({'from': sender}))
        cls.state_setTotalSupply = lambda self, sender, val: mine_tx(
            cls.feestate.functions.setTotalSupply(val).transact({'from': sender}))

        cls.state_associatedContract = lambda self: cls.feestate.functions.associatedContract().call()
        cls.state_totalSupply = lambda self: cls.feestate.functions.totalSupply().call()
        cls.state_balanceOf = lambda self, acc: cls.feestate.functions.balanceOf(acc).call()
        cls.state_allowance = lambda self, frm, to: cls.feestate.functions.allowance(frm, to).call()
        cls.state_frozen = lambda self, acc: cls.feestate.functions.isFrozen(acc).call()
        cls.state_feePool = lambda self: cls.feestate.functions.feePool().call()

    def test_constructor(self):
        self.assertEqual(self.tok_name(), "Test Token")
        self.assertEqual(self.tok_symbol(), "TEST")
        self.assertEqual(self.tok_totalSupply(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEquals(self.tok_state(), self.feestate.address)

    def test_change_state(self):
        new_state = ZERO_ADDRESS
        # ensure only master can set state
        self.assertReverts(self.tok_set_state, DUMMY, new_state)
        self.tok_set_state(MASTER, new_state)
        # assert an invalid state reverts when calling functions that are part of state
        self.assertReverts(self.tok_totalSupply)

        valid_state = deploy_state('FeeTokenState', self.compiled, MASTER, MASTER, 100 * UNIT, MASTER,
                                   self.feetoken.address)
        self.tok_set_state(MASTER, valid_state.address)
        self.assertEqual(self.tok_totalSupply(), 100 * UNIT)

    def test_change_token(self):
        new_token = ZERO_ADDRESS
        self.assertReverts(self.state_setAssociatedContract, DUMMY, new_token)
        self.state_setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.state_associatedContract(), new_token)
        self.assertReverts(self.tok_transfer_byProxy, MASTER, DUMMY, UNIT)

        valid_token, txr = attempt_deploy(
            self.compiled, 'PublicExternStateProxyFeeToken', MASTER,
            ["Test2", "TEST2", MASTER, UNIT // 100, self.fee_beneficiary, self.feestate.address,
             MASTER]
        )
        fake_proxy, _ = attempt_deploy(self.compiled, 'FakeProxy', MASTER, [])
        mine_tx(valid_token.functions.setProxy(fake_proxy.address).transact({'from': MASTER}))

        self.state_setAssociatedContract(MASTER, valid_token.address)

        mine_tx(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        fee = int(10 * UNIT * 0.01)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT - fee)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

    def test_balances_remain_after_swap(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'PublicExternStateProxyFeeToken', MASTER,
            ["Test2", "TEST2", ZERO_ADDRESS, UNIT // 100, self.fee_beneficiary, self.feestate.address, MASTER]
        )
        fake_proxy, _ = attempt_deploy(self.compiled, 'FakeProxy', MASTER, [])
        mine_tx(valid_token.functions.setProxy(fake_proxy.address).transact({'from': MASTER}))
        # new token only reads balances, but state doesn't accept any changes from it, until the token is
        #   set in the state as the associated contract

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 1000 * UNIT)
        self.assertEqual(self.tok_balanceOf(MASTER), 1000 * UNIT)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 0)
        self.assertEqual(self.tok_balanceOf(DUMMY), 0)

        self.tok_transfer_byProxy(MASTER, DUMMY, 10 * UNIT)
        fee = int(10 * UNIT * 0.01)

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 990 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(MASTER), 990 * UNIT - fee)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 10 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 10 * UNIT)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

        # assert transaction reverts before the state sets the associated contract
        self.assertReverts(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact, {'from': MASTER})

        self.state_setAssociatedContract(MASTER, valid_token.address)

        # do the transaction with the new token
        mine_tx(valid_token.functions.transfer_byProxy(DUMMY, 10 * UNIT).transact({'from': MASTER}))
        fee = fee * 2

        self.assertEqual(valid_token.functions.balanceOf(MASTER).call(), 980 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT - fee)
        self.assertEqual(valid_token.functions.balanceOf(DUMMY).call(), 20 * UNIT)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(valid_token.functions.feePool().call(), fee)

        self.assertReverts(self.tok_transfer_byProxy, MASTER, DUMMY, 10 * UNIT)

    def test_allowances(self):
        valid_token, txr = attempt_deploy(  # initial supply and beneficiary don't have to be set, as state exists
            self.compiled, 'PublicExternStateProxyFeeToken', MASTER,
            ["Test2", "TEST2", ZERO_ADDRESS, UNIT // 100, self.fee_beneficiary, self.feestate.address, MASTER]
        )
        fake_proxy, _ = attempt_deploy(self.compiled, 'FakeProxy', MASTER, [])
        mine_tx(valid_token.functions.setProxy(fake_proxy.address).transact({'from': MASTER}))

        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 0)
        self.tok_approve(MASTER, MASTER, DUMMY, 100 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 100 * UNIT)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 100 * UNIT)

        fee = int(20 * UNIT * 0.01)
        self.tok_transferFrom_byProxy(DUMMY, MASTER, DUMMY, 20 * UNIT)

        self.assertEqual(self.tok_balanceOf(MASTER), 980 * UNIT - fee)
        self.assertEqual(self.tok_balanceOf(DUMMY), 20 * UNIT)
        self.assertEqual(self.tok_allowance(MASTER, DUMMY), 80 * UNIT - fee)
        self.assertEqual(valid_token.functions.allowance(MASTER, DUMMY).call(), 80 * UNIT - fee)

        self.state_setAssociatedContract(MASTER, valid_token.address)

        self.assertReverts(self.tok_transferFrom_byProxy, DUMMY, MASTER, DUMMY, 20 * UNIT)

        fee = int(20 * UNIT * 0.01) + fee

        mine_tx(valid_token.functions.transferFrom_byProxy(MASTER, DUMMY, 20 * UNIT).transact({'from': DUMMY}))

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

        self.assertReverts(valid_token.functions.transferFrom_byProxy(MASTER, DUMMY, 20 * UNIT).transact, {'from': DUMMY})

        self.assertEqual(self.state_feePool(), fee)

import unittest
from utils.deployutils import compile_contracts, attempt_deploy, mine_tx, \
    UNIT, MASTER, DUMMY, take_snapshot, restore_snapshot
from utils.testutils import assertReverts
from utils.testutils import ZERO_ADDRESS


TokenState_SOURCE = "contracts/TokenState.sol"


def deploy_state(name, compiled, sender, owner, supply, beneficiary, associated_contract):
    state_contract, construction_tx = attempt_deploy(
        compiled, name, sender, [owner, supply, beneficiary, associated_contract]
    )
    return state_contract


def setUpModule():
    print("Testing TokenState...")


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

        cls.compiled = compile_contracts([TokenState_SOURCE],
                                         remappings=['""=contracts'])
        cls.owner = MASTER
        cls.associate = DUMMY

        cls.tokenstate, _ = attempt_deploy(cls.compiled, 'TokenState', MASTER, [cls.owner, cls.associate])

        cls.state_owner = lambda self: cls.tokenstate.functions.owner().call()
        cls.associatedContract = lambda self: cls.tokenstate.functions.associatedContract().call()
        cls.balanceOf = lambda self, acc: cls.tokenstate.functions.balanceOf(acc).call()
        cls.allowance = lambda self, frm, to: cls.tokenstate.functions.allowance(frm, to).call()

        cls.setAssociatedContract = lambda self, sender, addr: mine_tx(
            cls.tokenstate.functions.setAssociatedContract(addr).transact({'from': sender}))
        cls.setAllowance = lambda self, sender, tokenOwner, spender, value: mine_tx(
            cls.tokenstate.functions.setAllowance(tokenOwner, spender, value).transact({'from': sender}))
        cls.setBalanceOf = lambda self, sender, account, value: mine_tx(
            cls.tokenstate.functions.setBalanceOf(account, value).transact({'from': sender}))

    def test_constructor(self):
        self.assertEquals(self.state_owner(), self.owner)
        self.assertEquals(self.associatedContract(), self.associate)

    def test_setAssociatedContract(self):
        new_token = ZERO_ADDRESS

        # Non-owner can't set the associated contract
        self.assertReverts(self.setAssociatedContract, DUMMY, new_token)

        self.assertEqual(self.balanceOf(DUMMY), 0)
        self.setBalanceOf(self.associate, DUMMY, UNIT)
        self.setAssociatedContract(MASTER, new_token)
        self.assertEqual(self.associatedContract(), new_token)
        self.assertEqual(self.balanceOf(DUMMY), UNIT)

    def test_setAllowance(self):

        self.assertEqual(self.allowance(MASTER, DUMMY), 0)
        self.setAllowance(self.associate, MASTER, DUMMY, UNIT)
        self.assertEqual(self.allowance(MASTER, DUMMY), UNIT)

        # Only the associated contract should be able to set allowances.
        self.assertNotEqual(self.associate, MASTER)
        self.assertReverts(self.setAllowance, MASTER, MASTER, DUMMY, UNIT)


    def test_setBalanceOf(self):
        self.assertEqual(self.balanceOf(MASTER), 0)
        self.setBalanceOf(self.associate, MASTER, UNIT)
        self.assertEqual(self.balanceOf(MASTER), UNIT)

        # Only the associated contract should be able to set allowances.
        self.assertNotEqual(self.associate, MASTER)
        self.assertReverts(self.setBalanceOf, MASTER, MASTER, 2*UNIT)

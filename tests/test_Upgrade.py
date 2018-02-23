import unittest
from utils.deployutils import compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_accounts, take_snapshot, restore_snapshot, ETHER
from utils.testutils import assertReverts, block_time, assertClose, generate_topic_event_map

ERC20Token_SOURCE = "contracts/ERC20Token.sol"
ERC20FeeToken_SOURCE = "contracts/ERC20FeeToken.sol"
ERC20State_SOURCE = "contracts/ERC20State.sol"
ERC20FeeState_SOURCE = "contracts/ERC20FeeState.sol"


def setUpModule():
    print("Testing FeeCollection...")


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

        compiled = compile_contracts([ERC20Token_SOURCE])
        cls.erc20_abi = compiled['ERC20Token']['abi']
        cls.erc20_event_dict = generate_topic_event_map(cls.erc20_abi)

        cls.erc20token, cls.construction_txr = attempt_deploy(compiled, 'ERC20Token',
                                                              MASTER, [MASTER, "Test Token", "TEST"])
        cls.erc20state, cls.state_construction_txr = attempt_deploy(
            compiled, 'ERC20State', MASTER, [MASTER, 1000 * UNIT, MASTER, cls.erc20token.address]
        )

        cls.set_state = lambda sender, addr: mine_tx(cls.erc20token.functions.setState(addr).transact({'from': sender}))
        cls.totalSupply = lambda self: cls.erc20token.functions.totalSupply().call()
        cls.name = lambda self: cls.erc20token.functions.name().call()
        cls.symbol = lambda self: cls.erc20token.functions.symbol().call()
        cls.balanceOf = lambda self, account: cls.erc20token.functions.balanceOf(account).call()
        cls.allowance = lambda self, account, spender: cls.erc20token.functions.allowance(account, spender).call()

        cls.transfer = lambda self, sender, to, value: mine_tx(
            cls.erc20token.functions.transfer(to, value).transact({'from': sender}))
        cls.approve = lambda self, sender, spender, value: mine_tx(
            cls.erc20token.functions.approve(spender, value).transact({'from': sender}))
        cls.transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(
            cls.erc20token.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))

        cls.set_state(MASTER, cls.erc20state.address)

    def test_constructor(self):
        pass


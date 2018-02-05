import unittest
from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, to_seconds, fast_forward, fresh_account, fresh_accounts, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, block_time, assertClose, generate_topic_event_map, get_event_data_from_log

SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicEtherNomin.sol",
                    "tests/contracts/FakeCourt.sol"]


def deploy_public_contracts():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [MASTER])
    hvn_block = W3.eth.blockNumber
    nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicEtherNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000 * UNIT, MASTER])
    court_contract, court_txr = attempt_deploy(compiled, 'FakeCourt',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    havven_event_dict = generate_topic_event_map(compiled['PublicHavven']['abi'])

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract, hvn_block, havven_event_dict


def setUpModule():
    print("Testing Havven...")


def tearDownModule():
    print()


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        time_remaining = self.targetFeePeriodDurationSeconds() + self.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 1)
        self.recomputeLastAverageBalance(MASTER)

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
        fast_forward(weeks=102)

        cls.havven, cls.nomin, cls.court, cls.construction_block, cls.havven_event_dict = deploy_public_havven()

        # INHERITED
        # OWNED
        # owner
        cls.h_owner = lambda self: self.havven.functions.owner().call()
        # setOwner
        cls.h_setOwner = lambda self, sender, addr: mine_tx(
            self.havven.functions.setOwner(addr).transact({'from': sender}))

        # ERC20TOKEN (transfer/transferFrom are overwritten)
        # totalSupply
        cls.h_totalSupply = lambda self: self.havven.functions.totalSupply().call()
        cls.h_name = lambda self: self.havven.functions.name().call()
        cls.h_symbol = lambda self: self.havven.functions.symbol().call()
        cls.h_balanceOf = lambda self, a: self.havven.functions.balanceOf(a).call()
        cls.h_allowance = lambda self, owner, spender: self.havven.functions.allowance(owner, spender).call()
        cls.h_approve = lambda self, sender, spender, val: mine_tx(
            self.havven.functions.approve(spender, val).transact({"from": sender}))

        # HAVVEN
        # GETTERS
        cls.h_currentBalanceSum = lambda self, addr: self.havven.functions._currentBalanceSum(addr).call()
        cls.h_lastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()
        cls.h_penultimateAverageBalance = lambda self, addr: self.havven.functions.penultimateAverageBalance(addr).call()
        cls.h_lastTransferTimestamp = lambda self, addr: self.havven.functions._lastTransferTimestamp(addr).call()
        cls.h_hasWithdrawnLastPeriodFees = lambda self, addr: self.havven.functions._hasWithdrawnLastPeriodFees(
            addr).call()
        cls.h_lastAverageBalanceNeedsRecomputation = lambda self, addr: self.havven.functions.lastAverageBalanceNeedsRecomputation(addr).call()

        cls.h_feePeriodStartTime = lambda self: self.havven.functions.feePeriodStartTime().call()
        cls.h_lastFeePeriodStartTime = lambda self: self.havven.functions._lastFeePeriodStartTime().call()
        cls.h_penultimateFeePeriodStartTime = lambda self: self.havven.functions._penultimateFeePeriodStartTime().call()
        cls.h_targetFeePeriodDurationSeconds = lambda self: self.havven.functions.targetFeePeriodDurationSeconds().call()
        cls.h_minFeePeriodDurationSeconds = lambda self: self.havven.functions._minFeePeriodDurationSeconds().call()
        cls.h_maxFeePeriodDurationSeconds = lambda self: self.havven.functions._maxFeePeriodDurationSeconds().call()
        cls.h_lastFeesCollected = lambda self: self.havven.functions.lastFeesCollected().call()

        cls.h_get_nomin = lambda self: self.havven.functions.nomin().call()

        #
        # SETTERS
        cls.h_setNomin = lambda self, sender, addr: mine_tx(
            self.havven.functions.setNomin(addr).transact({'from': sender}))
        cls.h_setTargetFeePeriodDuration = lambda self, sender, dur: mine_tx(
            self.havven.functions.setTargetFeePeriodDuration(dur).transact({'from': sender}))

        #
        # FUNCTIONS
        cls.h_endow = lambda self, sender, addr, amt: mine_tx(
            self.havven.functions.endow(addr, amt).transact({'from': sender}))
        cls.h_transfer = lambda self, sender, addr, amt: mine_tx(
            self.havven.functions.transfer(addr, amt).transact({'from': sender}))
        cls.h_transferFrom = lambda self, sender, frm, to, amt: mine_tx(
            self.havven.functions.transferFrom(frm, to, amt).transact({'from': sender}))
        cls.h_recomputeLastAverageBalance = lambda self, sender: mine_tx(
            self.havven.functions.recomputeLastAverageBalance().transact({'from': sender}))
        cls.h_rolloverFeePeriod = lambda self, sender: mine_tx(
            self.havven.functions.rolloverFeePeriod().transact({'from': sender}))

        #
        # INTERNAL
        cls.h_adjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(
            self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
        # rolloverFee (ltt->last_transfer_time)
        cls.h_rolloverFee = lambda self, sender, acc, ltt, p_bal: mine_tx(
            self.havven.functions._rolloverFee(acc, ltt, p_bal).transact({'from': sender}))

        # withdrawFeeEntitlement
        cls.h_withdrawFeeEntitlement = lambda self, sender: mine_tx(
            self.havven.functions.withdrawFeeEntitlement().transact({'from': sender}))

        #
        # MODIFIERS
        # postCheckFeePeriodRollover
        cls.h_postCheckFeePeriodRollover = lambda self, sender: mine_tx(
            self.havven.functions._postCheckFeePeriodRollover().transact({'from': sender}))

    # Scenarios to test
    # Basic:
    # people transferring nomins, other people collecting
    # - All collected
    # - % withdrawn per period (fees rolling over)

    # Others:
    # Collecting after transferring havvens
    # Account with nomins is frozen, all those nomins go into pool
    # Accounts with both nomins and havvens?




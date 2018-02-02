import unittest
import time
from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, to_seconds, fast_forward, fresh_account, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, current_block_time, assertClose

SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol"]


def deploy_public_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [MASTER])
    hvn_block = W3.eth.blockNumber
    nomin_contract, nom_txr = attempt_deploy(compiled, 'EtherNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000*UNIT, MASTER])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract, hvn_block


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):

        cls.assertClose = assertClose
        cls.assertFunctionReverts = assertReverts


        cls.havven, cls.nomin, cls.court, cls.construction_block = deploy_public_havven()

        # INHERITED
        # OWNED
        # owner
        cls.owner = lambda self: self.havven.functions.owner().call()
        # setOwner
        cls.setOwner = lambda self, sender, addr: mine_tx(self.havven.functions.setOwner(addr).transact({'from': sender}))

        # ERC20TOKEN (transfer/transferFrom are overwritten)
        # totalSupply
        cls.totalSupply = lambda self: self.havven.functions.totalSupply().call()
        # name
        cls.name = lambda self: self.havven.functions.name().call()
        # symbol
        cls.symbol = lambda self: self.havven.functions.symbol().call()
        # balanceOf
        cls.balanceOf = lambda self, a: self.havven.functions.balanceOf(a).call()
        # allowance
        cls.allowance = lambda self, owner, spender: self.havven.functions.allowance(owner, spender).call()
        # approve
        cls.approve = lambda self, sender, spender, val: mine_tx(self.havven.functions.approve(spender, val).transact({"from": sender}))

        # HAVVEN
        # GETTERS
        # currentBalanceSum
        cls.currentBalanceSum = lambda self, addr: self.havven.functions._currentBalanceSum(addr).call()
        # lastAverageBalance
        cls.lastAverageBalance = lambda self, addr: self.havven.functions.lastAverageBalance(addr).call()
        # penultimateAverageBalance
        cls.penultimateAverageBalance = lambda self, addr: self.havven.functions.penultimateAverageBalance(addr).call()
        # lastTransferTimestamp
        cls.lastTransferTimestamp = lambda self, addr: self.havven.functions._lastTransferTimestamp(addr).call()
        # hasWithdrawnLastPeriodFees
        cls.hasWithdrawnLastPeriodFees = lambda self, addr: self.havven.functions._hasWithdrawnLastPeriodFees(addr).call()

        # feePeriodStartTime
        cls.feePeriodStartTime = lambda self: self.havven.functions.feePeriodStartTime().call()
        # lastFeePeriodDuration
        cls.lastFeePeriodStartTime = lambda self: self.havven.functions._lastFeePeriodStartTime().call()
        # penultimateFeePeriodStartTime
        cls.penultimateFeePeriodStartTime = lambda self: self.havven.functions._penultimateFeePeriodStartTime().call()
        # targetFeePeriodDurationSeconds
        cls.targetFeePeriodDurationSeconds = lambda self: self.havven.functions.targetFeePeriodDurationSeconds().call()
        # minFeePeriodDurationSeconds
        cls.minFeePeriodDurationSeconds = lambda self: self.havven.functions._minFeePeriodDurationSeconds().call()
        # lastFeesCollected
        cls.lastFeesCollected = lambda self: self.havven.functions.lastFeesCollected().call()

        cls.get_nomin = lambda self: self.havven.functions.nomin().call()

        # vote
        cls.vote = lambda self, addr: self.havven.functions.vote(addr).call()
        # voteTarget
        cls.voteTarget = lambda self, addr: self.havven.functions.voteTarget(addr).call()

        #
        # SETTERS
        # setNomin
        cls.setNomin = lambda self, sender, addr: mine_tx(self.havven.functions.setNomin(addr).transact({'from': sender}))
        # setTargetFeePeriod
        cls.setTargetFeePeriodDuration = lambda self, sender, dur: mine_tx(self.havven.functions.setTargetFeePeriodDuration(dur).transact({'from': sender}))

        #
        # VIEWS
        # hasVoted
        cls.hasVoted = lambda self, addr: self.havven.functions.hasVoted(addr).call()

        #
        # FUNCTIONS
        # endow
        cls.endow = lambda self, sender, addr, amt: mine_tx(self.havven.functions.endow(addr, amt).transact({'from': sender}))
        # transfer
        cls.transfer = lambda self, sender, addr, amt: mine_tx(self.havven.functions.transfer(addr, amt).transact({'from': sender}))
        # transferFrom
        cls.transferFrom = lambda self, sender, frm, to, amt: mine_tx(self.havven.functions.transferFrom(frm, to, amt).transact({'from': sender}))

        #
        # INTERNAL
        # adjustFeeEntitlement (p_bal -> preBalance)
        cls.adjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
        # rolloverFee (ltt->last_transfer_time)
        cls.rolloverFee = lambda self, sender, acc, ltt, p_bal: mine_tx(self.havven.functions._rolloverFee(acc, ltt, p_bal).transact({'from': sender}))

        # withdrawFeeEntitlement
        cls.withdrawFeeEntitlement = lambda self, sender: mine_tx(self.havven.functions.withdrawFeeEntitlement(sender).transact({'from': sender}))

        # setVotedYea
        cls.setVotedYea = lambda self, sender, acc, target: mine_tx(self.havven.functions.setVotedYea(acc, target).transact({'from': sender}))
        # setVotedNay
        cls.setVotedNay = lambda self, sender, acc, target: mine_tx(self.havven.functions.setVotedNay(acc, target).transact({'from': sender}))
        # cancelVote
        cls.cancelVote = lambda self, sender, acc, target: mine_tx(self.havven.functions.cancelVote(acc, target).transact({'from': sender}))

        #
        # MODIFIERS
        # postCheckFeePeriodRollover
        cls._postCheckFeePeriodRollover = lambda self, sender: mine_tx(self.havven.functions._postCheckFeePeriodRollover().transact({'from': sender}))

    ###
    # Test inherited Owned - Should be the same test_Owned.py
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.havven.functions.owner().call(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.functions.owner().call()
        new_owner = DUMMY

        self.setOwner(old_owner, new_owner)
        self.assertEqual(self.owner(), new_owner)

        # reset back to old owner
        self.setOwner(new_owner, old_owner)
        self.assertEqual(self.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertFunctionReverts(self.setOwner, invalid_account, invalid_account)

    ###
    # Test inherited ERC20Token
    ###
    # Constuctor
    def test_ERC20Token_constructor(self):
        total_supply = 10**8 * UNIT
        self.assertEqual(self.name(), "Havven")
        self.assertEqual(self.symbol(), "HAV")
        self.assertEqual(self.totalSupply(), total_supply)
        self.assertEqual(self.balanceOf(self.havven.address), total_supply)

    # Approval
    def test_approve(self):
        owner = MASTER
        spender = DUMMY
        self.approve(owner, spender, UNIT)
        self.assertEquals(self.allowance(owner, spender), UNIT)
        self.approve(owner, spender, 0)
        self.assertEquals(self.allowance(owner, spender), 0)

    #
    ##
    ###
    # Test Havven
    ###
    ###
    # Constructor
    ###
    def test_constructor(self):
        self.assertEquals(
            current_block_time(self.construction_block),
            self.feePeriodStartTime()
        )
        self.assertEquals(self.targetFeePeriodDurationSeconds(), to_seconds(weeks=4))
        self.assertEquals(self.minFeePeriodDurationSeconds(), to_seconds(days=1))
        self.assertEquals(self.lastFeesCollected(), 0)
        self.assertEquals(self.lastFeePeriodStartTime(), 2)
        self.assertEquals(self.penultimateFeePeriodStartTime(), 1)
        self.assertEquals(self.get_nomin(), self.nomin.address)

    ###
    # Mappings
    ###
    # currentBalanceSum
    def test_currentBalanceSum(self):
        """
        Testing the value of currentBalanceSum works as intended,
        Further testing involving this and fee collection will be done
        in scenario testing
        """
        fee_period = self.targetFeePeriodDurationSeconds()
        delay = int(fee_period/10)
        alice = fresh_account()
        self.assertEquals(self.balanceOf(alice), 0)

        start_amt = UNIT * 50
        self.endow(MASTER, alice, start_amt)
        self.assertEquals(self.balanceOf(alice), start_amt)
        self.assertEquals(self.currentBalanceSum(alice), 0)
        start_time = current_block_time()
        fast_forward(delay)
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))
        end_time = current_block_time()
        balance_sum = (end_time - start_time)*start_amt
        self.assertEquals(
            self.currentBalanceSum(alice),
            balance_sum
        )
        self.transfer(alice, self.havven.address, start_amt)
        self.assertEquals(self.balanceOf(alice), 0)
        fast_forward(delay)
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))
        self.assertClose(
            self.currentBalanceSum(alice),balance_sum
        )

    # lastAverageBalance
    def test_lastAverageBalance(self):
        # set the block time to be at least 30seconds away from the end of the fee_period
        fee_period = self.targetFeePeriodDurationSeconds()
        time_remaining = self.targetFeePeriodDurationSeconds() - current_block_time() + self.feePeriodStartTime()
        if time_remaining < 30:
            fast_forward(50)
            time_remaining = self.targetFeePeriodDurationSeconds() - current_block_time() + self.feePeriodStartTime()

        # fast forward next block with some extra padding
        delay = time_remaining + 100
        alice = fresh_account()
        self.assertEquals(self.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.endow(MASTER, alice, start_amt)
        self.assertEquals(self.balanceOf(alice), start_amt)
        self.assertEquals(self.currentBalanceSum(alice), 0)
        self.assertEquals(self.lastAverageBalance(alice), 0)
        fast_forward(delay)
        self._postCheckFeePeriodRollover(DUMMY)
        fast_forward(fee_period//2)

        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))

        duration_since_rollover = current_block_time() - self.feePeriodStartTime()
        balance_sum = duration_since_rollover*start_amt

        actual = self.currentBalanceSum(alice)
        expected = balance_sum
        self.assertClose(
            actual, expected
        )

        actual = self.lastAverageBalance(alice)
        expected = (start_amt*delay)//(self.feePeriodStartTime() - self.lastFeePeriodStartTime())
        self.assertClose(
            actual, expected
        )

    # penultimateAverageBalance
    def test_penultimateAverageBalance(self):
        # start a new fee period
        alice = fresh_account()
        fee_period = self.targetFeePeriodDurationSeconds()
        fast_forward(fee_period*2)
        self._postCheckFeePeriodRollover(DUMMY)

        # skip to halfway through it
        delay = fee_period//2
        fast_forward(delay)

        self.assertEquals(self.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.endow(MASTER, alice, start_amt)
        inital_transfer_time = self.lastTransferTimestamp(alice)
        self.assertEquals(self.balanceOf(alice), start_amt)
        self.assertEquals(self.currentBalanceSum(alice), 0)
        self.assertEquals(self.lastAverageBalance(alice), 0)

        # rollover two fee periods without alice doing anything
        fast_forward(fee_period*2)
        self._postCheckFeePeriodRollover(DUMMY)

        fast_forward(fee_period*2)
        self._postCheckFeePeriodRollover(DUMMY)

        # adjust alice's fee entitlement
        self.adjustFeeEntitlement(alice, alice, self.balanceOf(alice))

        # expected currentBalance sum is balance*(time since start of period)
        actual = self.currentBalanceSum(alice)
        expected = (current_block_time() - self.feePeriodStartTime())*start_amt
        self.assertClose(
            actual, expected
        )

        last_period_delay = (self.feePeriodStartTime() - self.lastFeePeriodStartTime())

        actual = self.lastAverageBalance(alice)
        expected = (start_amt*last_period_delay)//last_period_delay
        self.assertClose(
            actual, expected,
            msg='last:'
        )

        delay_from_transfer = self.lastFeePeriodStartTime() - inital_transfer_time
        penultimate_period_duration = self.lastFeePeriodStartTime() - self.penultimateFeePeriodStartTime()

        actual = self.penultimateAverageBalance(alice)
        expected = (start_amt*delay_from_transfer)//penultimate_period_duration
        self.assertClose(
            actual, expected,
            msg='penultimate:'
        )

    # lastTransferTimestamp - tested above
    # hasWithdrawnLastPeriodFees TODO

    ###
    # Contract variables
    ###
    # feePeriodStartTime - tested above
    # targetFeePeriodDurationSeconds - tested above
    # minFeePeriodDurationSeconds - constant, checked in constructor test
    # lastFeesCollected TODO

    ###
    # Vote Mappings
    ###
    # vote TODO
    # voteTarget TODO

    ###
    # Functions
    ###

    # setNomin
    def test_SetNomin(self):
        alice = fresh_account()
        self.setNomin(MASTER, alice)
        self.assertEqual(self.get_nomin(), alice)

    def test_invalidSetNomin(self):
        alice = fresh_account()
        assertFunctionReverts(self, self.setNomin, alice, alice)

    # setTargetFeePeriod
    def test_setTargetFeePeriod(self):
        self.setTargetFeePeriodDuration(MASTER, to_seconds(weeks=100))
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            to_seconds(weeks=100)
        )

    def test_setTargetFeePeriod_max(self):
        self.setTargetFeePeriodDuration(MASTER, 2**256 - 1)
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            2 ** 256 - 1
        )

    def test_setTargetFeePeriod_minimal(self):
        self.setTargetFeePeriodDuration(MASTER, self.minFeePeriodDurationSeconds())
        self.assertEqual(
            self.targetFeePeriodDurationSeconds(),
            self.minFeePeriodDurationSeconds()
        )

    def test_setTargetFeePeriod_invalid_below_min(self):
        assertFunctionReverts(self, self.setTargetFeePeriodDuration, MASTER, self.minFeePeriodDurationSeconds()-1)

    def test_setTargetFeePeriod_invalid_0(self):
        assertFunctionReverts(self, self.setTargetFeePeriodDuration, MASTER, self.minFeePeriodDurationSeconds()-1)

    # hasVoted TODO
    # endow

    # transfer
    # transferFrom
    # adjustFeeEntitlement
    # rolloverFee
    # withdrawFeeEntitlement
    # setVotedYea
    # setVotedNay
    # cancelVote

    ###
    # Modifiers
    ###
    # postCheckFeePeriodRollover


if __name__ == '__main__':
    unittest.main()

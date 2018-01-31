import unittest
import time
from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, to_seconds, fast_forward, force_mine_block
from utils.testutils import assertFunctionReverts

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
           havven_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract, hvn_block


class TestHavven(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
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
        # targetFeePeriodDurationSeconds
        cls.targetFeePeriodDurationSeconds = lambda self: self.havven.functions.targetFeePeriodDurationSeconds().call()
        # minFeePeriodDurationSeconds
        cls.minFeePeriodDurationSeconds = lambda self: self.havven.functions._minFeePeriodDurationSeconds().call()
        # lastFeePeriodDuration
        cls.lastFeePeriodDuration = lambda self: self.havven.functions._lastFeePeriodDuration().call()
        # lastFeesCollected
        cls.lastFeesCollected = lambda self: self.havven.functions.lastFeesCollected().call()

        cls.get_nomin = lambda self: self.havven.functions.nomin().call()
        cls.get_court = lambda self: self.havven.functions.court().call()

        # vote
        cls.vote = lambda self, addr: self.havven.functions.vote(addr).call()
        # voteTarget
        cls.voteTarget = lambda self, addr: self.havven.functions.voteTarget(addr).call()

        #
        # SETTERS
        # setNomin
        cls.setNomin = lambda self, sender, addr: mine_tx(self.havven.functions.setNomin(addr).transact({'from': sender}))
        # setCourt
        cls.setCourt = lambda self, sender, addr: mine_tx(self.havven.functions.setCourt(addr).transact({'from': sender}))
        # setTargetFeePeriod
        cls.setTargetFeePeriod = lambda self, sender, dur: mine_tx(self.havven.functions.setTargetFeePeriod(dur).transact({'from': sender}))

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
        # onlyCourt
        cls._onlyCourt = lambda self, sender: mine_tx(self.havven.functions._onlyCourt().transact({'from': sender}))

    ###
    # Test Ownership
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.havven.functions.owner().call(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.functions.owner().call()
        new_owner = W3.eth.accounts[1]

        self.setOwner(old_owner, new_owner)
        self.assertEqual(self.owner(), new_owner)

        # reset back to old owner
        self.setOwner(new_owner, old_owner)
        self.assertEqual(self.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = W3.eth.accounts[1]
        assertFunctionReverts(self, self.setOwner, invalid_account, invalid_account)

    ###
    # Test ERC20Token
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
        owner = W3.eth.accounts[0]
        spender = W3.eth.accounts[1]
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
            W3.eth.getBlock(self.construction_block)['timestamp'],
            self.feePeriodStartTime()
        )
        self.assertEquals(self.targetFeePeriodDurationSeconds(), to_seconds(weeks=4))
        self.assertEquals(self.minFeePeriodDurationSeconds(), to_seconds(days=1))
        self.assertEquals(self.lastFeesCollected(), 0)
        self.assertEquals(self.lastFeePeriodDuration(), 1)
        self.assertEquals(self.get_nomin(), self.nomin.address)
        self.assertEquals(self.get_court(), self.court.address)

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
        transfer_period = int(fee_period/10)
        alice = W3.eth.accounts[1]
        self.assertEquals(self.balanceOf(alice), 0)

        start_amt = UNIT * 50
        self.endow(MASTER, alice, start_amt)
        self.assertEquals(self.balanceOf(alice), start_amt)
        self.assertEquals(self.currentBalanceSum(alice), 0)
        start_time = W3.eth.getBlock(W3.eth.blockNumber)['timestamp']
        fast_forward(transfer_period)
        end_time = W3.eth.getBlock(W3.eth.blockNumber)['timestamp']
        self.transfer(alice, alice, 1)
        self.assertAlmostEquals(
            self.currentBalanceSum(alice),
            (end_time-start_time)*start_amt,
            places=7
        )

    # lastAverageBalance

    # penultimateAverageBalancef
    # lastTransferTimestamp
    # hasWithdrawnLastPeriodFees

    ###
    # Contract variables
    ###
    # feePeriodStartTime
    # targetFeePeriodDurationSeconds
    # minFeePeriodDurationSeconds
    # lastFeePeriodDuration
    # lastFeesCollected

    ###
    # Vote Mappings
    ###
    # vote
    # voteTarget

    ###
    # Functions
    ###

    # setNomin
    # setCourt
    # setTargetFeePeriod
    # hasVoted
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
    # onlyCourt

if __name__ == '__main__':
    unittest.main()

import unittest
from deploy import UNIT, MASTER, deploy_havven
from utils.deployutils import W3, mine_tx
from utils.testutils import assertTransactionReverts


class TestHavven(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.havven, cls.nomin, cls.court = deploy_havven()
        cls.construction_block = W3.eth.blockNumber-1

    ###
    # Test Construction
    ###
    ##
    # Havven - constructor
    def test_feePeriodStartTime(self):
        print(W3.eth.getBlock(self.construction_block)['timestamp'])
        print(self.havven.functions.feePeriodStartTime().call())

    # ERC20 - constructor
    def test_totalSupply(self):
        total_supply = 10**8 * UNIT
        self.assertEquals(self.havven.functions.totalSupply().call(), total_supply)


    ###
    # Test Ownership
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.havven.functions.owner().call(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.functions.owner().call()
        new_owner = W3.eth.accounts[1]

        mine_tx(self.havven.functions.setOwner(new_owner).transact({'from': MASTER}))
        self.assertEqual(self.havven.functions.owner().call(), new_owner)

        mine_tx(self.havven.functions.setOwner(old_owner).transact({'from': new_owner}))

    def test_change_invalid_owner(self):
        invalid_account = W3.eth.accounts[1]
        assertTransactionReverts(self, self.havven.functions.setOwner(invalid_account), invalid_account)

    ###
    # Mappings
    ###
    # currentBalanceSum
    # lastAverageBalance
    # penultimateAverageBalance
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

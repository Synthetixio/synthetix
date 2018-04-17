import unittest
import time

import utils.generalutils
from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_accounts, take_snapshot, restore_snapshot, ETHER
from utils.testutils import assertReverts, block_time, assertClose, ZERO_ADDRESS

from tests.contract_interfaces.havven_interface import HavvenInterface
from tests.contract_interfaces.nomin_interface import NominInterface

SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                    "tests/contracts/FakeCourt.sol", "contracts/Havven.sol"]


def deploy_public_contracts():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [ZERO_ADDRESS, MASTER])
    nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000 * UNIT, MASTER, ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'FakeCourt',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])


    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract


def setUpModule():
    print("Testing FeeCollection...")


def tearDownModule():
    print()


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        utils.generalutils.time_fast_forwarded = 0
        self.initial_time = round(time.time())
        time_remaining = self.havven.targetFeePeriodDurationSeconds() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 1)

        # Reset the liquidation timestamp so that it's never active.
        owner = self.nomin.owner()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    def test_time_elapsed(self):
        return utils.generalutils.time_fast_forwarded + (round(time.time()) - self.initial_time)

    def now_block_time(self):
        return block_time() + self.test_time_elapsed()

    @classmethod
    def setUpClass(cls):
        cls.havven_contract, cls.nomin_contract, cls.fake_court = deploy_public_contracts()

        cls.havven = HavvenInterface(cls.havven_contract)
        cls.nomin = NominInterface(cls.nomin_contract)

        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
        fast_forward(weeks=102)

        #
        # MODIFIERS
        # postCheckFeePeriodRollover
        cls.h_checkFeePeriodRollover = lambda self, sender: mine_tx(
            self.havven.functions._checkFeePeriodRollover().transact({'from': sender}))

        cls.fake_court_setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court_setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court_setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court_confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        
        cls.fake_court_setNomin(W3.eth.accounts[0], cls.nomin_contract.address)

    '''
    def give_master_nomins(self, amt):
        fast_forward(1)  # fast forward to allow price to not clash with previous block
        self.nomin.updatePrice(MASTER, UNIT, self.now_block_time())
        self.nomin.replenishPool(MASTER, amt * UNIT, 2 * amt * ETHER)
        ethercost = self.nomin.purchaseCostEther(amt * UNIT)
        self.nomin.buy(MASTER, amt * UNIT, ethercost)

    # Scenarios to test
    # Basic:
    # people transferring nomins, other people collecting

    def check_fees_collected(self, percentage_havvens, hav_holders, nom_users):
        """
        Check that a single fee periods fees are collected correctly by some % of havven holders
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        :param nom_users: a list of nomin users, and how many nomins each holds
        """
        addresses = fresh_accounts(len(hav_holders) + len(nom_users) + 1)

        # Normalise havven holders quantites
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        # give the percentage of havvens to each holder
        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(100 * hav_holders[i]) * h_total_supply // 100)
            self.assertClose(self.havven.balanceOf(hav_addr[i]), h_total_supply * hav_holders[i], precision=5)

        self.assertClose(sum([self.havven.balanceOf(addr) for addr in hav_addr]), int(h_total_supply * percentage_havvens),
                         precision=5)

        # give each nomin holder their share of nomins
        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users) * 2)

        for i in range(len(nom_users)):
            self.nomin.transfer(MASTER, nom_addr[i], nom_users[i] * UNIT)
            self.assertEqual(self.nomin.balanceOf(nom_addr[i]), nom_users[i] * UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.nomin.transfer(addr, receiver, int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
            self.nomin.transfer(receiver, addr,
                            int(((self.nomin.balanceOf(receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            self.assertEqual(self.nomin.balanceOf(addr), 0)

        # fast forward to next period
        fast_forward(2 * self.havven.targetFeePeriodDurationSeconds())
        self.havven.checkFeePeriodRollover(DUMMY)
        inital_pool = self.nomin.feePool()
        total_fees_collected = 0
        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEqual(self.nomin.balanceOf(addr), 0)
            else:
                self.assertNotEqual(self.nomin.balanceOf(addr), 0)
            total_fees_collected += self.nomin.balanceOf(addr)

        self.assertClose(self.nomin.feePool() + total_fees_collected, inital_pool, precision=1)

        self.assertClose(inital_pool * percentage_havvens, total_fees_collected)

    def test_100_percent_withdrawal(self):
        self.check_fees_collected(1, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_50_percent_withdrawal(self):
        self.check_fees_collected(.5, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_0_percent_withdrawal(self):
        self.check_fees_collected(0, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    # - fees rolling over
    def check_fees_rolling_over(self, percentage_havvens, hav_holders, nom_users):
        """
        Check that fees roll over multiple fee periods fees are collected correctly by some % of havven holders
        at the end of all the fee periods rolling over
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        :param nom_users: a list of nomin users, and how many nomins each holds
        """
        addresses = fresh_accounts(len(hav_holders) + len(nom_users) + 1)

        # create havven holders, and give their share of havvens
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(100 * hav_holders[i]) * h_total_supply // 100)
            self.assertClose(self.havven.balanceOf(hav_addr[i]), h_total_supply * hav_holders[i], precision=5)

        self.assertClose(sum([self.havven.balanceOf(addr) for addr in hav_addr]), int(h_total_supply * percentage_havvens),
                         precision=5)

        # give each nomin holder their share of nomins
        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users) * 2)

        for i in range(len(nom_users)):
            self.nomin.transfer(MASTER, nom_addr[i], nom_users[i] * UNIT)
            self.assertEqual(self.nomin.balanceOf(nom_addr[i]), nom_users[i] * UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.nomin.transfer(addr, receiver, int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
            self.nomin.transfer(receiver, addr,
                            int(((self.nomin.balanceOf(receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            self.assertEqual(self.nomin.balanceOf(addr), 0)

        # roll over 4 more periods, generating more fees
        for i in range(4):
            # fast forward to next period
            fast_forward(2 * self.havven.targetFeePeriodDurationSeconds())
            self.havven.checkFeePeriodRollover(DUMMY)

            # generate some more fees
            for addr in nom_addr:
                self.nomin.transfer(addr, receiver,
                                int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
                self.nomin.transfer(receiver, addr,
                                int(((self.nomin.balanceOf(receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

        # fast forward to next period
        fast_forward(2 * self.havven.targetFeePeriodDurationSeconds())
        self.havven.checkFeePeriodRollover(DUMMY)
        self.assertEqual(self.nomin.feePool(), self.havven.lastFeesCollected())
        inital_pool = self.nomin.feePool()
        total_fees_collected = 0
        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEqual(self.nomin.balanceOf(addr), 0)
            else:
                self.assertNotEqual(self.nomin.balanceOf(addr), 0)
            total_fees_collected += self.nomin.balanceOf(addr)

        self.assertClose(self.nomin.feePool() + total_fees_collected, inital_pool, precision=1)

        self.assertClose(inital_pool * percentage_havvens, total_fees_collected)

    def test_rolling_over_100_percent_withdrawal(self):
        self.check_fees_rolling_over(1, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_rolling_over_50_percent_withdrawal(self):
        self.check_fees_rolling_over(.5, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_rolling_over_0_percent_withdrawal(self):
        self.check_fees_rolling_over(0, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    # Collecting after transferring havvens
    # i.e. checking that averages work as intended
    def check_transferring_havven_fee_collection(self, h_percent, nom_users):
        """
        Check that the average balance calulation actually influences the number of nomins received
        (Single user only)
        :param h_percent: the percent of havvens being used
        :param nom_users: a list of nomin users, and how many nomins each holds
        """
        fee_period_duration = self.havven.targetFeePeriodDurationSeconds()

        addresses = fresh_accounts(len(nom_users) + 3)
        havven_holder = addresses[0]
        h_total_supply = self.havven.totalSupply()

        self.havven.endow(MASTER, havven_holder, int(h_total_supply * h_percent))
        self.assertClose(self.havven.balanceOf(havven_holder), h_total_supply * h_percent, precision=2)

        nom_addr = addresses[1:-2]
        self.give_master_nomins(sum(nom_users) * 2)

        for i in range(len(nom_users)):
            self.nomin.transfer(MASTER, nom_addr[i], nom_users[i] * UNIT)
            self.assertEqual(self.nomin.balanceOf(nom_addr[i]), nom_users[i] * UNIT)

        n_receiver = addresses[-1]
        for addr in nom_addr:
            self.nomin.transfer(addr, n_receiver,
                            int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
            self.nomin.transfer(n_receiver, addr,
                            int(((self.nomin.balanceOf(n_receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

        # transfer to receiver and back 5 times
        # havven balance should look like:
        #
        # |            :
        # | _   _   _  :
        # ||_|_|_|_|_|_:__ __  _

        h_receiver = addresses[-2]
        self.havven.transfer(havven_holder, h_receiver, self.havven.balanceOf(havven_holder))
        fast_forward(fee_period_duration / 5)

        self.havven.transfer(h_receiver, havven_holder, self.havven.balanceOf(h_receiver))
        fast_forward(fee_period_duration / 5)

        self.havven.transfer(havven_holder, h_receiver, self.havven.balanceOf(havven_holder))
        fast_forward(fee_period_duration / 5)

        self.havven.transfer(h_receiver, havven_holder, self.havven.balanceOf(h_receiver))
        fast_forward(fee_period_duration / 5)

        self.havven.transfer(havven_holder, h_receiver, self.havven.balanceOf(havven_holder))
        fast_forward(fee_period_duration / 5)  # should roll over after this

        self.assertEqual(self.havven.balanceOf(havven_holder), 0)
        self.assertEqual(self.nomin.balanceOf(havven_holder), 0)
        fee_pool = self.nomin.feePool()
        self.havven.checkFeePeriodRollover(DUMMY)
        self.assertEqual(self.havven.lastFeesCollected(), fee_pool)

        self.havven.withdrawFeeEntitlement(havven_holder)
        self.havven.withdrawFeeEntitlement(h_receiver)

        self.assertClose(self.nomin.balanceOf(havven_holder), fee_pool * 2 / 5 * h_percent)

        self.assertClose(self.nomin.balanceOf(h_receiver), fee_pool * 3 / 5 * h_percent)

    def test_transferring_havven_100_percent(self):
        self.check_transferring_havven_fee_collection(1, [100, 200, 200, 300, 300])

    def test_transferring_havven_50_percent(self):
        self.check_transferring_havven_fee_collection(0.5, [100, 200, 200, 300, 300])

    def test_transferring_havven_0_percent(self):
        self.check_transferring_havven_fee_collection(0, [100, 200, 200, 300, 300])

    # - fees rolling over
    def check_fees_multi_period(self, percentage_havvens, hav_holders, nom_users):
        """
        Check that fees over multiple periods are collected correctly (collecting each period)
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        :param nom_users: a list of nomin users, and how many nomins each holds
        """
        addresses = fresh_accounts(len(hav_holders) + len(nom_users) + 1)

        # create normalised havven holders
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(100 * hav_holders[i]) * h_total_supply // 100)
            self.assertClose(self.havven.balanceOf(hav_addr[i]), h_total_supply * hav_holders[i], precision=5)

        self.assertClose(sum([self.havven.balanceOf(addr) for addr in hav_addr]), int(h_total_supply * percentage_havvens),
                         precision=5)

        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users) * 2)

        for i in range(len(nom_users)):
            self.nomin.transfer(MASTER, nom_addr[i], nom_users[i] * UNIT)
            self.assertEqual(self.nomin.balanceOf(nom_addr[i]), nom_users[i] * UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.nomin.transfer(addr, receiver, int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
            self.nomin.transfer(receiver, addr,
                            int(((self.nomin.balanceOf(receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            self.assertEqual(self.nomin.balanceOf(addr), 0)

        # roll over 4 more periods, generating more fees, and withdrawing them
        for i in range(4):
            # fast forward to next period

            # generate some more fees
            for addr in nom_addr:
                self.nomin.transfer(addr, receiver,
                                int(((self.nomin.balanceOf(addr) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))
                self.nomin.transfer(receiver, addr,
                                int(((self.nomin.balanceOf(receiver) * UNIT) // (self.nomin.transferFeeRate() + UNIT))))

            fast_forward(2 * self.havven.targetFeePeriodDurationSeconds())
            self.havven.checkFeePeriodRollover(DUMMY)

            # withdraw the fees
            inital_pool = self.havven.lastFeesCollected()
            total_fees_collected = 0
            for addr in hav_addr:
                inital_n = self.nomin.balanceOf(addr)
                self.havven.withdrawFeeEntitlement(addr)
                if percentage_havvens == 0:
                    self.assertEqual(self.nomin.balanceOf(addr), 0)
                else:
                    self.assertNotEqual(self.nomin.balanceOf(addr), 0)
                total_fees_collected += self.nomin.balanceOf(addr) - inital_n
            self.assertClose(inital_pool * percentage_havvens, total_fees_collected, precision=5)

    def test_multi_period_100_percent_withdrawal(self):
        self.check_fees_multi_period(1, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_multi_period_50_percent_withdrawal(self):
        self.check_fees_multi_period(.5, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_multi_period_0_percent_withdrawal(self):
        self.check_fees_multi_period(0, [10, 20, 30, 40], [100, 200, 200, 300, 300])
    '''
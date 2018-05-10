import unittest

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_accounts, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, assertClose, ZERO_ADDRESS

from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


def setUpModule():
    print("Testing FeeCollection...")


def tearDownModule():
    print()


class TestFeeCollection(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @staticmethod
    def deployContracts():
        sources = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                   "tests/contracts/FakeCourt.sol", "contracts/Havven.sol"]
        print("Deployment initiated.\n")

        compiled = attempt(compile_contracts, [sources], "Compiling contracts... ")

        # Deploy contracts
        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['Havven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['Nomin']['abi'])
        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                                  MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER])
        nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicNomin',
                                                 MASTER,
                                                 [nomin_proxy.address, havven_contract.address, MASTER, ZERO_ADDRESS])
        court_contract, court_txr = attempt_deploy(compiled, 'FakeCourt',
                                                   MASTER,
                                                   [havven_contract.address, nomin_contract.address,
                                                    MASTER])

        # Hook up each of those contracts to each other
        mine_txs([
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})
        ])

        print("\nDeployment complete.\n")
        return havven_contract, nomin_contract, court_contract

    @classmethod
    def setUpClass(cls):
        cls.havven_contract, cls.nomin_contract, cls.fake_court = cls.deployContracts()

        cls.havven = PublicHavvenInterface(cls.havven_contract)
        cls.nomin = PublicNominInterface(cls.nomin_contract)

        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
        fast_forward(weeks=102)

        cls.fake_court_setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court_setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court_setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court_confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        
        cls.fake_court_setNomin(W3.eth.accounts[0], cls.nomin_contract.address)

    # Scenarios to test
    # Basic:
    # people transferring nomins, other people collecting

    def check_fees_collected(self, percentage_havvens, hav_holders):
        """
        Check that a single fee periods fees are collected correctly by some % of havven holders
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        """
        addresses = fresh_accounts(len(hav_holders) + 1)

        # Normalise havven holders quantites
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        # give the percentage of havvens to each holder
        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(hav_holders[i] * h_total_supply) // UNIT * UNIT)
            self.assertClose(
                self.havven.balanceOf(hav_addr[i]),
                h_total_supply * hav_holders[i],
                precision=5
            )
        self.assertClose(
            sum([self.havven.balanceOf(addr) for addr in hav_addr]),
            int(h_total_supply * percentage_havvens),
            precision=5
        )

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        fast_forward(self.havven.targetFeePeriodDurationSeconds() + 1)
        self.havven.checkFeePeriodRollover(DUMMY)

        for addr in hav_addr:
            # period hasn't rolled over yet, so no fees should get collected
            self.assertEqual(self.havven.nominsIssued(addr), 0)
            self.assertEqual(self.nomin.balanceOf(addr), 0)

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        for addr in hav_addr:
            self.havven.setWhitelisted(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuanceRights(addr))

        self.nomin.generateFees(MASTER, 100 * UNIT)
        # fast forward to next period
        fast_forward(self.havven.targetFeePeriodDurationSeconds() + 1)
        self.havven.checkFeePeriodRollover(DUMMY)

        fee_pool = self.nomin.feePool()
        self.assertEqual(fee_pool, self.havven.lastFeesCollected())
        total_fees_collected = 0

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)  # ensure price not stale
        for n, addr in enumerate(hav_addr):
            self.havven.withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEqual(self.nomin.balanceOf(addr), 0)
            else:
                self.assertClose(
                    self.nomin.balanceOf(addr) - self.havven.nominsIssued(addr),
                    fee_pool * hav_holders[n] / sum(hav_holders),
                    precision=3
                )
            total_fees_collected += self.nomin.balanceOf(addr) - self.havven.nominsIssued(addr)

        if percentage_havvens == 0:
            self.assertEqual(total_fees_collected, 0)
        else:
            self.assertClose(fee_pool, total_fees_collected, precision=3)

    def test_100_percent_withdrawal(self):
        self.check_fees_collected(1, [100, 200, 200, 300, 300])

    def test_50_percent_withdrawal(self):
        self.check_fees_collected(.5, [100, 200, 200, 300, 300])

    def test_0_percent_withdrawal(self):
        self.check_fees_collected(0, [100, 200, 200, 300, 300])

    # - fees rolling over
    def check_fees_rolling_over(self, percentage_havvens, hav_holders):
        """
        Check that fees roll over multiple fee periods fees are collected correctly by some % of havven holders
        at the end of all the fee periods rolling over
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        """
        addresses = fresh_accounts(len(hav_holders) + 1)

        # create havven holders, and give their share of havvens
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(hav_holders[i] * h_total_supply) // UNIT * UNIT)
            self.assertClose(self.havven.balanceOf(hav_addr[i]), h_total_supply * hav_holders[i], precision=5)

        self.assertClose(
            sum([self.havven.balanceOf(addr) for addr in hav_addr]),
            int(h_total_supply * percentage_havvens),
            precision=5
        )

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 2)
        self.nomin.generateFees(MASTER, 20 * UNIT)

        for addr in hav_addr:
            self.havven.setWhitelisted(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuanceRights(addr))

        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            self.assertEqual(self.nomin.balanceOf(addr), self.havven.nominsIssued(addr))  # no fees

        # roll over 4 more periods, generating more fees
        for i in range(4):
            # fast forward to next period
            fast_forward(self.havven.targetFeePeriodDurationSeconds() + 1)
            self.havven.checkFeePeriodRollover(DUMMY)
            self.nomin.generateFees(MASTER, 20 * UNIT)

        # fast forward to next period
        fast_forward(2 * self.havven.targetFeePeriodDurationSeconds())
        self.havven.checkFeePeriodRollover(DUMMY)

        self.assertEqual(self.nomin.feePool(), self.havven.lastFeesCollected())
        self.assertEqual(self.nomin.feePool(), 100 * UNIT)

        inital_pool = self.nomin.feePool()
        total_fees_collected = 0
        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        for addr in hav_addr:
            self.havven.withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEqual(self.nomin.balanceOf(addr), 0)
            else:
                self.assertGreater(self.nomin.balanceOf(addr), self.havven.maxIssuanceRights(addr))
            total_fees_collected += self.nomin.balanceOf(addr) - self.havven.nominsIssued(addr)

        if percentage_havvens == 0:
            self.assertEqual(self.nomin.feePool(), inital_pool)
            self.assertEqual(total_fees_collected, 0)
        else:
            self.assertClose(self.nomin.feePool() + total_fees_collected, inital_pool, precision=2)
            self.assertClose(inital_pool, total_fees_collected, precision=2)

    def test_rolling_over_100_percent_withdrawal(self):
        self.check_fees_rolling_over(1, [100, 200, 200, 300, 300])

    def test_rolling_over_50_percent_withdrawal(self):
        self.check_fees_rolling_over(.5, [100, 200, 200, 300, 300])

    def test_rolling_over_0_percent_withdrawal(self):
        self.check_fees_rolling_over(0, [100, 200, 200, 300, 300])

    # Collecting after transferring havvens
    # i.e. checking that averages work as intended
    def check_transferring_havven_fee_collection(self, h_percent, h_price):
        """
        Check that the average balance calculation actually influences the number of nomins received
        (Single user only)
        :param h_percent: the percent of havvens being used
        """
        fee_period_duration = self.havven.targetFeePeriodDurationSeconds()

        havven_holder, h_receiver = fresh_accounts(2)

        h_total_supply = self.havven.totalSupply()

        self.havven.endow(MASTER, havven_holder, int(h_total_supply * h_percent) // UNIT * UNIT)
        self.assertClose(self.havven.balanceOf(havven_holder), h_total_supply * h_percent, precision=2)

        fast_forward(fee_period_duration + 1)
        self.havven.checkFeePeriodRollover(MASTER)

        # transfer to receiver and back 6 times
        # issued nomin balance should look like:
        #
        # |            :
        # | _   _   _  :
        # ||_|_|_|_|_|_:__ __  _

        self.havven.setWhitelisted(MASTER, havven_holder, True)
        self.havven.setWhitelisted(MASTER, h_receiver, True)

        addrs = [havven_holder, h_receiver]
        current_addr = False
        for i in range(6):
            self.havven.updatePrice(self.havven.oracle(), h_price, self.havven.currentTime() + 1)
            self.havven.issueNomins(addrs[current_addr], self.havven.remainingIssuanceRights(addrs[current_addr]))
            self.assertClose(self.nomin.totalSupply(), h_price * h_total_supply * h_percent * self.havven.issuanceRatio() // UNIT // UNIT)
            fast_forward(fee_period_duration // 6 - 5)
            self.havven.burnNomins(addrs[current_addr], self.nomin.balanceOf(addrs[current_addr]))
            self.havven.transfer(addrs[current_addr], addrs[not current_addr], self.havven.balanceOf(addrs[current_addr]))
            self.assertClose(self.nomin.totalSupply(), 0)
            current_addr = not current_addr  # switch between accounts

        self.assertEqual(self.havven.balanceOf(h_receiver), 0)
        self.assertEqual(self.nomin.balanceOf(havven_holder), 0)
        self.assertEqual(self.nomin.balanceOf(h_receiver), 0)
        self.nomin.generateFees(MASTER, 100 * UNIT)
        fee_pool = self.nomin.feePool()
        fast_forward(100)  # fast forward to the next period
        self.havven.checkFeePeriodRollover(DUMMY)
        self.assertEqual(self.havven.lastFeesCollected(), fee_pool)

        self.havven.withdrawFeeEntitlement(havven_holder)
        self.havven.withdrawFeeEntitlement(h_receiver)
        if h_percent == 0:
            self.assertEqual(self.nomin.balanceOf(havven_holder), 0)
            self.assertEqual(self.nomin.balanceOf(h_receiver), 0)
        else:
            self.assertClose(self.nomin.balanceOf(havven_holder), fee_pool // 2)
            self.assertClose(self.nomin.balanceOf(h_receiver), fee_pool // 2)

    def test_transferring_havven_100_percent(self):
        self.check_transferring_havven_fee_collection(1, UNIT)

    def test_transferring_havven_50_percent(self):
        self.check_transferring_havven_fee_collection(0.5, UNIT)

    def test_transferring_havven_1_percent(self):
        # full fees should be withdrawable by even with only 1% of havvens issuing
        self.check_transferring_havven_fee_collection(0.01, UNIT)

    def test_transferring_havven_0_percent(self):
        self.check_transferring_havven_fee_collection(0, UNIT)

    # # - fees rolling over
    def check_fees_multi_period(self, percentage_havvens, hav_holders):
        """
        Check that fees over multiple periods are collected correctly (collecting each period)
        :param percentage_havvens: the percent of havvens being used
        :param hav_holders: a list (later normalised) of quantities each havven holder will have
        """
        addresses = fresh_accounts(len(hav_holders) + 1)

        # create havven holders, and give their share of havvens
        sum_vals = sum(hav_holders)
        hav_holders = [((i / sum_vals) * percentage_havvens) for i in hav_holders]

        h_total_supply = self.havven.totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.havven.endow(MASTER, hav_addr[i], int(hav_holders[i] * h_total_supply) // UNIT * UNIT)
            self.assertClose(self.havven.balanceOf(hav_addr[i]), h_total_supply * hav_holders[i], precision=5)

        self.assertClose(
            sum([self.havven.balanceOf(addr) for addr in hav_addr]),
            int(h_total_supply * percentage_havvens),
            precision=5
        )

        self.havven.updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 2)
        self.nomin.generateFees(MASTER, 20 * UNIT)

        for addr in hav_addr:
            self.havven.setWhitelisted(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuanceRights(addr))

        # roll over 4 more periods, generating more fees, and withdrawing them
        for i in range(4):
            # fast forward to next period

            # generate some more fees
            self.nomin.generateFees(MASTER, 10 * UNIT)

            fast_forward(self.havven.targetFeePeriodDurationSeconds() + 1)
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
            if percentage_havvens == 0:
                self.assertEqual(total_fees_collected, 0)
                self.assertEqual(inital_pool, self.nomin.feePool())
            else:
                self.assertClose(inital_pool, total_fees_collected, precision=3)

    def test_multi_period_100_percent_withdrawal(self):
        self.check_fees_multi_period(1, [10, 20, 30, 40])

    def test_multi_period_50_percent_withdrawal(self):
        self.check_fees_multi_period(.5, [10, 20, 30, 40])

    def test_multi_period_0_percent_withdrawal(self):
        self.check_fees_multi_period(0, [10, 20, 30, 40])

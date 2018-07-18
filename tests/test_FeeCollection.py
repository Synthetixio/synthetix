from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fast_forward, fresh_accounts, fresh_account,
    take_snapshot, restore_snapshot,
    attempt_deploy, mine_tx,
    mine_txs
)
from utils.testutils import HavvenTestCase, ZERO_ADDRESS, block_time
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


def setUpModule():
    print("Testing FeeCollection...")
    print("========================")
    print()


def tearDownModule():
    print()
    print()


class TestFeeCollection(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicNomin.sol",
                   "contracts/Havven.sol"]
        print("Deployment initiated.\n")

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        # Deploy contracts
        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['PublicNomin']['abi'])
        havven_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                              MASTER, [MASTER, MASTER])
        nomin_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                             MASTER, [MASTER, MASTER])
        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                                  MASTER, [havven_proxy.address, havven_tokenstate.address, MASTER, MASTER, UNIT//2, [], ZERO_ADDRESS])
        nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicNomin',
                                                 MASTER,
                                                 [nomin_proxy.address, nomin_tokenstate.address, havven_contract.address, 0, MASTER])

        # Hook up each of those contracts to each other
        mine_txs([havven_tokenstate.functions.setBalanceOf(havven_contract.address, 100000000 * UNIT).transact({'from': MASTER}),
                  havven_tokenstate.functions.setAssociatedContract(havven_contract.address).transact({'from': MASTER}),
                  nomin_tokenstate.functions.setAssociatedContract(nomin_contract.address).transact({'from': MASTER}),
                  havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
                  nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
                  havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER})])

        print("\nDeployment complete.\n")
        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, havven_contract, nomin_contract

    @classmethod
    def setUpClass(cls):
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.havven_contract, cls.nomin_contract = cls.deployContracts()

        cls.event_map = cls.event_maps['Havven']

        cls.havven = PublicHavvenInterface(cls.proxied_havven, "Havven")
        cls.nomin = PublicNominInterface(cls.proxied_nomin, "Nomin")

        fast_forward(weeks=102)

    def havven_updatePrice(self, sender, price, time):
        return mine_tx(self.havven_contract.functions.updatePrice(price, time).transact({'from': sender}), 'updatePrice', 'Havven')

    def rollover_and_validate(self, duration=None):
        time = duration if duration is not None else self.havven.feePeriodDuration() + 1
        fast_forward(time)
        tx = self.havven.rolloverFeePeriodIfElapsed(DUMMY)
        rollover_time = block_time(tx.blockNumber)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "FeePeriodRollover",
                               {"timestamp": rollover_time},
                               self.havven_proxy.address)

    def withdraw_and_validate(self, addr):
        self.havven.recomputeLastAverageBalance(addr, addr)
        self.assertFalse(self.havven.hasWithdrawnFees(addr))
        self.havven.withdrawFees(addr)
        self.assertTrue(self.havven.hasWithdrawnFees(addr))

    def test_hasWithdrawnFees(self):
        issuer = fresh_account()
        self.havven.endow(MASTER, issuer, UNIT)
        self.havven.setIssuer(MASTER, issuer, True)
        self.havven_updatePrice(self.havven.oracle(), UNIT, block_time())
        self.havven.issueNomins(issuer, self.havven.maxIssuableNomins(issuer))
        self.nomin.generateFees(MASTER, 100 * UNIT)
        self.rollover_and_validate()
        self.withdraw_and_validate(issuer)

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

        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        self.rollover_and_validate()

        for addr in hav_addr:
            # period hasn't rolled over yet, so no fees should get collected
            self.assertEqual(self.havven.nominsIssued(addr), 0)
            self.assertEqual(self.nomin.balanceOf(addr), 0)

        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        for addr in hav_addr:
            self.havven.setIssuer(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuableNomins(addr))

        self.nomin.generateFees(MASTER, 100 * UNIT)
        # fast forward to next period
        self.rollover_and_validate()

        fee_pool = self.nomin.feePool()
        self.assertEqual(fee_pool, self.havven.lastFeesCollected())
        total_fees_collected = 0

        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)  # ensure price not stale
        for n, addr in enumerate(hav_addr):
            self.withdraw_and_validate(addr)
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

        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 2)
        self.nomin.generateFees(MASTER, 20 * UNIT)

        for addr in hav_addr:
            self.havven.setIssuer(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuableNomins(addr))

        for addr in hav_addr:
            self.withdraw_and_validate(addr)
            self.assertEqual(self.nomin.balanceOf(addr), self.havven.nominsIssued(addr))  # no fees

        # roll over 4 more periods, generating more fees
        for i in range(4):
            # fast forward to next period
            self.rollover_and_validate()
            self.nomin.generateFees(MASTER, 20 * UNIT)

        # fast forward to next period
        self.rollover_and_validate()

        self.assertEqual(self.nomin.feePool(), self.havven.lastFeesCollected())
        self.assertEqual(self.nomin.feePool(), 100 * UNIT)

        inital_pool = self.nomin.feePool()
        total_fees_collected = 0
        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 1)

        for addr in hav_addr:
            self.withdraw_and_validate(addr)
            if percentage_havvens == 0:
                self.assertEqual(self.nomin.balanceOf(addr), 0)
            else:
                self.assertGreater(self.nomin.balanceOf(addr), self.havven.maxIssuableNomins(addr))
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
        fee_period_duration = self.havven.feePeriodDuration()

        havven_holder, h_receiver = fresh_accounts(2)

        h_total_supply = self.havven.totalSupply()

        self.havven.endow(MASTER, havven_holder, int(h_total_supply * h_percent) // UNIT * UNIT)
        self.assertClose(self.havven.balanceOf(havven_holder), h_total_supply * h_percent, precision=2)

        self.rollover_and_validate()

        # transfer to receiver and back 6 times
        # issued nomin balance should look like:
        #
        # |            :
        # | _   _   _  :
        # ||_|_|_|_|_|_:__ __  _

        self.havven.setIssuer(MASTER, havven_holder, True)
        self.havven.setIssuer(MASTER, h_receiver, True)

        addrs = [havven_holder, h_receiver]
        current_addr = False
        for i in range(6):
            self.havven_updatePrice(self.havven.oracle(), h_price, self.havven.currentTime() + 1)
            self.havven.issueNomins(addrs[current_addr], self.havven.remainingIssuableNomins(addrs[current_addr]))
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
        self.rollover_and_validate(100)
        self.assertEqual(self.havven.lastFeesCollected(), fee_pool)

        self.withdraw_and_validate(havven_holder)
        self.withdraw_and_validate(h_receiver)
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

        self.havven_updatePrice(self.havven.oracle(), UNIT, self.havven.currentTime() + 2)
        self.nomin.generateFees(MASTER, 20 * UNIT)

        for addr in hav_addr:
            self.havven.setIssuer(MASTER, addr, True)
            self.havven.issueNomins(addr, self.havven.maxIssuableNomins(addr))

        self.rollover_and_validate()

        # roll over 4 more periods, generating more fees, and withdrawing them
        for i in range(4):
            # fast forward to next period

            # generate some more fees
            self.nomin.generateFees(MASTER, 10 * UNIT)

            self.rollover_and_validate()

            # withdraw the fees
            inital_pool = self.havven.lastFeesCollected()
            total_fees_collected = 0
            for addr in hav_addr:
                inital_n = self.nomin.balanceOf(addr)
                self.withdraw_and_validate(addr)
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

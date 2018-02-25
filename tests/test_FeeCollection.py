import unittest
import time

from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, fast_forward, fresh_accounts, take_snapshot, restore_snapshot, ETHER
from utils.testutils import assertReverts, block_time, assertClose

SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicEtherNomin.sol",
                    "tests/contracts/FakeCourt.sol", "contracts/Havven.sol"]


def deploy_public_contracts():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [MASTER])
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

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract


def setUpModule():
    print("Testing FeeCollection...")


def tearDownModule():
    print()


class TestHavven(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()
        time_remaining = self.h_targetFeePeriodDurationSeconds() + self.h_feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 1)
        self.h_recomputeLastAverageBalance(MASTER)

        # Reset the price at the start of tests so that it's never stale.
        self.n_updatePrice(self.n_oracle(), self.n_etherPrice(), round(time.time()) - 1)
        # Reset the liquidation timestamp so that it's never active.
        owner = self.n_owner()
        self.n_forceLiquidation(owner)
        self.n_terminateLiquidation(owner)

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.havven, cls.nomin, cls.fake_court = deploy_public_contracts()

        cls.assertClose = assertClose
        cls.assertReverts = assertReverts
        fast_forward(weeks=102)

        # INHERITED
        # OWNED
        cls.h_owner = lambda self: self.havven.functions.owner().call()
        cls.h_nominateOwner = lambda self, sender, addr: mine_tx(
            self.havven.functions.nominateOwner(addr).transact({'from': sender}))
        cls.h_acceptOwnership = lambda self, sender: mine_tx(
            self.havven.functions.acceptOwnership().transact({'from': sender}))

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
        cls.h_checkFeePeriodRollover = lambda self, sender: mine_tx(
            self.havven.functions._checkFeePeriodRollover().transact({'from': sender}))

        cls.fake_court_setNomin = lambda sender, new_nomin: mine_tx(cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court_setConfirming = lambda sender, target, status: mine_tx(cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court_setVotePasses = lambda sender, target, status: mine_tx(cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court_confiscateBalance = lambda sender, target: mine_tx(cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        cls.fake_court_setNomin(W3.eth.accounts[0], cls.nomin.address)

        cls.n_owner = lambda self: cls.nomin.functions.owner().call()
        cls.n_oracle = lambda self: cls.nomin.functions.oracle().call()
        cls.n_court = lambda self: cls.nomin.functions.court().call()
        cls.n_beneficiary = lambda self: cls.nomin.functions.beneficiary().call()
        cls.n_nominPool = lambda self: cls.nomin.functions.nominPool().call()
        cls.n_poolFeeRate = lambda self: cls.nomin.functions.poolFeeRate().call()
        cls.n_liquidationPeriod = lambda self: cls.nomin.functions.liquidationPeriod().call()
        cls.n_liquidationTimestamp = lambda self: cls.nomin.functions.liquidationTimestamp().call()
        cls.n_etherPrice = lambda self: cls.nomin.functions.etherPrice().call()
        cls.n_isFrozen = lambda self, address: cls.nomin.functions.isFrozen(address).call()
        cls.n_lastPriceUpdate = lambda self: cls.nomin.functions.lastPriceUpdate().call()
        cls.n_stalePeriod = lambda self: cls.nomin.functions.stalePeriod().call()

        cls.n_nominateOwner = lambda self, sender, address: mine_tx(cls.nomin.functions.nominateOwner(address).transact({'from': sender}))
        cls.n_acceptOwnership = lambda self, sender: mine_tx(cls.nomin.functions.acceptOwnership().transact({'from': sender}))
        cls.n_setOracle = lambda self, sender, address: mine_tx(cls.nomin.functions.setOracle(address).transact({'from': sender}))
        cls.n_setCourt = lambda self, sender, address: mine_tx(cls.nomin.functions.setCourt(address).transact({'from': sender}))
        cls.n_setBeneficiary = lambda self, sender, address: mine_tx(cls.nomin.functions.setBeneficiary(address).transact({'from': sender}))
        cls.n_setPoolFeeRate = lambda self, sender, rate: mine_tx(cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender}))
        cls.n_updatePrice = lambda self, sender, price, timeSent: mine_tx(cls.nomin.functions.updatePrice(price, timeSent).transact({'from': sender}))
        cls.n_setStalePeriod = lambda self, sender, period: mine_tx(cls.nomin.functions.setStalePeriod(period).transact({'from': sender}))

        cls.n_fiatValue = lambda self, eth: cls.nomin.functions.fiatValue(eth).call()
        cls.n_fiatBalance = lambda self: cls.nomin.functions.fiatBalance().call()
        cls.n_collateralisationRatio = lambda self: cls.nomin.functions.collateralisationRatio().call()
        cls.n_etherValue = lambda self, fiat: cls.nomin.functions.etherValue(fiat).call()
        cls.n_etherValueAllowStale = lambda self, fiat: cls.nomin.functions.publicEtherValueAllowStale(fiat).call()
        cls.n_poolFeeIncurred = lambda self, n: cls.nomin.functions.poolFeeIncurred(n).call()
        cls.n_purchaseCostFiat = lambda self, n: cls.nomin.functions.purchaseCostFiat(n).call()
        cls.n_purchaseCostEther = lambda self, n: cls.nomin.functions.purchaseCostEther(n).call()
        cls.n_saleProceedsFiat = lambda self, n: cls.nomin.functions.saleProceedsFiat(n).call()
        cls.n_saleProceedsEther = lambda self, n: cls.nomin.functions.saleProceedsEther(n).call()
        cls.n_saleProceedsEtherAllowStale = lambda self, n: cls.nomin.functions.publicSaleProceedsEtherAllowStale(n).call()
        cls.n_priceIsStale = lambda self: cls.nomin.functions.priceIsStale().call()
        cls.n_isLiquidating = lambda self: cls.nomin.functions.isLiquidating().call()
        cls.n_canSelfDestruct = lambda self: cls.nomin.functions.canSelfDestruct().call()

        cls.n_transferPlusFee = lambda self, value: cls.nomin.functions.transferPlusFee(value).call()
        cls.n_transfer = lambda self, sender, recipient, value: mine_tx(cls.nomin.functions.transfer(recipient, value).transact({'from': sender}))
        cls.n_transferFrom = lambda self, sender, fromAccount, to, value: mine_tx(cls.nomin.functions.transferFrom(fromAccount, to, value).transact({'from': sender}))
        cls.n_approve = lambda self, sender, spender, value: mine_tx(cls.nomin.functions.approve(spender, value).transact({'from': sender}))
        cls.n_issue = lambda self, sender, n, value: mine_tx(cls.nomin.functions.issue(n).transact({'from': sender, 'value': value}))
        cls.n_burn = lambda self, sender, n: mine_tx(cls.nomin.functions.burn(n).transact({'from': sender}))
        cls.n_buy = lambda self, sender, n, value: mine_tx(cls.nomin.functions.buy(n).transact({'from': sender, 'value': value}))
        cls.n_sell = lambda self, sender, n: mine_tx(cls.nomin.functions.sell(n).transact({'from': sender, 'gasPrice': 10}))

        cls.n_forceLiquidation = lambda self, sender: mine_tx(cls.nomin.functions.forceLiquidation().transact({'from': sender}))
        cls.n_liquidate = lambda self, sender: mine_tx(cls.nomin.functions.liquidate().transact({'from': sender}))
        cls.n_extendLiquidationPeriod = lambda self, sender, extension: mine_tx(cls.nomin.functions.extendLiquidationPeriod(extension).transact({'from': sender}))
        cls.n_terminateLiquidation = lambda self, sender: mine_tx(cls.nomin.functions.terminateLiquidation().transact({'from': sender}))
        cls.n_selfDestruct = lambda self, sender: mine_tx(cls.nomin.functions.selfDestruct().transact({'from': sender}))

        cls.n_confiscateBalance = lambda self, sender, target: mine_tx(cls.nomin.functions.confiscateBalance(target).transact({'from': sender}))
        cls.n_unfreezeAccount = lambda self, sender, target: mine_tx(cls.nomin.functions.unfreezeAccount(target).transact({'from': sender}))

        cls.n_name = lambda self: cls.nomin.functions.name().call()
        cls.n_symbol = lambda self: cls.nomin.functions.symbol().call()
        cls.n_totalSupply = lambda self: cls.nomin.functions.totalSupply().call()
        cls.n_balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.n_transferFeeRate = lambda self: cls.nomin.functions.transferFeeRate().call()
        cls.n_feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.n_feeAuthority = lambda self: cls.nomin.functions.feeAuthority().call()

        cls.n_debugWithdrawAllEther = lambda self, sender, recipient: mine_tx(cls.nomin.functions.debugWithdrawAllEther(recipient).transact({'from': sender}))
        cls.n_debugEmptyFeePool = lambda self, sender: mine_tx(cls.nomin.functions.debugEmptyFeePool().transact({'from': sender}))
        cls.n_debugFreezeAccount = lambda self, sender, target: mine_tx(cls.nomin.functions.debugFreezeAccount(target).transact({'from': sender}))

    def give_master_nomins(self, amt):
        self.n_updatePrice(MASTER, UNIT, round(time.time()))
        self.n_issue(MASTER, amt * UNIT, 2 * amt * ETHER)
        ethercost = self.n_purchaseCostEther(amt * UNIT)
        self.n_buy(MASTER, amt * UNIT, ethercost)

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
        hav_holders = [((i/sum_vals)*percentage_havvens) for i in hav_holders]

        # give the percentage of havvens to each holder
        h_total_supply = self.h_totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.h_endow(MASTER, hav_addr[i], int(100*hav_holders[i])*h_total_supply//100)
            self.assertClose(self.h_balanceOf(hav_addr[i]), h_total_supply*hav_holders[i], precision=5)

        self.assertClose(sum([self.h_balanceOf(addr) for addr in hav_addr]), int(h_total_supply*percentage_havvens), precision=5)

        # give each nomin holder their share of nomins
        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users)*2)

        for i in range(len(nom_users)):
            self.n_transfer(MASTER, nom_addr[i], nom_users[i]*UNIT)
            self.assertEqual(self.n_balanceOf(nom_addr[i]), nom_users[i]*UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.n_transfer(addr, receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
            self.n_transfer(receiver, addr, int(((self.n_balanceOf(receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.h_withdrawFeeEntitlement(addr)
            self.assertEqual(self.n_balanceOf(addr), 0)

        # fast forward to next period
        fast_forward(2*self.h_targetFeePeriodDurationSeconds())
        self.h_checkFeePeriodRollover(DUMMY)
        inital_pool = self.n_feePool()
        total_fees_collected = 0
        for addr in hav_addr:
            self.h_withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEquals(self.n_balanceOf(addr), 0)
            else:
                self.assertNotEqual(self.n_balanceOf(addr), 0)
            total_fees_collected += self.n_balanceOf(addr)

        self.assertClose(self.n_feePool() + total_fees_collected, inital_pool, precision=1)

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
        hav_holders = [((i/sum_vals)*percentage_havvens) for i in hav_holders]

        h_total_supply = self.h_totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.h_endow(MASTER, hav_addr[i], int(100*hav_holders[i])*h_total_supply//100)
            self.assertClose(self.h_balanceOf(hav_addr[i]), h_total_supply*hav_holders[i], precision=5)

        self.assertClose(sum([self.h_balanceOf(addr) for addr in hav_addr]), int(h_total_supply*percentage_havvens), precision=5)

        # give each nomin holder their share of nomins
        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users)*2)

        for i in range(len(nom_users)):
            self.n_transfer(MASTER, nom_addr[i], nom_users[i]*UNIT)
            self.assertEqual(self.n_balanceOf(nom_addr[i]), nom_users[i]*UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.n_transfer(addr, receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
            self.n_transfer(receiver, addr, int(((self.n_balanceOf(receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.h_withdrawFeeEntitlement(addr)
            self.assertEqual(self.n_balanceOf(addr), 0)

        # roll over 4 more periods, generating more fees
        for i in range(4):
            # fast forward to next period
            fast_forward(2*self.h_targetFeePeriodDurationSeconds())
            self.h_checkFeePeriodRollover(DUMMY)

            # generate some more fees
            for addr in nom_addr:
                self.n_transfer(addr, receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
                self.n_transfer(receiver, addr, int(((self.n_balanceOf(receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

        # fast forward to next period
        fast_forward(2 * self.h_targetFeePeriodDurationSeconds())
        self.h_checkFeePeriodRollover(DUMMY)
        self.assertEqual(self.n_feePool(), self.h_lastFeesCollected())
        inital_pool = self.n_feePool()
        total_fees_collected = 0
        for addr in hav_addr:
            self.h_withdrawFeeEntitlement(addr)
            if percentage_havvens == 0:
                self.assertEquals(self.n_balanceOf(addr), 0)
            else:
                self.assertNotEqual(self.n_balanceOf(addr), 0)
            total_fees_collected += self.n_balanceOf(addr)

        self.assertClose(self.n_feePool() + total_fees_collected, inital_pool, precision=1)

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
        fee_period_duration = self.h_targetFeePeriodDurationSeconds()

        addresses = fresh_accounts(len(nom_users) + 3)
        havven_holder = addresses[0]
        h_total_supply = self.h_totalSupply()

        self.h_endow(MASTER, havven_holder, int(h_total_supply * h_percent))
        self.assertClose(self.h_balanceOf(havven_holder), h_total_supply*h_percent, precision=2)

        nom_addr = addresses[1:-2]
        self.give_master_nomins(sum(nom_users)*2)

        for i in range(len(nom_users)):
            self.n_transfer(MASTER, nom_addr[i], nom_users[i]*UNIT)
            self.assertEqual(self.n_balanceOf(nom_addr[i]), nom_users[i]*UNIT)

        n_receiver = addresses[-1]
        for addr in nom_addr:
            self.n_transfer(addr, n_receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
            self.n_transfer(n_receiver, addr, int(((self.n_balanceOf(n_receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

        # transfer to receiver and back 5 times
        # havven balance should look like:
        #
        # |            :
        # | _   _   _  :
        # ||_|_|_|_|_|_:__ __  _

        h_receiver = addresses[-2]
        self.h_transfer(havven_holder, h_receiver, self.h_balanceOf(havven_holder))
        fast_forward(fee_period_duration/5)

        self.h_transfer(h_receiver, havven_holder, self.h_balanceOf(h_receiver))
        fast_forward(fee_period_duration/5)

        self.h_transfer(havven_holder, h_receiver, self.h_balanceOf(havven_holder))
        fast_forward(fee_period_duration/5)

        self.h_transfer(h_receiver, havven_holder, self.h_balanceOf(h_receiver))
        fast_forward(fee_period_duration/5)

        self.h_transfer(havven_holder, h_receiver, self.h_balanceOf(havven_holder))
        fast_forward(fee_period_duration/5)  # should roll over after this

        self.assertEqual(self.h_balanceOf(havven_holder), 0)
        self.assertEqual(self.n_balanceOf(havven_holder), 0)
        fee_pool = self.n_feePool()
        self.h_checkFeePeriodRollover(DUMMY)
        self.assertEqual(self.h_lastFeesCollected(), fee_pool)

        self.h_withdrawFeeEntitlement(havven_holder)
        self.h_withdrawFeeEntitlement(h_receiver)

        self.assertClose(self.n_balanceOf(havven_holder), fee_pool*2/5*h_percent)

        self.assertClose(self.n_balanceOf(h_receiver), fee_pool*3/5*h_percent)

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
        hav_holders = [((i/sum_vals)*percentage_havvens) for i in hav_holders]

        h_total_supply = self.h_totalSupply()
        hav_addr = addresses[:len(hav_holders)]
        for i in range(len(hav_holders)):
            # use int to clear float imprecision
            self.h_endow(MASTER, hav_addr[i], int(100*hav_holders[i])*h_total_supply//100)
            self.assertClose(self.h_balanceOf(hav_addr[i]), h_total_supply*hav_holders[i], precision=5)

        self.assertClose(sum([self.h_balanceOf(addr) for addr in hav_addr]), int(h_total_supply*percentage_havvens), precision=5)

        nom_addr = addresses[len(hav_holders):-1]
        self.give_master_nomins(sum(nom_users)*2)

        for i in range(len(nom_users)):
            self.n_transfer(MASTER, nom_addr[i], nom_users[i]*UNIT)
            self.assertEqual(self.n_balanceOf(nom_addr[i]), nom_users[i]*UNIT)

        # will receive and send back nomins
        receiver = addresses[-1]

        # generate some fees
        for addr in nom_addr:
            self.n_transfer(addr, receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
            self.n_transfer(receiver, addr, int(((self.n_balanceOf(receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

        for addr in hav_addr:
            self.h_withdrawFeeEntitlement(addr)
            self.assertEqual(self.n_balanceOf(addr), 0)

        # roll over 4 more periods, generating more fees, and withdrawing them
        for i in range(4):
            # fast forward to next period

            # generate some more fees
            for addr in nom_addr:
                self.n_transfer(addr, receiver, int(((self.n_balanceOf(addr) * UNIT) // (self.n_transferFeeRate() + UNIT))))
                self.n_transfer(receiver, addr, int(((self.n_balanceOf(receiver) * UNIT) // (self.n_transferFeeRate() + UNIT))))

            fast_forward(2*self.h_targetFeePeriodDurationSeconds())
            self.h_checkFeePeriodRollover(DUMMY)

            # withdraw the fees
            inital_pool = self.h_lastFeesCollected()
            total_fees_collected = 0
            for addr in hav_addr:
                inital_n = self.n_balanceOf(addr)
                self.h_withdrawFeeEntitlement(addr)
                if percentage_havvens == 0:
                    self.assertEquals(self.n_balanceOf(addr), 0)
                else:
                    self.assertNotEqual(self.n_balanceOf(addr), 0)
                total_fees_collected += self.n_balanceOf(addr) - inital_n
            self.assertClose(inital_pool * percentage_havvens, total_fees_collected, precision=5)

    def test_multi_period_100_percent_withdrawal(self):
        self.check_fees_multi_period(1, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_multi_period_50_percent_withdrawal(self):
        self.check_fees_multi_period(.5, [10, 20, 30, 40], [100, 200, 200, 300, 300])

    def test_multi_period_0_percent_withdrawal(self):
        self.check_fees_multi_period(0, [10, 20, 30, 40], [100, 200, 200, 300, 300])

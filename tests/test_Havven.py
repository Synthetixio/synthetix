import random

from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    mine_txs, mine_tx,
    fresh_accounts, fresh_account,
    attempt_deploy,
    take_snapshot, restore_snapshot,
    fast_forward, to_seconds
)
from utils.testutils import (
    HavvenTestCase, block_time,
    get_event_data_from_log, generate_topic_event_map,
    ZERO_ADDRESS
)
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.nomin_interface import PublicNominInterface


def setUpModule():
    print("Testing Havven...")
    print("=================")
    print()


def tearDownModule():
    print()
    print()


class TestHavven(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        print("Deployment initiated.\n")

        sources = ["tests/contracts/PublicHavven.sol", "contracts/Nomin.sol",
                   "contracts/HavvenEscrow.sol"]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)

        # Deploy contracts
        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['Nomin']['abi'])

        havven_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                              MASTER, [MASTER, MASTER])
        nomin_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                             MASTER, [MASTER, MASTER])
        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [havven_proxy.address, havven_tokenstate.address, MASTER, MASTER, cls.initial_price, [], ZERO_ADDRESS])
        hvn_block = W3.eth.blockNumber
        nomin_contract, nom_txr = attempt_deploy(compiled, 'Nomin',
                                                 MASTER,
                                                 [nomin_proxy.address, nomin_tokenstate.address, havven_contract.address, 0, MASTER])
        escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                     MASTER,
                                                     [MASTER, havven_contract.address])

        # Hook up each of those contracts to each other
        mine_txs([
            havven_tokenstate.functions.setBalanceOf(havven_contract.address, 100000000 * UNIT).transact({'from': MASTER}),
            havven_tokenstate.functions.setAssociatedContract(havven_contract.address).transact({'from': MASTER}),
            nomin_tokenstate.functions.setAssociatedContract(nomin_contract.address).transact({'from': MASTER}),
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})
        ])

        havven_event_dict = generate_topic_event_map(compiled['PublicHavven']['abi'])

        print("\nDeployment complete.\n")
        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, havven_contract, nomin_contract, escrow_contract, hvn_block, havven_event_dict

    @classmethod
    def setUpClass(cls):
        # to avoid overflowing in the negative direction (now - feePeriodDuration * 2)
        fast_forward(weeks=102)

        cls.initial_price = UNIT // 2

        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, \
            cls.havven_contract, cls.nomin_contract, cls.escrow_contract, cls.construction_block, \
            cls.havven_event_dict = cls.deployContracts()

        cls.event_map = cls.event_maps['Havven']

        cls.havven = PublicHavvenInterface(cls.proxied_havven, "Havven")        
        cls.nomin = PublicNominInterface(cls.proxied_nomin, "Nomin")

        cls.unproxied_havven = PublicHavvenInterface(cls.havven_contract, "UnproxiedHavven")

        cls.initial_time = cls.havven.lastFeePeriodStartTime()
        cls.time_fast_forwarded = 0

        cls.base_havven_price = UNIT

        cls.sd_duration = 4 * 7 * 24 * 60 * 60

    def havven_updatePrice(self, sender, price, time):
        return mine_tx(self.havven_contract.functions.updatePrice(price, time).transact({'from': sender}), 'updatePrice', 'Havven')

    ###
    # Test inherited Owned - Should be the same test_Owned.py
    ###
    def test_owner_is_master(self):
        self.assertEqual(self.havven.owner(), MASTER)

    def test_change_owner(self):
        old_owner = self.havven.owner()
        new_owner = DUMMY

        self.havven.nominateNewOwner(old_owner, new_owner)
        self.havven.acceptOwnership(new_owner)
        self.assertEqual(self.havven.owner(), new_owner)

        # reset back to old owner
        self.havven.nominateNewOwner(new_owner, old_owner)
        self.havven.acceptOwnership(old_owner)
        self.assertEqual(self.havven.owner(), old_owner)

    def test_change_invalid_owner(self):
        invalid_account = DUMMY
        self.assertReverts(self.havven.nominateNewOwner, invalid_account, invalid_account)

    ###
    # Test inherited ExternStateToken
    ###
    # Constuctor
    def test_ExternStateToken_constructor(self):
        total_supply = 10 ** 8 * UNIT
        self.assertEqual(self.havven.name(), "Havven")
        self.assertEqual(self.havven.symbol(), "HAV")
        self.assertEqual(self.havven.totalSupply(), total_supply)
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), total_supply)

    # Approval
    def test_approve(self):
        owner = MASTER
        spender = DUMMY
        self.havven.approve(owner, spender, UNIT)
        self.assertEqual(self.havven.allowance(owner, spender), UNIT)
        self.havven.approve(owner, spender, 0)
        self.assertEqual(self.havven.allowance(owner, spender), 0)

    #
    ##
    ###
    # Test Havven
    ###
    ###
    # Constructor
    ###
    def test_constructor(self):
        fee_period = self.havven.feePeriodDuration()
        self.assertEqual(fee_period, to_seconds(weeks=4))
        self.assertGreater(block_time(), 2 * fee_period)
        self.assertEqual(self.havven.MIN_FEE_PERIOD_DURATION(), to_seconds(days=1))
        self.assertEqual(self.havven.MAX_FEE_PERIOD_DURATION(), to_seconds(weeks=26))
        self.assertEqual(self.havven.lastFeesCollected(), 0)
        self.assertEqual(self.havven.nomin(), self.nomin_contract.address)
        self.assertEqual(self.havven.escrow(), self.escrow_contract.address)
        self.assertEqual(self.havven.decimals(), 18)
        self.assertEqual(self.havven.feePeriodStartTime(), block_time(self.construction_block))
        self.assertEqual(self.havven.lastFeePeriodStartTime(), block_time(self.construction_block) - fee_period)
        self.assertEqual(self.havven.lastFeesCollected(), 0)
        self.assertEqual(self.havven.price(), self.initial_price)

    def test_constructor_migration(self):
        # Ensure issuers list updates issued balances properly... update deploycontracts above.
        sources = ["tests/contracts/PublicHavven.sol", "contracts/Nomin.sol",
                   "contracts/HavvenEscrow.sol"]

        print()
        compiled, event_maps = self.compileAndMapEvents(sources)

        # Initial issued nomin balances
        #issuer_addresses = [f"0x{'0'*39}{i+1}" for i in range(10)]
        issuers_all = fresh_accounts(54)
        issuers = issuers_all[:2]
        issuer_balances = [77 * UNIT * i for i in range(10)]
        total_nomins = sum(issuer_balances)

        # Deploy contracts
        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['PublicHavven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['Nomin']['abi'])

        havven_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                              MASTER, [MASTER, MASTER])
        nomin_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                             MASTER, [MASTER, MASTER])
        havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [havven_proxy.address, havven_tokenstate.address, MASTER, MASTER, UNIT, [], ZERO_ADDRESS])
        hvn_block = W3.eth.blockNumber
        nomin_contract, nom_txr = attempt_deploy(compiled, 'Nomin',
                                                 MASTER,
                                                 [nomin_proxy.address, nomin_tokenstate.address, havven_contract.address, 0, MASTER])
        escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                     MASTER,
                                                     [MASTER, havven_contract.address])

        mine_txs([
            havven_tokenstate.functions.setBalanceOf(havven_contract.address, 100000000 * UNIT).transact({'from': MASTER}),
            havven_tokenstate.functions.setAssociatedContract(havven_contract.address).transact({'from': MASTER}),
            nomin_tokenstate.functions.setAssociatedContract(nomin_contract.address).transact({'from': MASTER}),
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER})
        ])

        havven_event_dict = generate_topic_event_map(compiled['PublicHavven']['abi'])

        havven = PublicHavvenInterface(proxied_havven, "Havven")        
        nomin = PublicNominInterface(proxied_nomin, "Nomin")

        for i in range(len(issuers)):
            issuer = issuers[i]
            havven.endow(MASTER, issuer, 1000 * UNIT)
            havven.setIssuer(MASTER, issuer, True)
            mine_txs([havven_contract.functions.updatePrice(UNIT, block_time() + 1).transact({'from': MASTER})])
            havven.issueNomins(issuer, i * 10 * UNIT)
            fast_forward(havven.feePeriodDuration() // 20)

        for i in range(len(issuers)):
            issuer = issuers[i]
            havven.endow(MASTER, issuer, 1000 * UNIT)
            havven.setIssuer(MASTER, issuer, True)
            mine_txs([havven_contract.functions.updatePrice(UNIT, block_time() + 1).transact({'from': MASTER})])
            havven.issueNomins(issuer, (len(issuers) - 1 - i) * 5 * UNIT)
            fast_forward(havven.feePeriodDuration() // 15)

        new_havven_contract, txr = attempt_deploy(compiled, 'PublicHavven', MASTER, [havven_proxy.address, havven_tokenstate.address, MASTER, MASTER, UNIT, issuers_all, havven_contract.address])
        new_havven = PublicHavvenInterface(new_havven_contract, "Havven")

        self.assertEqual(havven.totalIssuanceData(), new_havven.totalIssuanceData())
        self.assertEqual(havven.feePeriodStartTime(), new_havven.feePeriodStartTime())
        self.assertEqual(havven.lastFeePeriodStartTime(), new_havven.lastFeePeriodStartTime())

        for issuer in issuers:
            self.assertEqual(havven.isIssuer(issuer), new_havven.isIssuer(issuer))
            self.assertEqual(havven.issuanceData(issuer), new_havven.issuanceData(issuer))
            self.assertEqual(havven.nominsIssued(issuer), new_havven.nominsIssued(issuer))

    ###
    # Mappings
    ###
    # currentBalanceSum
    def test_currentBalanceSum(self):
        # Testing the value of currentBalanceSum works as intended,
        # Further testing involving this and fee collection will be done
        # in scenario testing
        fee_period = self.havven.feePeriodDuration()
        delay = int(fee_period / 10)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.havven.endow(MASTER, alice, start_amt)
        self.havven.setIssuer(MASTER, alice, True)
        self.havven_updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        self.havven.issueNomins(alice, start_amt)

        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.nomin.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.issuanceCurrentBalanceSum(alice), 0)
        start_time = block_time()
        fast_forward(delay)
        self.havven.recomputeLastAverageBalance(alice, alice)
        end_time = block_time()
        balance_sum = (end_time - start_time) * start_amt
        self.assertEqual(
            self.havven.issuanceCurrentBalanceSum(alice),
            balance_sum
        )
        self.havven.burnNomins(alice, start_amt)
        self.assertEqual(self.nomin.balanceOf(alice), 0)
        fast_forward(delay)
        self.havven.recomputeLastAverageBalance(alice, alice)
        self.assertClose(
            self.havven.issuanceCurrentBalanceSum(alice), balance_sum
        )

    # lastAverageBalance
    def test_lastAverageBalance(self):
        # set the block time to be at least 30seconds away from the end of the fee_period
        fee_period = self.havven.feePeriodDuration()

        # fast forward next block with some extra padding
        delay = fee_period + 1
        fast_forward(delay)
        self.havven.rolloverFeePeriodIfElapsed(DUMMY)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)

        start_amt = UNIT * 50

        self.havven.endow(MASTER, alice, start_amt)
        self.havven.setIssuer(MASTER, alice, True)
        self.havven_updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        tx_receipt = self.havven.issueNomins(alice, start_amt)

        self.assertEqual(self.havven.balanceOf(alice), start_amt)
        self.assertEqual(self.havven.issuanceCurrentBalanceSum(alice), 0)
        self.assertEqual(self.havven.issuanceLastAverageBalance(alice), 0)
        self.assertEqual(self.havven.issuanceLastModified(alice), block_time(tx_receipt['blockNumber']))
        fast_forward(delay)
        self.havven.rolloverFeePeriodIfElapsed(DUMMY)
        fast_forward(fee_period // 2)

        tx_receipt = self.havven.recomputeLastAverageBalance(alice, alice)
        block_number = tx_receipt['blockNumber']

        duration_since_rollover = block_time(block_number) - self.havven.feePeriodStartTime()
        balance_sum = duration_since_rollover * start_amt

        actual = self.havven.issuanceCurrentBalanceSum(alice)
        expected = balance_sum
        self.assertClose(
            actual, expected
        )

        time_remaining = self.havven.feePeriodDuration() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining - 5)
        self.havven.burnNomins(alice, start_amt // 2)
        time_remaining = self.havven.feePeriodDuration() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 10)

        self.havven.rolloverFeePeriodIfElapsed(alice)
        self.havven.recomputeLastAverageBalance(alice, alice)

        actual = self.havven.issuanceLastAverageBalance(alice)
        expected = (start_amt * delay) // (self.havven.feePeriodStartTime() - self.havven.lastFeePeriodStartTime())
        self.assertClose(
            actual, expected
        )

    def test_lastAverageBalanceFullPeriod(self):
        alice = fresh_account()
        self.havven.setIssuer(MASTER, alice, True)
        fee_period = self.havven.feePeriodDuration()

        # Alice will initially have 20 havvens
        self.havven.endow(MASTER, alice, 20 * UNIT)
        self.havven.setIssuer(MASTER, alice, True)
        self.havven_updatePrice(MASTER, UNIT, block_time()+1)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        self.havven.issueNomins(alice, 20 * UNIT)

        self.assertEqual(self.havven.balanceOf(alice), 20 * UNIT)
        self.assertEqual(self.nomin.balanceOf(alice), 20 * UNIT)

        # Fastforward until just before a fee period rolls over.
        time_remaining = self.havven.feePeriodDuration() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        tx_receipt = self.havven.rolloverFeePeriodIfElapsed(alice)
        self.havven_updatePrice(MASTER, UNIT, block_time())
        issue_receipt = self.havven.issueNomins(alice, 0) 

        self.assertEqual(self.havven.issuanceLastModified(alice), block_time(issue_receipt['blockNumber']))
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        # roll over the full period
        fast_forward(fee_period + 50)
        tx_receipt = self.havven.rolloverFeePeriodIfElapsed(MASTER)
        self.havven_updatePrice(MASTER, UNIT, block_time()+1)
        transfer_receipt = self.havven.issueNomins(alice, 0)

        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')
        self.assertEqual(self.havven.issuanceLastModified(alice), block_time(transfer_receipt['blockNumber'])) 
        self.assertEqual(self.havven.issuanceLastAverageBalance(alice), 20 * UNIT)

        # Try a half-and-half period
        time_remaining = self.havven.feePeriodDuration() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 50)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)
        self.havven.burnNomins(alice, 10 * UNIT)

        fast_forward(fee_period // 2 + 10)
        self.havven.burnNomins(alice, 10 * UNIT)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)

        fast_forward(fee_period // 2 + 10)

        tx_receipt = self.havven.rolloverFeePeriodIfElapsed(MASTER)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

        self.havven.rolloverFeePeriodIfElapsed(alice)
        self.havven.recomputeLastAverageBalance(alice, alice)
        self.assertClose(self.havven.issuanceLastAverageBalance(alice), 5 * UNIT)

    def test_arithmeticSeriesBalance(self):
        alice = fresh_account()
        fee_period = self.havven.feePeriodDuration()
        n = 50

        self.havven.endow(MASTER, alice, n * UNIT)
        self.havven_updatePrice(self.havven.oracle(), UNIT, block_time())
        self.havven.setIssuer(MASTER, alice, True)
        self.havven.issueNomins(alice, n * UNIT // 20)
        time_remaining = self.havven.feePeriodDuration() + self.havven.feePeriodStartTime() - block_time()
        fast_forward(time_remaining + 5)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)

        for _ in range(n):
            self.havven.burnNomins(alice, UNIT // 20) 
            fast_forward(fee_period // n)

        fast_forward(n)  # fast forward allow the rollover to happen
        self.havven.rolloverFeePeriodIfElapsed(MASTER)

        self.havven.recomputeLastAverageBalance(alice, alice)
        self.assertClose(self.havven.issuanceLastAverageBalance(alice), n * (n - 1) * UNIT // (2 * n * 20), precision=3)

    def test_averageBalanceSum(self):
        alice, bob, carol = fresh_accounts(3)
        fee_period = self.havven.feePeriodDuration()

        self.havven.endow(MASTER, alice, UNIT)
        self.havven.endow(MASTER, bob, UNIT)
        self.havven.endow(MASTER, carol, UNIT)

        self.havven.setIssuer(MASTER, alice, True)
        self.havven.setIssuer(MASTER, bob, True)
        self.havven.setIssuer(MASTER, carol, True)
        self.havven.setIssuanceRatio(MASTER, UNIT)

        fast_forward(fee_period + 1)
        self.havven.rolloverFeePeriodIfElapsed(DUMMY)

        for i in range(10):
            self.havven_updatePrice(MASTER, UNIT, block_time() + 1)
            a_weight = random.random()
            b_weight = random.random()
            c_weight = random.random()
            tot = a_weight + b_weight + c_weight

            self.havven.issueNomins(alice, max(1, int(UNIT * a_weight / tot)))
            self.havven.issueNomins(bob, max(1, int(UNIT * b_weight / tot)))
            self.havven.issueNomins(carol, max(1, int(UNIT * c_weight / tot)))
            fast_forward(fee_period // 10 - 1)
            self.havven.burnNomins(alice, max(1, int(UNIT * a_weight / tot)))
            self.havven.burnNomins(bob, max(1, int(UNIT * b_weight / tot)))
            self.havven.burnNomins(carol, max(1, int(UNIT * c_weight / tot)))
        fast_forward(11)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)

        self.havven.recomputeLastAverageBalance(alice, alice)
        self.havven.recomputeLastAverageBalance(bob, bob)
        self.havven.recomputeLastAverageBalance(carol, carol)

        total_average = self.havven.issuanceLastAverageBalance(alice) + \
            self.havven.issuanceLastAverageBalance(bob) + \
            self.havven.issuanceLastAverageBalance(carol)

        self.assertClose(UNIT, total_average, precision=3)

    # lastModified - tested above
    # hasWithdrawnFees - tested in test_FeeCollection.py
    # lastFeesCollected - tested in test_FeeCollection.py

    ###
    # Contract variables
    ###
    # feePeriodStartTime - tested above
    # feePeriodDuration - tested above
    # MIN_FEE_PERIOD_DURATION - constant, checked in constructor test

    ###
    # Functions
    ###

    # setNomin
    def test_setNomin(self):
        alice = fresh_account()
        self.havven.setNomin(MASTER, alice)
        self.assertEqual(self.havven.nomin(), alice)

    def test_invalidSetNomin(self):
        alice = fresh_account()
        self.assertReverts(self.havven.setNomin, alice, alice)

    # setEscrow
    def test_setEscrow(self):
        alice = fresh_account()
        self.havven.setEscrow(MASTER, alice)
        self.assertEqual(self.havven.escrow(), alice)

    def test_invalidSetEscrow(self):
        alice = fresh_account()
        self.assertReverts(self.havven.setEscrow, alice, alice)

    # setIssuanceRatio
    def test_setIssuanceRatio(self):
        self.havven.setIssuanceRatio(MASTER, 3 * UNIT // 10)
        self.assertEqual(self.havven.issuanceRatio(), 3 * UNIT // 10)

    def test_setIssuanceRatio_max(self):
        self.havven.setIssuanceRatio(MASTER, self.havven.MAX_ISSUANCE_RATIO())
        self.assertReverts(self.havven.setIssuanceRatio, MASTER, self.havven.MAX_ISSUANCE_RATIO() + 1)

    # setFeePeriodDuration
    def test_setFeePeriodDuration(self):
        self.havven.setFeePeriodDuration(MASTER, to_seconds(weeks=10))
        self.assertEqual(
            self.havven.feePeriodDuration(),
            to_seconds(weeks=10)
        )

    def test_setFeePeriodDuration_max(self):
        sixmonths = 26 * 7 * 24 * 60 * 60
        self.assertReverts(self.havven.setFeePeriodDuration, MASTER, 2 ** 256 - 1)
        self.assertReverts(self.havven.setFeePeriodDuration, MASTER, sixmonths + 1)
        self.havven.setFeePeriodDuration(MASTER, sixmonths)
        self.assertEqual(
            self.havven.feePeriodDuration(),
            sixmonths
        )

    def test_setFeePeriodDuration_min(self):
        self.havven.setFeePeriodDuration(MASTER, self.havven.MIN_FEE_PERIOD_DURATION())
        self.assertEqual(
            self.havven.feePeriodDuration(),
            self.havven.MIN_FEE_PERIOD_DURATION()
        )

    def test_setFeePeriodDuration_invalid_below_min(self):
        self.assertReverts(self.havven.setFeePeriodDuration, MASTER, self.havven.MIN_FEE_PERIOD_DURATION() - 1)

    def test_setFeePeriodDuration_invalid_0(self):
        self.assertReverts(self.havven.setFeePeriodDuration, MASTER, self.havven.MIN_FEE_PERIOD_DURATION() - 1)

    # endow
    def test_endow_valid(self):
        amount = 50 * UNIT
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

    def test_endow_0(self):
        amount = 0
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

    def test_endow_supply(self):
        amount = self.havven.totalSupply()
        havven_balance = self.havven.balanceOf(self.havven_contract.address)
        alice = fresh_account()
        self.assertEqual(self.havven.balanceOf(alice), 0)
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(havven_balance - self.havven.balanceOf(self.havven_contract.address), amount)

    def test_endow_more_than_supply(self):
        amount = self.havven.totalSupply() * 2
        alice = fresh_account()
        self.assertReverts(self.havven.endow, MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_invalid_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.havven.endow, alice, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_contract_sender(self):
        amount = 50 * UNIT
        alice = fresh_account()
        self.assertReverts(self.havven.endow, self.havven.contract.address, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), 0)

    def test_endow_to_contract(self):
        amount = 50 * UNIT
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), self.havven.totalSupply())
        self.havven.endow(MASTER, self.havven_contract.address, amount)
        self.assertEqual(self.havven.balanceOf(self.havven_contract.address), self.havven.totalSupply())
        self.havven.endow(MASTER, self.havven_contract.address, amount)

    def test_endow_transfers(self):
        alice = fresh_account()
        tx_receipt = self.havven.endow(MASTER, alice, 50 * UNIT)
        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'Transfer')

    # transfer
    def test_transferRollsOver(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 50 * UNIT)
        fast_forward(seconds=self.havven.feePeriodDuration() + 100)
        self.havven.transfer(alice, MASTER, 25 * UNIT)
        tx_receipt = self.havven.rolloverFeePeriodIfElapsed(MASTER)

        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    # same as test_ExternStateToken
    def test_transfer(self):
        sender, receiver, no_tokens = fresh_accounts(3)
        self.havven.endow(MASTER, sender, 50 * UNIT)
        sender_balance = self.havven.balanceOf(sender)

        receiver_balance = self.havven.balanceOf(receiver)
        self.assertEqual(receiver_balance, 0)

        value = 10 * UNIT
        total_supply = self.havven.totalSupply()

        # This should fail because receiver has no tokens
        self.assertReverts(self.havven.transfer, receiver, sender, value)

        self.havven.transfer(sender, receiver, value)
        self.assertEqual(self.havven.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.havven.balanceOf(sender), sender_balance - value)

        # transfers should leave the supply unchanged
        self.assertEqual(self.havven.totalSupply(), total_supply)

        value = 1001 * UNIT
        # This should fail because balance < value and balance > totalSupply
        self.assertReverts(self.havven.transfer, sender, receiver, value)

        # 0 value transfers are allowed.
        value = 0
        pre_sender_balance = self.havven.balanceOf(sender)
        pre_receiver_balance = self.havven.balanceOf(receiver)
        self.havven.transfer(sender, receiver, value)
        self.assertEqual(self.havven.balanceOf(receiver), pre_receiver_balance)
        self.assertEqual(self.havven.balanceOf(sender), pre_sender_balance)

        # It is also possible to send 0 value transfer from an account with 0 balance.
        self.assertEqual(self.havven.balanceOf(no_tokens), 0)
        self.havven.transfer(no_tokens, receiver, value)
        self.assertEqual(self.havven.balanceOf(no_tokens), 0)

    # transferFrom
    def test_transferFromRollsOver(self):
        alice = fresh_account()
        self.havven.endow(MASTER, alice, 50 * UNIT)
        self.havven.approve(alice, MASTER, 25 * UNIT)
        fast_forward(seconds=self.havven.feePeriodDuration() + 100)
        self.havven.transferFrom(MASTER, alice, MASTER, 25 * UNIT)
        tx_receipt = self.havven.rolloverFeePeriodIfElapsed(MASTER)

        event = get_event_data_from_log(self.havven_event_dict, tx_receipt.logs[0])
        self.assertEqual(event['event'], 'FeePeriodRollover')

    def test_transferFrom(self):
        approver, spender, receiver, no_tokens = fresh_accounts(4)

        self.havven.endow(MASTER, approver, 50 * UNIT)

        approver_balance = self.havven.balanceOf(approver)
        spender_balance = self.havven.balanceOf(spender)
        receiver_balance = self.havven.balanceOf(receiver)

        value = 10 * UNIT
        total_supply = self.havven.totalSupply()

        # This fails because there has been no approval yet
        self.assertReverts(self.havven.transferFrom, spender, approver, receiver, value)

        self.havven.approve(approver, spender, 2 * value)
        self.assertEqual(self.havven.allowance(approver, spender), 2 * value)

        self.assertReverts(self.havven.transferFrom, spender, approver, receiver, 2 * value + 1)
        self.havven.transferFrom(spender, approver, receiver, value)

        self.assertEqual(self.havven.balanceOf(approver), approver_balance - value)
        self.assertEqual(self.havven.balanceOf(spender), spender_balance)
        self.assertEqual(self.havven.balanceOf(receiver), receiver_balance + value)
        self.assertEqual(self.havven.allowance(approver, spender), value)
        self.assertEqual(self.havven.totalSupply(), total_supply)

        # Empty the account
        self.havven.transferFrom(spender, approver, receiver, value)

        # This account has no tokens
        approver_balance = self.havven.balanceOf(no_tokens)
        self.assertEqual(approver_balance, 0)
        self.assertEqual(self.havven.allowance(no_tokens, spender), 0)

        self.havven.approve(no_tokens, spender, value)
        self.assertEqual(self.havven.allowance(no_tokens, spender), value)

        # This should fail because the approver has no tokens.
        self.assertReverts(self.havven.transferFrom, spender, no_tokens, receiver, value)

    def test_double_withdraw_fee(self):
        alice = fresh_account()
        self.havven.withdrawFees(alice)
        self.assertReverts(self.havven.withdrawFees, alice)

    def test_withdraw_multiple_periods(self):
        alice = fresh_account()
        self.havven.withdrawFees(alice)
        fast_forward(self.havven.feePeriodDuration() * 2)
        self.havven.rolloverFeePeriodIfElapsed(DUMMY)
        self.havven.withdrawFees(alice)
        fast_forward(self.havven.feePeriodDuration() * 2)
        self.havven.rolloverFeePeriodIfElapsed(DUMMY)

    # adjustFeeEntitlement - tested above
    # rolloverFee - tested above, indirectly

    # withdrawFees - tested in test_FeeCollection.py

    def test_selfDestruct(self):
        owner = self.havven.owner()
        notowner = DUMMY
        self.assertNotEqual(owner, notowner)

        # The contract cannot be self-destructed before the SD has been initiated.
        self.assertReverts(self.unproxied_havven.selfDestruct, owner)

        tx = self.unproxied_havven.initiateSelfDestruct(owner)
        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructInitiated",
                               {"selfDestructDelay": self.sd_duration},
                               location=self.havven_contract.address)

        # Neither owners nor non-owners may not self-destruct before the time has elapsed.
        self.assertReverts(self.unproxied_havven.selfDestruct, notowner)
        self.assertReverts(self.unproxied_havven.selfDestruct, owner)
        fast_forward(seconds=self.sd_duration, days=-1)
        self.assertReverts(self.unproxied_havven.selfDestruct, notowner)
        self.assertReverts(self.unproxied_havven.selfDestruct, owner)
        fast_forward(seconds=10, days=1)

        # Non-owner should not be able to self-destruct even if the time has elapsed.
        self.assertReverts(self.unproxied_havven.selfDestruct, notowner)
        address = self.unproxied_havven.contract.address
        tx = self.unproxied_havven.selfDestruct(owner)

        self.assertEventEquals(self.event_map, tx.logs[0],
                               "SelfDestructed",
                               {"beneficiary": owner},
                               location=self.havven_contract.address)
        # Check contract not exist 
        self.assertEqual(W3.eth.getCode(address), b'\x00')

    ###
    # Modifiers
    ###
    # postrolloverFeePeriodIfElapsed - tested above
    def test_rolloverFeePeriodIfElapsed_escrow_exists(self):
        fast_forward(seconds=self.havven.feePeriodDuration() + 10)

        pre_feePeriodStartTime = self.havven.feePeriodStartTime()
        # This should work fine.
        self.havven.rolloverFeePeriodIfElapsed(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

        fast_forward(seconds=self.havven.feePeriodDuration() + 10)
        pre_feePeriodStartTime = self.havven.feePeriodStartTime()
        # And so should this
        self.havven.setEscrow(MASTER, ZERO_ADDRESS)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)
        self.assertGreater(self.havven.feePeriodStartTime(), pre_feePeriodStartTime)

    def test_abuse_havven_balance(self):
        # Test whether repeatedly moving havvens between two parties will shift averages upwards
        alice = fresh_account()
        amount = UNIT * 100000
        self.havven_updatePrice(MASTER, UNIT, block_time() + 1)
        self.havven.setIssuer(MASTER, alice, True)
        self.havven.setIssuanceRatio(MASTER, UNIT)
        a_sum = 0
        self.havven.endow(MASTER, alice, amount)
        self.assertEqual(self.havven.balanceOf(alice), amount)
        self.assertEqual(self.havven.issuanceCurrentBalanceSum(alice), 0)
        for i in range(20):
            self.havven.issueNomins(alice, amount)
            t = block_time()
            self.assertEqual(self.nomin.balanceOf(alice), amount)
            self.assertEqual(self.havven.issuanceCurrentBalanceSum(alice), a_sum)
            self.havven.burnNomins(alice, amount)
            a_sum += (block_time() - t) * amount
            self.assertEqual(self.nomin.balanceOf(alice), 0)
            self.assertEqual(self.havven.issuanceCurrentBalanceSum(alice), a_sum)

    def test_event_PriceUpdated(self):
        time = block_time()
        tx = self.havven_updatePrice(self.havven.oracle(), 10 * UNIT, time)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "PriceUpdated",
                               {"newPrice": 10 * UNIT,
                                "timestamp": time},
                               self.havven_proxy.address)

    def test_event_IssuanceRatioUpdated(self):
        new_ratio = UNIT // 12
        tx = self.havven.setIssuanceRatio(MASTER, new_ratio)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "IssuanceRatioUpdated",
                               {"newRatio": new_ratio},
                               self.havven_proxy.address)

    def test_event_FeePeriodRollover(self):
        fee_period = self.havven.feePeriodDuration()
        fast_forward(fee_period + 10) 
        tx = self.havven.rolloverFeePeriodIfElapsed(MASTER)
        time = block_time(tx.blockNumber)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "FeePeriodRollover",
                               {"timestamp": time},
                               self.havven_proxy.address)

    def test_event_FeePeriodDurationUpdated(self):
        new_duration = 19 * 24 * 60 * 60
        tx = self.havven.setFeePeriodDuration(MASTER, new_duration)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "FeePeriodDurationUpdated",
                               {"duration": new_duration},
                               self.havven_proxy.address)

    def test_event_FeesWithdrawn(self):
        issuer = fresh_account()
        fee_rate = self.nomin.transferFeeRate()
        fee_period = self.havven.feePeriodDuration()
        self.havven.endow(MASTER, issuer, 2 * UNIT)
        self.havven_updatePrice(self.havven.oracle(), UNIT, block_time())
        self.havven.setIssuanceRatio(MASTER, UNIT)
        self.havven.setIssuer(MASTER, issuer, True)
        self.havven.issueNomins(issuer, 2 * UNIT)
        fast_forward(fee_period + 100)
        self.havven.rolloverFeePeriodIfElapsed(MASTER)
        self.nomin.transferSenderPaysFee(issuer, issuer, UNIT)
        fast_forward(fee_period + 100)
        tx = self.havven.withdrawFees(issuer)
        self.assertEventEquals(self.event_map,
                               tx.logs[3], "FeesWithdrawn",
                               {"account": issuer,
                                "value": fee_rate},
                               self.havven_proxy.address)

    def test_event_OracleUpdated(self):
        new_oracle = fresh_account()
        self.assertNotEqual(MASTER, new_oracle)
        tx = self.havven.setOracle(MASTER, new_oracle)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "OracleUpdated",
                               {"newOracle": new_oracle},
                               self.havven_proxy.address)

    def test_event_NominUpdated(self):
        new_nomin = fresh_account()
        self.assertNotEqual(MASTER, new_nomin)
        tx = self.havven.setNomin(MASTER, new_nomin)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "NominUpdated",
                               {"newNomin": new_nomin},
                               self.havven_proxy.address)

    def test_event_EscrowUpdated(self):
        new_escrow = fresh_account()
        self.assertNotEqual(MASTER, new_escrow)
        tx = self.havven.setEscrow(MASTER, new_escrow)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "EscrowUpdated",
                               {"newEscrow": new_escrow},
                               self.havven_proxy.address)

    def test_event_IssuersUpdated(self):
        new_issuer = fresh_account()
        self.assertNotEqual(MASTER, new_issuer)
        tx = self.havven.setIssuer(MASTER, new_issuer, True)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "IssuersUpdated",
                               {"account": new_issuer,
                                "value": True},
                               self.havven_proxy.address)
        tx = self.havven.setIssuer(MASTER, new_issuer, False)
        self.assertEventEquals(self.event_map,
                               tx.logs[0], "IssuersUpdated",
                               {"account": new_issuer,
                                "value": False},
                               self.havven_proxy.address)

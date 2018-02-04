import unittest
from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, mine_tx, \
    UNIT, MASTER, DUMMY, to_seconds, fast_forward, fresh_account, fresh_accounts, take_snapshot, restore_snapshot
from utils.testutils import assertReverts, block_time, assertClose


SOLIDITY_SOURCES = ["tests/contracts/PublicHavven.sol", "tests/contracts/PublicEtherNomin.sol",
                    "contracts/Court.sol"]


def setUpModule():
    print("Testing Havven Fees...")

def tearDownModule():
    print()


def deploy_public_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'PublicHavven',
                                              MASTER, [MASTER])
    nomin_contract, nom_txr = attempt_deploy(compiled, 'PublicEtherNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000 * UNIT, MASTER])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract


class TestFeeCollection(unittest.TestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def setUpClass(cls):
        cls.assertClose = assertClose
        cls.assertReverts = assertReverts

        cls.havven, cls.nomin, cls.court = deploy_public_havven()

        # INHERITED
        # OWNED
        cls.h_owner = lambda self: self.havven.functions.owner().call()
        cls.h_setOwner = lambda self, sender, addr: mine_tx(
            self.havven.functions.setOwner(addr).transact({'from': sender}))
        # ERC20TOKEN (transfer/transferFrom are overwritten)
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

        cls.h_feePeriodStartTime = lambda self: self.havven.functions.feePeriodStartTime().call()
        cls.h_lastFeePeriodStartTime = lambda self: self.havven.functions._lastFeePeriodStartTime().call()
        cls.h_penultimateFeePeriodStartTime = lambda self: self.havven.functions._penultimateFeePeriodStartTime().call()
        cls.h_targetFeePeriodDurationSeconds = lambda self: self.havven.functions.targetFeePeriodDurationSeconds().call()
        cls.h_minFeePeriodDurationSeconds = lambda self: self.havven.functions._minFeePeriodDurationSeconds().call()
        cls.h_lastFeesCollected = lambda self: self.havven.functions.lastFeesCollected().call()
        cls.h_get_nomin = lambda self: self.havven.functions.nomin().call()
        # SETTERS
        cls.h_setNomin = lambda self, sender, addr: mine_tx(
            self.havven.functions.setNomin(addr).transact({'from': sender}))
        cls.h_setTargetFeePeriodDuration = lambda self, sender, dur: mine_tx(
            self.havven.functions.setTargetFeePeriodDuration(dur).transact({'from': sender}))
        # FUNCTIONS
        cls.h_endow = lambda self, sender, addr, amt: mine_tx(
            self.havven.functions.endow(addr, amt).transact({'from': sender}))
        cls.h_transfer = lambda self, sender, addr, amt: mine_tx(
            self.havven.functions.transfer(addr, amt).transact({'from': sender}))
        cls.h_transferFrom = lambda self, sender, frm, to, amt: mine_tx(
            self.havven.functions.transferFrom(frm, to, amt).transact({'from': sender}))
        # INTERNAL
        cls.h_adjustFeeEntitlement = lambda self, sender, acc, p_bal: mine_tx(
            self.havven.functions._adjustFeeEntitlement(acc, p_bal).transact({'from': sender}))
        cls.h_rolloverFee = lambda self, sender, acc, ltt, p_bal: mine_tx(
            self.havven.functions._rolloverFee(acc, ltt, p_bal).transact({'from': sender}))
        cls.h_withdrawFeeEntitlement = lambda self, sender: mine_tx(
            self.havven.functions.withdrawFeeEntitlement().transact({'from': sender}))
        cls.h_postCheckFeePeriodRollover = lambda self, sender: mine_tx(
            self.havven.functions._postCheckFeePeriodRollover().transact({'from': sender}))

        # NOMIN CONTRACT FUNCTION
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

        cls.n_setOwner = lambda self, sender, address: cls.nomin.functions.setOwner(address).transact({'from': sender})
        cls.n_setOracle = lambda self, sender, address: cls.nomin.functions.setOracle(address).transact({'from': sender})
        cls.n_setCourt = lambda self, sender, address: cls.nomin.functions.setCourt(address).transact({'from': sender})
        cls.n_setBeneficiary = lambda self, sender, address: cls.nomin.functions.setBeneficiary(address).transact({'from': sender})
        cls.n_setPoolFeeRate = lambda self, sender, rate: cls.nomin.functions.setPoolFeeRate(rate).transact({'from': sender})
        cls.n_updatePrice = lambda self, sender, price: cls.nomin.functions.updatePrice(price).transact({'from': sender})
        cls.n_setStalePeriod = lambda self, sender, period: cls.nomin.functions.setStalePeriod(period).transact({'from': sender})

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

        cls.n_transferPlusFee = lambda self, value: cls.nomin.functions.transferPlusFee(value).call()
        cls.n_transfer = lambda self, sender, recipient, value: cls.nomin.functions.transfer(recipient, value).transact({'from': sender})
        cls.n_transferFrom = lambda self, sender, fromAccount, to, value: cls.nomin.functions.transferFrom(fromAccount, to, value).transact({'from': sender})
        cls.n_approve = lambda self, sender, spender, value: cls.nomin.functions.approve(spender, value).transact({'from': sender})
        cls.n_issue = lambda self, sender, n, value: cls.nomin.functions.issue(n).transact({'from': sender, 'value': value})
        cls.n_burn = lambda self, sender, n: cls.nomin.functions.burn(n).transact({'from': sender})
        cls.n_buy = lambda self, sender, n, value: cls.nomin.functions.buy(n).transact({'from': sender, 'value': value})
        cls.n_sell = lambda self, sender, n: cls.nomin.functions.sell(n).transact({'from': sender, 'gasPrice': 10})

        cls.n_forceLiquidation = lambda self, sender: cls.nomin.functions.forceLiquidation().transact({'from': sender})
        cls.n_liquidate = lambda self, sender: cls.nomin.functions.liquidate().transact({'from': sender})
        cls.n_extendLiquidationPeriod = lambda self, sender, extension: cls.nomin.functions.extendLiquidationPeriod(extension).transact({'from': sender})
        cls.n_terminateLiquidation = lambda self, sender: cls.nomin.functions.terminateLiquidation().transact({'from': sender})
        cls.n_selfDestruct = lambda self, sender: cls.nomin.functions.selfDestruct().transact({'from': sender})

        cls.n_confiscateBalance = lambda self, sender, target: cls.nomin.functions.confiscateBalance(target).transact({'from': sender})
        cls.n_unfreezeAccount = lambda self, sender, target: cls.nomin.functions.unfreezeAccount(target).transact({'from': sender})

        cls.n_name = lambda self: cls.nomin.functions.name().call()
        cls.n_symbol = lambda self: cls.nomin.functions.symbol().call()
        cls.n_totalSupply = lambda self: cls.nomin.functions.totalSupply().call()
        cls.n_balanceOf = lambda self, account: cls.nomin.functions.balanceOf(account).call()
        cls.n_transferFeeRate = lambda self: cls.nomin.functions.transferFeeRate().call()
        cls.n_feePool = lambda self: cls.nomin.functions.feePool().call()
        cls.n_feeAuthority = lambda self: cls.nomin.functions.feeAuthority().call()

        cls.n_debugWithdrawAllEther = lambda self, sender, recipient: cls.nomin.functions.debugWithdrawAllEther(recipient).transact({'from': sender})
        cls.n_debugEmptyFeePool = lambda self, sender: cls.nomin.functions.debugEmptyFeePool().transact({'from': sender})
        cls.n_debugFreezeAccount = lambda self, sender, target: cls.nomin.functions.debugFreezeAccount(target).transact({'from': sender})

    def test_double_collect(self):
        alice = fresh_account()
        self.h_withdrawFeeEntitlement(alice)
        self.assertReverts(self.h_withdrawFeeEntitlement, alice)

    def test_withdraw_multiple_periods(self):
        alice = fresh_account()
        self.h_withdrawFeeEntitlement(alice)
        fast_forward(self.h_minFeePeriodDurationSeconds()*2)
        self.h_postCheckFeePeriodRollover(DUMMY)
        fast_forward(10)
        self.h_withdrawFeeEntitlement(alice)


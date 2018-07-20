from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    mine_tx, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot, fast_forward
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS, block_time, get_eth_balance
)
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_interface import PublicHavvenInterface
from tests.contract_interfaces.issuanceController_interface import IssuanceControllerInterface

def setUpModule():
    print("Testing IssuanceController...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestIssuanceController(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = [
            "tests/contracts/PublicHavven.sol",
            "tests/contracts/PublicNomin.sol",
            "contracts/IssuanceController.sol"
        ]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)
        nomin_abi = compiled['PublicNomin']['abi']
        havven_abi = compiled['PublicHavven']['abi']
        issuance_controller_abi = compiled['IssuanceController']['abi']

        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=havven_abi)
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=nomin_abi)

        havven_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                              MASTER, [MASTER, MASTER])
        nomin_tokenstate, _ = attempt_deploy(compiled, 'TokenState',
                                             MASTER, [MASTER, MASTER])
        havven_contract, hvn_txr = attempt_deploy(
            compiled, 'PublicHavven', MASTER, [havven_proxy.address, havven_tokenstate.address, MASTER, MASTER, UNIT//2, [], ZERO_ADDRESS]
        )
        nomin_contract, nom_txr = attempt_deploy(
            compiled, 'PublicNomin', MASTER, [nomin_proxy.address, nomin_tokenstate.address, havven_contract.address, 0, MASTER]
        )

        mine_txs([
            havven_tokenstate.functions.setBalanceOf(havven_contract.address, 100000000 * UNIT).transact({'from': MASTER}),
            havven_tokenstate.functions.setAssociatedContract(havven_contract.address).transact({'from': MASTER}),
            nomin_tokenstate.functions.setAssociatedContract(nomin_contract.address).transact({'from': MASTER}),
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
        ])

        issuanceControllerContract, _ = attempt_deploy(
            compiled, 'IssuanceController', MASTER,
                [
                    cls.contractOwner,
                    cls.fundsWallet,
                    havven_contract.address,
                    nomin_contract.address,
                    cls.oracleAddress,
                    cls.usdToEthPrice,
                    cls.usdToHavPrice
                ]
            )

        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, havven_contract, nomin_contract, nomin_abi, issuanceControllerContract

    @classmethod
    def setUpClass(cls):
        addresses = fresh_accounts(6)
        cls.participantAddresses = addresses[2:]
        cls.contractOwner = MASTER
        cls.oracleAddress = addresses[0]
        cls.fundsWallet = addresses[1]
        cls.usdToEthPrice = 500 * UNIT
        cls.usdToHavPrice = int(0.65 * UNIT)
        cls.priceStalePeriod = 3 * 60 * 60
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.havven_contract, cls.nomin_contract, cls.nomin_abi, cls.issuanceControllerContract = cls.deployContracts()
        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")
        cls.havven = PublicHavvenInterface(cls.havven_contract, "Havven")
        cls.nomin = PublicNominInterface(cls.nomin_contract, "Nomin")
        cls.issuanceControllerEventDict = cls.event_maps['IssuanceController']
        fast_forward(1) # Give the contract constructor a second between its execution and execution of the other functions.

    def test_constructor(self):
        self.assertEqual(self.issuanceController.owner(), self.contractOwner)
        self.assertEqual(self.issuanceController.fundsWallet(), self.fundsWallet)
        self.assertEqual(self.issuanceController.oracle(), self.oracleAddress)
        self.assertEqual(self.issuanceController.usdToEthPrice(), self.usdToEthPrice)
        self.assertEqual(self.issuanceController.usdToHavPrice(), self.usdToHavPrice)
        self.assertEqual(self.issuanceController.havven(), self.havven_contract.address)
        self.assertEqual(self.issuanceController.nomin(), self.nomin_contract.address)

    # Oracle address setter and getter tests

    def test_getOracleAddress(self):
        oracleAddress = self.issuanceController.oracle()
        self.assertEqual(oracleAddress, self.oracleAddress)

    def test_setOracleAddress(self):
        newOracleAddress = self.participantAddresses[0]
        self.issuanceController.setOracle(self.contractOwner, newOracleAddress)
        oracleAddressToCheck = self.issuanceController.oracle()
        self.assertEqual(newOracleAddress, oracleAddressToCheck)

    def test_cannotSetOracleIfUnauthorised(self):
        newOracleAddress, notOwner = self.participantAddresses[0:2]
        originalOracleAddress = self.issuanceController.oracle()
        self.assertReverts(self.issuanceController.setOracle, notOwner, newOracleAddress)
        oracleAddressToCheck = self.issuanceController.oracle()
        self.assertEqual(oracleAddressToCheck, originalOracleAddress)

    def test_OracleEvent(self):
        newOracleAddress = self.participantAddresses[0]
        txr = self.issuanceController.setOracle(self.contractOwner, newOracleAddress)
        self.assertEventEquals(
            self.issuanceControllerEventDict, txr.logs[0], 'OracleUpdated',
            fields={'newOracle': newOracleAddress},
            location=self.issuanceControllerContract.address
        )

    # Funds Wallet setter and getter tests

    def test_getFundsWalletAddress(self):
        fundsWalletAddress = self.issuanceController.fundsWallet()
        self.assertEqual(fundsWalletAddress, self.fundsWallet)

    def test_setFundsWalletAddress(self):
        newFundsWalletAddress = self.participantAddresses[0]
        self.issuanceController.setFundsWallet(self.contractOwner, newFundsWalletAddress)
        fundsWalletAddressToCheck = self.issuanceController.fundsWallet()
        self.assertEqual(newFundsWalletAddress, fundsWalletAddressToCheck)

    def test_cannotSetFundsWalletUnauthorised(self):
        newFundsWalletAddress, notOwner = self.participantAddresses[0:2]
        originalFundsWalletAddress = self.issuanceController.fundsWallet()
        self.assertReverts(self.issuanceController.setFundsWallet, notOwner, newFundsWalletAddress)
        fundsWalletAddressToCheck = self.issuanceController.fundsWallet()
        self.assertEqual(fundsWalletAddressToCheck, originalFundsWalletAddress)

    def test_FundsWalletEvent(self):
        newFundsWalletAddress = self.participantAddresses[0]
        txr = self.issuanceController.setFundsWallet(self.contractOwner, newFundsWalletAddress)
        self.assertEventEquals(
            self.issuanceControllerEventDict, txr.logs[0], 'FundsWalletUpdated',
            fields={'newFundsWallet': newFundsWalletAddress},
            location=self.issuanceControllerContract.address
        )

    # Nomin contract address setter and getter tests

    def test_getNominAddress(self):
        nominAddress = self.issuanceController.nomin()
        self.assertEqual(nominAddress, self.nomin_contract.address)

    def test_setNominAddress(self):
        newNominAddress = self.participantAddresses[0]
        self.issuanceController.setNomin(self.contractOwner, newNominAddress)
        nominAddressToCheck = self.issuanceController.nomin()
        self.assertEqual(newNominAddress, nominAddressToCheck)

    def test_cannotSetNominIfUnauthorised(self):
        newNominAddress, notOwner = self.participantAddresses[0:2]
        originalNominAddress = self.issuanceController.nomin()
        self.assertReverts(self.issuanceController.setNomin, notOwner, newNominAddress)
        nominAddressToCheck = self.issuanceController.nomin()
        self.assertEqual(nominAddressToCheck, originalNominAddress)

    def test_NominUpdatedEvent(self):
        newNominAddress = self.participantAddresses[0]
        txr = self.issuanceController.setNomin(self.contractOwner, newNominAddress)
        self.assertEventEquals(
            self.issuanceControllerEventDict, txr.logs[0], 'NominUpdated',
            fields={'newNominContract': newNominAddress},
            location=self.issuanceControllerContract.address
    )

    # Havven contract address setter and getter tests

    def test_getHavvenAddress(self):
        havvenAddress = self.issuanceController.havven()
        self.assertEqual(havvenAddress, self.havven_contract.address)

    def test_setHavvenAddress(self):
        newHavvenAddress = self.participantAddresses[0]
        self.issuanceController.setHavven(self.contractOwner, newHavvenAddress)
        havvenAddressToCheck = self.issuanceController.havven()
        self.assertEqual(newHavvenAddress, havvenAddressToCheck)

    def test_cannotSetHavvenIfUnauthorised(self):
        newHavvenAddress, notOwner = self.participantAddresses[0:2]
        originalHavvenAddress = self.issuanceController.havven()
        self.assertReverts(self.issuanceController.setHavven, notOwner, newHavvenAddress)
        havvenAddressToCheck = self.issuanceController.havven()
        self.assertEqual(havvenAddressToCheck, originalHavvenAddress)

    def test_HavvenUpdatedEvent(self):
        newHavvenAddress = self.participantAddresses[0]
        txr = self.issuanceController.setHavven(self.contractOwner, newHavvenAddress)
        self.assertEventEquals(
            self.issuanceControllerEventDict, txr.logs[0], 'HavvenUpdated',
            fields={'newHavvenContract': newHavvenAddress},
            location=self.issuanceControllerContract.address
    )

    # Price stale period setter and getter tests

    def test_getPriceStalePeriod(self):
        priceStalePeriod = self.issuanceController.priceStalePeriod()
        self.assertEqual(priceStalePeriod, self.priceStalePeriod)

    def test_setPriceStalePeriod(self):
        newPriceStalePeriod = 400 * 60 * 60
        self.issuanceController.setPriceStalePeriod(self.contractOwner, newPriceStalePeriod)
        priceStalePeriodToCheck = self.issuanceController.priceStalePeriod()
        self.assertEqual(newPriceStalePeriod, priceStalePeriodToCheck)

    def test_cannotSetPriceStalePeriodIfUnauthorised(self):
        notOwner = self.participantAddresses[0]
        originalPriceStalePeriod = self.issuanceController.priceStalePeriod()
        newPriceStalePeriod = originalPriceStalePeriod + 100
        self.assertReverts(self.issuanceController.setPriceStalePeriod, notOwner, newPriceStalePeriod)
        priceStalePeriodToCheck = self.issuanceController.priceStalePeriod()
        self.assertEqual(originalPriceStalePeriod, priceStalePeriodToCheck)

    # Update prices (aka exchange rate) setter and getter tests

    def test_updatePrices(self):
        newEthPrice = self.usdToEthPrice + 100
        newHavPrice = self.usdToHavPrice + 100
        timeSent = block_time()
        self.issuanceController.updatePrices(self.oracleAddress, newEthPrice, newHavPrice, timeSent)
        self.assertEqual(self.issuanceController.usdToEthPrice(), newEthPrice)
        self.assertEqual(self.issuanceController.usdToHavPrice(), newHavPrice)
        self.assertEqual(self.issuanceController.lastPriceUpdateTime(), timeSent)

    def test_updatePricesTooEarly(self):
        timeSent = block_time() - 120
        self.assertReverts(self.issuanceController.updatePrices, self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)

    def test_updatePricesTooLate(self):
        ORACLE_FUTURE_LIMIT = 10 * 60
        timeSent = block_time() + ORACLE_FUTURE_LIMIT + 60
        self.assertReverts(self.issuanceController.updatePrices, self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)

    def test_cannotUpdatePricesIfOwner(self):
        self.assertReverts(self.issuanceController.updatePrices, self.contractOwner, self.usdToEthPrice, self.usdToHavPrice, block_time())

    def test_cannotUpdatePricesIfUnauthorised(self):
        randomUser = self.participantAddresses[0]
        self.assertReverts(self.issuanceController.updatePrices, randomUser, self.usdToEthPrice, self.usdToHavPrice, block_time())

    def test_updatePricesEvents(self):
        timeSent = block_time()
        txr = self.issuanceController.updatePrices(self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)
        self.assertEventEquals(
            self.issuanceControllerEventDict, txr.logs[0], 'PricesUpdated',
            fields={'newEthPrice': self.usdToEthPrice, 'newHavvenPrice': self.usdToHavPrice, 'timeSent': timeSent},
            location=self.issuanceControllerContract.address
        )

    # Exchange ETH for nUSD tests

    def test_cannotExchangeEtherForNominsIfPriceStale(self):
        amount = 10 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        base = self.nomin.amountReceived(nominsBalance)
        self.issuanceController.setPriceStalePeriod(self.contractOwner, 1)
        timeSent = block_time()
        self.issuanceController.updatePrices(self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        fast_forward(2) # Wait so the lastPriceUpdateTime is different to now

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Attempt transfer
        self.assertReverts(self.issuanceController.exchangeEtherForNomins, exchanger, amount)
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)
        self.assertEqual(self.nomin.feePool(), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_cannotExchangeEtherForNominsIfPaused(self):
        amount = 10 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        base = self.nomin.amountReceived(nominsBalance)
        self.issuanceController.setPaused(self.contractOwner, True)
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Attempt transfer
        self.assertReverts(self.issuanceController.exchangeEtherForNomins, exchanger, amount)
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)
        self.assertEqual(self.nomin.feePool(), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_exchangeEtherForSomeNomins(self):
        amount = 3 * UNIT
        ethToSend = 1 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        nominsToSend = (ethToSend * self.usdToEthPrice) // UNIT
        baseToSend = self.nomin.amountReceived(nominsToSend)
        feesToPayInNomins = nominsToSend - baseToSend
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForNomins(exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance - nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), baseToSend)
        self.assertEqual(self.nomin.feePool(), feesToPayInNomins)
        self.assertEqual(startingFundsWalletEthBalance + ethToSend, endingFundsWalletEthBalance)

    def test_exchangeEtherForAllNomins(self):
        amount = 10 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        base = self.nomin.amountReceived(nominsBalance)
        feesToPayInNomins = nominsBalance - base
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForNomins(exchanger, amount)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), 0)
        self.assertEqual(self.nomin.balanceOf(exchanger), base)
        self.assertEqual(self.nomin.feePool(), feesToPayInNomins)
        self.assertEqual(startingFundsWalletEthBalance + amount, endingFundsWalletEthBalance)

    def test_exchangeForZeroEth(self):
        amount = 3 * UNIT
        ethToSend = 0 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        nominsToSend = (ethToSend * self.usdToEthPrice) // UNIT
        baseToSend = 0
        feesToPayInNomins = 0
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForNomins(exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)
        self.assertEqual(self.nomin.feePool(), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_exchangeFailsNotEnoughNomins(self):
        amount = 10 * UNIT
        nominsBalance = (int(amount / 2) * self.usdToEthPrice) // UNIT
        base = self.nomin.amountReceived(nominsBalance)
        feesToPayInNomins = nominsBalance - base
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # Ensure the transfer fails due to there not being enough nomins in the contract
        self.assertReverts(self.issuanceController.exchangeEtherForNomins, exchanger, amount)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)
        self.assertEqual(self.nomin.feePool(), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_ensureRateOnEtherToNominsExchangeRevertsWithWrongRate(self): 
        exchanger = self.participantAddresses[0]

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, 10000 * UNIT)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), 10000 * UNIT)

        # Ensure the transfer fails due to an incorrect rate
        self.assertReverts(self.issuanceController.exchangeEtherForNominsAtRate, exchanger, 1 * UNIT, self.usdToEthPrice + 1)
    
    def test_ensureRateOnEtherToNominsExchangeSucceedsWithCorrectRate(self): 
        amount = 3 * UNIT
        ethToSend = 1 * UNIT
        nominsBalance = (amount * self.usdToEthPrice) // UNIT
        nominsToSend = (ethToSend * self.usdToEthPrice) // UNIT
        baseToSend = self.nomin.amountReceived(nominsToSend)
        feesToPayInNomins = nominsToSend - baseToSend
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, nominsBalance)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance)

        # The transfer should succeed with a correct rate
        txr = self.issuanceController.exchangeEtherForNominsAtRate(exchanger, ethToSend, self.usdToEthPrice)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsBalance - nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), baseToSend)
        self.assertEqual(self.nomin.feePool(), feesToPayInNomins)
        self.assertEqual(startingFundsWalletEthBalance + ethToSend, endingFundsWalletEthBalance)

    # Exchange ETH for HAV tests

    def test_cannotExchangeEtherForHavvensIfPriceStale(self):
        amount = 10 * UNIT
        havvenAmount = 10000 * UNIT
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        
        # Push a price update
        self.issuanceController.setPriceStalePeriod(self.contractOwner, 1)
        timeSent = block_time()
        self.issuanceController.updatePrices(self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)

        # Wait so the lastPriceUpdateTime is different to now
        fast_forward(2)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvenAmount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenAmount)

        # Attempt transfer
        self.assertReverts(self.issuanceController.exchangeEtherForHavvens, exchanger, amount)

        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenAmount)
        self.assertEqual(self.havven.balanceOf(exchanger), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_cannotExchangeEtherForHavvensIfPaused(self):
        amount = 10 * UNIT
        havvenAmount = 10000 * UNIT
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        
        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvenAmount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenAmount)

        # Pause the contract
        self.issuanceController.setPaused(self.contractOwner, True)

        # Attempt transfer
        self.assertReverts(self.issuanceController.exchangeEtherForHavvens, exchanger, amount)

        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenAmount)
        self.assertEqual(self.havven.balanceOf(exchanger), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_exchangeEtherForSomeHavvens(self):
        havvenBalance = 100000 * UNIT
        ethToSend = 1 * UNIT
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        havvensReceived = self.issuanceController.havvensReceivedForEther(ethToSend)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvenBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenBalance)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForHavvens(exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenBalance - havvensReceived)
        self.assertEqual(self.havven.balanceOf(exchanger), havvensReceived)
        self.assertEqual(startingFundsWalletEthBalance + ethToSend, endingFundsWalletEthBalance)

    def test_exchangeEtherForAllHavvens(self):
        ethToSend = 1 * UNIT
        exchanger = self.participantAddresses[0]
        havvensReceived = self.issuanceController.havvensReceivedForEther(ethToSend)
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensReceived)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensReceived)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForHavvens(exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 0)
        self.assertEqual(self.havven.balanceOf(exchanger), havvensReceived)
        self.assertEqual(startingFundsWalletEthBalance + ethToSend, endingFundsWalletEthBalance)

    def test_exchangeHavvensForZeroEth(self):
        ethToSend = 0
        exchanger = self.participantAddresses[0]
        havvensBalance = 100000 * UNIT
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)

        # Transfer the amount to the receiver
        txr = self.issuanceController.exchangeEtherForHavvens(exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)
        self.assertEqual(self.havven.balanceOf(exchanger), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_exchangeEtherFailsNotEnoughHavvens(self):
        havvensBalance = 1 * UNIT
        ethToSend = 1 * UNIT
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)

        # Ensure the transfer fails due to there not being enough havvens in the contract
        self.assertReverts(self.issuanceController.exchangeEtherForHavvens, exchanger, ethToSend)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)
        self.assertEqual(self.havven.balanceOf(exchanger), 0)
        self.assertEqual(startingFundsWalletEthBalance, endingFundsWalletEthBalance)

    def test_ensureRateOnEtherToHavvensExchangeRevertsWithWrongRate(self): 
        exchanger = self.participantAddresses[0]
        havvenBalance = 10000 * UNIT

        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvenBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvenBalance)

        # Ensure the transfer fails due to an incorrect rate(s)
        self.assertReverts(self.issuanceController.exchangeEtherForHavvensAtRate, exchanger, 1 * UNIT, self.usdToEthPrice + 1, self.usdToHavPrice)
        self.assertReverts(self.issuanceController.exchangeEtherForHavvensAtRate, exchanger, 1 * UNIT, self.usdToEthPrice, self.usdToHavPrice + 1)
        self.assertReverts(self.issuanceController.exchangeEtherForHavvensAtRate, exchanger, 1 * UNIT, self.usdToEthPrice - 1, self.usdToHavPrice + 1)
        self.assertReverts(self.issuanceController.exchangeEtherForHavvensAtRate, exchanger, 1 * UNIT, self.usdToEthPrice - 1, self.usdToHavPrice)
    
    def test_ensureRateOnEtherToHavvensExchangeSucceedsWithCorrectRate(self): 
        ethToSend = 1 * UNIT
        havvensBalance = 10000 * UNIT
        havvensReceived = self.issuanceController.havvensReceivedForEther(ethToSend)
        exchanger = self.participantAddresses[0]
        startingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)

        # Set up the contract so it contains some havvens for folks to convert Ether for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)

        # The transfer should succeed with a correct rate
        txr = self.issuanceController.exchangeEtherForHavvensAtRate(exchanger, ethToSend, self.usdToEthPrice, self.usdToHavPrice)

        # Ensure the result of the transfer is correct.
        endingFundsWalletEthBalance = get_eth_balance(self.fundsWallet)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance - havvensReceived)
        self.assertEqual(self.havven.balanceOf(exchanger), havvensReceived)
        self.assertEqual(startingFundsWalletEthBalance + ethToSend, endingFundsWalletEthBalance)

    # Exchange nUSD for HAV tests

    def test_cannotExchangeNominsForHavvensIfPriceStale(self):
        exchanger = self.participantAddresses[0]
        nominsToTransfer = 20 * UNIT
        self.issuanceController.setPriceStalePeriod(self.contractOwner, 1)
        
        # Set up the contract so it contains some nomins and havvens
        self.nomin.giveNomins(MASTER, exchanger, nominsToTransfer)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToTransfer)
        self.havven.endow(MASTER, self.issuanceControllerContract.address, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)

        timeSent = block_time()
        self.issuanceController.updatePrices(self.oracleAddress, self.usdToEthPrice, self.usdToHavPrice, timeSent)
        fast_forward(2)

        # Attempt transfer
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToTransfer)
        self.assertReverts(self.issuanceController.exchangeNominsForHavvens, exchanger, nominsToTransfer)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToTransfer)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)

    def test_cannotExchangeNominsForHavvensIfPaused(self):
        exchanger = self.participantAddresses[0]
        nominsToTransfer = 20 * UNIT

        # Set up the contract so it contains some nomins and havvens
        self.nomin.giveNomins(MASTER, exchanger, nominsToTransfer)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToTransfer)
        self.havven.endow(MASTER, self.issuanceControllerContract.address, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)

        # Pause the contract
        self.issuanceController.setPaused(self.contractOwner, True)

        # Attempt transfer
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToTransfer)
        self.assertReverts(self.issuanceController.exchangeNominsForHavvens, exchanger, nominsToTransfer)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToTransfer)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)

    def test_exchangeNominsForSomeHavvens(self):
        exchanger = self.participantAddresses[0]
        nominsToSend = 5 * UNIT
        nominsReceived = self.nomin.amountReceived(nominsToSend)
        havBalance = nominsReceived * UNIT // self.usdToHavPrice

        # Set up the contract so it contains some nomins and havvens
        self.nomin.giveNomins(MASTER, exchanger, nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend)
        self.havven.endow(MASTER, self.issuanceControllerContract.address, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)

        # Attempt transfer
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToSend)
        self.issuanceController.exchangeNominsForHavvens(exchanger, nominsToSend)

        # Ensure the result of the transfer is correct.
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), nominsReceived)
        self.assertEqual(self.nomin.feePool(), nominsToSend - nominsReceived)
        self.assertEqual(self.havven.balanceOf(exchanger), havBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT - havBalance)

    def test_exchangeNominsForAllHavvens(self):
        nominsToSend = 7 * UNIT
        nominsAfterFees = self.nomin.amountReceived(nominsToSend)
        havvensBalance = 1000 * UNIT
        feesToPayInNomins = nominsToSend - nominsAfterFees
        exchanger = self.participantAddresses[0]
        havvensReceived = self.issuanceController.havvensReceivedForNomins(nominsToSend)

        # Set up exchanger with some nomins
        self.nomin.giveNomins(MASTER, exchanger, nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend)

        # Set up the contract so it contains some havvens for folks to convert Nomins for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)

        # Allow the contract to work on the exchanger's behalf
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToSend)

        # Transfer the amount to the receiver
        self.issuanceController.exchangeNominsForHavvens(exchanger, nominsToSend)

        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance - havvensReceived)
        self.assertEqual(self.havven.balanceOf(exchanger), havvensReceived)
        self.assertEqual(self.nomin.balanceOf(exchanger), 0)

    def test_exchangeFailsNotEnoughHavvens(self):
        nominsToSend = 7000000 * UNIT
        nominsAfterFees = self.nomin.amountReceived(nominsToSend)
        havvensBalance = 1000 * UNIT
        feesToPayInNomins = nominsToSend - nominsAfterFees
        exchanger = self.participantAddresses[0]
        havvensReceived = self.issuanceController.havvensReceivedForNomins(nominsToSend)

        # Set up exchanger with some nomins
        self.nomin.giveNomins(MASTER, exchanger, nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend)

        # Set up the contract so it contains some havvens for folks to convert Nomins for
        self.havven.endow(MASTER, self.issuanceControllerContract.address, havvensBalance)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), havvensBalance)

        # Allow the contract to work on the exchanger's behalf
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToSend)

        # We can't execute the transfer because there aren't sufficient havvens.
        self.assertReverts(self.issuanceController.exchangeNominsForHavvens, exchanger, nominsToSend)

        # Ensure the amount of nomins hasn't moved from the sender.
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend) 

        # And that we didn't receive havvens
        self.assertEqual(self.havven.balanceOf(exchanger), 0)

    def test_ensureRateOnNominToHavvenExchangeRevertsWithWrongRate(self):
        exchanger = self.participantAddresses[0]
        nominsToSend = 5 * UNIT

        # Set up the contract so it contains some nomins and havvens
        self.nomin.giveNomins(MASTER, exchanger, nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend)
        self.havven.endow(MASTER, self.issuanceControllerContract.address, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)
 
        # Ensure the transfer fails due to an incorrect rate
        self.assertReverts(self.issuanceController.exchangeNominsForHavvensAtRate, exchanger, nominsToSend, self.usdToHavPrice + 1)
    
    def test_ensureRateOnNominsToHavvensExchangeSucceedsWithCorrectRate(self): 
        exchanger = self.participantAddresses[0]
        nominsToSend = 5 * UNIT

        # Set up the contract so it contains some nomins and havvens
        self.nomin.giveNomins(MASTER, exchanger, nominsToSend)
        self.assertEqual(self.nomin.balanceOf(exchanger), nominsToSend)
        self.havven.endow(MASTER, self.issuanceControllerContract.address, 1000 * UNIT)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 1000 * UNIT)
 
        # The transfer should succeed with a correct rate
        self.nomin.approve(exchanger, self.issuanceControllerContract.address, nominsToSend)
        txr = self.issuanceController.exchangeNominsForHavvensAtRate(exchanger, nominsToSend, self.usdToHavPrice)
        # Not going to bother to verify the transaction outputs because other tests cover those.

    # Exchange rate tests

    def test_havvenExchangeRate(self):
        havvenPrice = int(0.5 * UNIT) # 50 cent havvens
        self.issuanceController.updatePrices(self.oracleAddress, 0, havvenPrice, block_time())

        nominsToSend = 10 * UNIT
        nominsAfterFees = self.nomin.amountReceived(nominsToSend)
        havvensReceived = self.issuanceController.havvensReceivedForNomins(nominsToSend)

        self.assertEqual(havvensReceived, nominsAfterFees * UNIT // havvenPrice)

    def test_nominExchangeRate(self):
        ethPrice = 500 * UNIT # $500 ETH
        self.issuanceController.updatePrices(self.oracleAddress, ethPrice, 0, block_time())

        ethToSend = UNIT
        nominsSent = ethToSend * ethPrice // UNIT
        nominsReceived = self.nomin.amountReceived(nominsSent)

        self.assertEqual(self.issuanceController.nominsReceivedForEther(ethToSend), nominsReceived)

    # Withdraw havvens tests

    def test_withdrawHavvens(self):
        amount = 10 * UNIT

        # Set up the contract so it contains some havvens
        self.havven.endow(MASTER, self.issuanceControllerContract.address, amount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), amount)

        # Withdraw the Havvens and ensure we've received the endowment.
        self.issuanceController.withdrawHavvens(self.contractOwner, amount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), 0)
        self.assertEqual(self.havven.balanceOf(self.contractOwner), amount)

    def test_cannotWithdrawHavvensIfUnauthorised(self):
        amount = 10 * UNIT

        # Set up the contract so it contains some havvens
        self.havven.endow(MASTER, self.issuanceControllerContract.address, amount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), amount)

        notOwner = self.participantAddresses[2]
        self.assertReverts(self.issuanceController.withdrawHavvens, notOwner, amount)
        self.assertEqual(self.havven.balanceOf(self.issuanceControllerContract.address), amount)

    # Withdraw nomins tests

    def test_withdrawNomins(self):
        amount = 10 * UNIT
        amountReceived = self.nomin.amountReceived(amount)

        # Set up the contract so it contains some nomins
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, amount)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), amount)

        # Withdraw the nomins and ensure we've received the endowment.
        self.issuanceController.withdrawNomins(self.contractOwner, amount)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), 0)
        self.assertEqual(self.nomin.balanceOf(self.contractOwner), amountReceived)

    def test_cannotWithdrawNominsIfUnauthorised(self):
        amount = 10 * UNIT

        # Set up the contract so it contains some nomins 
        self.nomin.giveNomins(MASTER, self.issuanceControllerContract.address, amount)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), amount)

        notOwner = self.participantAddresses[2]
        self.assertReverts(self.issuanceController.withdrawNomins, notOwner, amount)
        self.assertEqual(self.nomin.balanceOf(self.issuanceControllerContract.address), amount)

from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    mine_tx, attempt_deploy, mine_txs,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS, block_time
)
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_interface import HavvenInterface
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
            "contracts/Havven.sol",
            "tests/contracts/PublicNomin.sol",
            "contracts/IssuanceController.sol",
            "tests/contracts/PublicHavven.sol"
        ]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)
        nomin_abi = compiled['PublicNomin']['abi']
        havven_abi = compiled['Havven']['abi']
        issuance_controller_abi = compiled['IssuanceController']['abi']

        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=havven_abi)
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=nomin_abi)

        havven_contract, hvn_txr = attempt_deploy(
            compiled, 'PublicHavven', MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER, UNIT//2]
        )
        nomin_contract, nom_txr = attempt_deploy(
            compiled, 'PublicNomin', MASTER, [nomin_proxy.address, havven_contract.address, MASTER]
        )

        mine_txs([
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
        cls.usdToEthPrice = 100 * (10 ** 18)
        cls.usdToHavPrice = int(0.65 * (10 ** 18))
        cls.priceStalePeriod = 3 * 60 * 60
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.havven_contract, cls.nomin_contract, cls.nomin_abi, cls.issuanceControllerContract = cls.deployContracts()
        cls.issuanceController = IssuanceControllerInterface(cls.issuanceControllerContract, "IssuanceController")
        cls.nomin = PublicNominInterface(cls.nomin_contract, "Nomin")
        cls.issuanceControllerEventDict = cls.event_maps['IssuanceController']

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

    def test_exchangeForNomins(self):
        # Set up the contract so it contains some nomins for folks to convert Ether for
        self.nomin.giveNomins(self.contractOwner, self.issuanceControllerContract.address, 5000 * UNIT)

        # Set up an exchanger so they have 1 ETH to exchange with
        someExchanger = self.participantAddresses[0]
        amountOfEthToExchange = int(1 * UNIT)
        someExchangersBeforeBalance = self.nomin.balanceOf(someExchanger)
        startingNominsInContract = self.nomin.balanceOf(self.issuanceControllerContract.address)

        # The exchange parameters
        nominsToBeWithdrawnFromContract = int(amountOfEthToExchange * self.usdToEthPrice / UNIT)
        nominsReceived = self.nomin.priceToSpend(nominsToBeWithdrawnFromContract)
        feesToPayInNomins = nominsToBeWithdrawnFromContract - nominsReceived 
        
        # Do the exchange
        txr = self.issuanceController.exchangeForNomins(someExchanger, amountOfEthToExchange)

        # Ensure we have the right amount left in the contract
        endingNominsInContract = self.nomin.balanceOf(self.issuanceControllerContract.address)
        self.assertEqual(startingNominsInContract, endingNominsInContract + nominsToBeWithdrawnFromContract)

        # Ensure the exchanger received the amount - fee
        someExchangersAfterBalance = self.nomin.balanceOf(someExchanger)
        self.assertEqual(someExchangersBeforeBalance + nominsToBeWithdrawnFromContract - feesToPayInNomins, someExchangersAfterBalance)

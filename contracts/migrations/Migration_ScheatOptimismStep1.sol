pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../PerpsV2MarketState.sol";
import "../PerpsV2ExchangeRate.sol";
import "../FuturesMarketManager.sol";
import "../PerpsV2MarketSettings.sol";
import "../SystemStatus.sol";
import "../ExchangeRates.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_ScheatOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xC2231D2cAdDBee015AeDddd3F0EE3874E3bd1d59
    PerpsV2MarketState public constant perpsv2marketstateusdtperp_i =
        PerpsV2MarketState(0xC2231D2cAdDBee015AeDddd3F0EE3874E3bd1d59);
    // https://explorer.optimism.io/address/0x2C15259D4886e2C0946f9aB7a5E389c86b3c3b04
    PerpsV2ExchangeRate public constant perpsv2exchangerate_i =
        PerpsV2ExchangeRate(0x2C15259D4886e2C0946f9aB7a5E389c86b3c3b04);
    // https://explorer.optimism.io/address/0xd30bdFd7e7a65fE109D5dE1D4e95F3B800FB7463
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xd30bdFd7e7a65fE109D5dE1D4e95F3B800FB7463);
    // https://explorer.optimism.io/address/0x649F44CAC3276557D03223Dbf6395Af65b11c11c
    PerpsV2MarketSettings public constant perpsv2marketsettings_i =
        PerpsV2MarketSettings(0x649F44CAC3276557D03223Dbf6395Af65b11c11c);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0] = address(perpsv2marketstateusdtperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Add migration contract permission to pause
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstateusdtperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sUSDTPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sUSDTPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sUSDTPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sUSDTPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sUSDTPERP", 150000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sUSDTPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sUSDTPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sUSDTPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sUSDTPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sUSDTPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sUSDTPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sUSDTPERP", 55000000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sUSDTPERP", 5000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sUSDTPERP", 3000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sUSDTPERP", 10000000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sUSDTPERP", "ocUSDTPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sUSDTPERP", 25000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sUSDTPERP", 1000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sUSDTPERP", 300000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sUSDTPERP", 7500000000000000);
        perpsv2marketsettings_i.setMaxPD("sUSDTPERP", 150000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sUSDTPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocUSDTPERP", 80);
        // Remove permission to migration contract
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for USDT;
        exchangerates_i.addAggregator("USDT", 0xECef79E109e997bCA29c1c0897ec9d7b03647F5E);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for USDT;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "USDT",
            0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b
        );

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        nominateAll();
    }

    function acceptAll() internal {
        address[] memory contracts = contractsRequiringOwnership();
        for (uint i = 0; i < contracts.length; i++) {
            Owned(contracts[i]).acceptOwnership();
        }
    }

    function nominateAll() internal {
        address[] memory contracts = contractsRequiringOwnership();
        for (uint i = 0; i < contracts.length; i++) {
            returnOwnership(contracts[i]);
        }
    }

    function perpsv2exchangerate_addAssociatedContracts_1() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[0] = address(
            0xD53C50B644aa4E29fe2B633E97187e2Aa3cBd6fc
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x244c689BFa19F046124e75339887f9918317b919
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x1681212A0Edaf314496B489AB57cB3a5aD7a833f);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }
}

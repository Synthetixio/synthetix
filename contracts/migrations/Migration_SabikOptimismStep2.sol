pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../PerpsV2MarketState.sol";
import "../PerpsV2ExchangeRate.sol";
import "../FuturesMarketManager.sol";
import "../PerpsV2MarketSettings.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_SabikOptimismStep2 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xEdB8F5e51e5B11E73beA72600aa2De7a4A2eAFa4
    PerpsV2MarketState public constant perpsv2marketstateoneperp_i =
        PerpsV2MarketState(0xEdB8F5e51e5B11E73beA72600aa2De7a4A2eAFa4);
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
    // https://explorer.optimism.io/address/0x6941ad5Ac604d2329f96bEA75C7b25D19Cc06701
    PerpsV2MarketState public constant perpsv2marketstateperpperp_i =
        PerpsV2MarketState(0x6941ad5Ac604d2329f96bEA75C7b25D19Cc06701);
    // https://explorer.optimism.io/address/0x5aCd4ABF5DDfb7F27B5940D1Aef640d6b67a2Cba
    PerpsV2MarketState public constant perpsv2marketstatezilperp_i =
        PerpsV2MarketState(0x5aCd4ABF5DDfb7F27B5940D1Aef640d6b67a2Cba);
    // https://explorer.optimism.io/address/0x2CC4707f6aeF86cDBA05F45Da98D365a66DFD5d7
    PerpsV2MarketState public constant perpsv2marketstateruneperp_i =
        PerpsV2MarketState(0x2CC4707f6aeF86cDBA05F45Da98D365a66DFD5d7);
    // https://explorer.optimism.io/address/0x854A3500F1443ba99F746CA605d8FC25F0d06f32
    PerpsV2MarketState public constant perpsv2marketstatesushiperp_i =
        PerpsV2MarketState(0x854A3500F1443ba99F746CA605d8FC25F0d06f32);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstateoneperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstateperpperp_i);
        contracts[6] = address(perpsv2marketstatezilperp_i);
        contracts[7] = address(perpsv2marketstateruneperp_i);
        contracts[8] = address(perpsv2marketstatesushiperp_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Add migration contract permission to pause
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstateoneperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sONEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sONEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sONEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sONEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sONEPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sONEPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sONEPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sONEPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sONEPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sONEPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sONEPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sONEPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sONEPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sONEPERP", 20000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sONEPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sONEPERP", 750000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sONEPERP", "ocONEPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sONEPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sONEPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sONEPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sONEPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sONEPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sONEPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocONEPERP", 80);
        perpsv2marketstateperpperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sPERPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sPERPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sPERPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sPERPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sPERPPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sPERPPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sPERPPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sPERPPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sPERPPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sPERPPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sPERPPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sPERPPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sPERPPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sPERPPERP", 300000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sPERPPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sPERPPERP", 10000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sPERPPERP", "ocPERPPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sPERPPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sPERPPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sPERPPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sPERPPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sPERPPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sPERPPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocPERPPERP", 80);
        perpsv2marketstatezilperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sZILPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sZILPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sZILPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sZILPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sZILPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sZILPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sZILPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sZILPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sZILPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sZILPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sZILPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sZILPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sZILPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sZILPERP", 25000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sZILPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sZILPERP", 950000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sZILPERP", "ocZILPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sZILPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sZILPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sZILPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sZILPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sZILPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sZILPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocZILPERP", 80);
        perpsv2marketstateruneperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sRUNEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sRUNEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sRUNEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sRUNEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sRUNEPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sRUNEPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sRUNEPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sRUNEPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sRUNEPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sRUNEPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sRUNEPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sRUNEPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sRUNEPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sRUNEPERP", 400000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sRUNEPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sRUNEPERP", 34000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sRUNEPERP", "ocRUNEPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sRUNEPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sRUNEPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sRUNEPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sRUNEPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sRUNEPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sRUNEPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocRUNEPERP", 80);
        perpsv2marketstatesushiperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_109();
        futuresmarketmanager_addProxiedMarkets_110();
        perpsv2marketsettings_i.setTakerFee("sSUSHIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sSUSHIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sSUSHIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sSUSHIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sSUSHIPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sSUSHIPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sSUSHIPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sSUSHIPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sSUSHIPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sSUSHIPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sSUSHIPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sSUSHIPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sSUSHIPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sSUSHIPERP", 500000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sSUSHIPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sSUSHIPERP", 21000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sSUSHIPERP", "ocSUSHIPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sSUSHIPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sSUSHIPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sSUSHIPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sSUSHIPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sSUSHIPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sSUSHIPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocSUSHIPERP", 80);
        // Remove permission to migration contract
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);

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
            0x66f916cc0B0b26C1783974A60Cef9B0AfC382825
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0xBe0f35e3d0ffe514969333B4d07A279D3d66A494
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x86BbB4E38Ffa64F263E84A0820138c5d938BA86E);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x5E51817910c53A01e7Ee90B8640a66768075bf2E
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0x692c746f443031559E9816b50c99165fd452982d
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0xaF2E4c337B038eaFA1dE23b44C163D0008e49EaD);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0x0e1A5c48f3Ae7c629155aFAbbBcd5442627c7EF6
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x89698dc9ECD95337AD64FDa7dF773dA5007926A8
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x01a43786C2279dC417e7901d45B917afa51ceb9a);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0xDaf440cDeA843762c6D4ECFA7C2f64AED832319e
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0xB4D55aE3a6B3B73633F622Ef89e94E4bAD05c08F
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0xEAf0191bCa9DD417202cEf2B18B7515ABff1E196);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_109() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[0] = address(
            0xd01a18C2eDB9f411A8329eF9B2905F3Cf7D35408
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[1] = address(
            0xdB87f699ae4045c290033240f22C0CBe80d95724
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0);
    }

    function futuresmarketmanager_addProxiedMarkets_110() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0[0] = address(0xdcCDa0cFBEE25B33Ff4Ccca64467E89512511bf6);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0);
    }
}

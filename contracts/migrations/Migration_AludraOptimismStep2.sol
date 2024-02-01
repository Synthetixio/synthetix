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
contract Migration_AludraOptimismStep2 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x6CA6Ae2fFE05b78545482111Ad74B6676F79C4e1
    PerpsV2MarketState public constant perpsv2marketstatefetperp_i =
        PerpsV2MarketState(0x6CA6Ae2fFE05b78545482111Ad74B6676F79C4e1);
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
    // https://explorer.optimism.io/address/0x70C512B97b06985f522F9C602CB14246ACfe2F5A
    PerpsV2MarketState public constant perpsv2marketstategrtperp_i =
        PerpsV2MarketState(0x70C512B97b06985f522F9C602CB14246ACfe2F5A);
    // https://explorer.optimism.io/address/0xD326CFAb7af228aE6e97d879E9E6A3E7faA8D328
    PerpsV2MarketState public constant perpsv2marketstatepythperp_i =
        PerpsV2MarketState(0xD326CFAb7af228aE6e97d879E9E6A3E7faA8D328);
    // https://explorer.optimism.io/address/0xF5b5176933e18C4e3F603F2646f07BB262245Be8
    PerpsV2MarketState public constant perpsv2marketstateankrperp_i =
        PerpsV2MarketState(0xF5b5176933e18C4e3F603F2646f07BB262245Be8);
    // https://explorer.optimism.io/address/0xc27e06964A83eBb5917EAB0e8607f0B1492e755C
    PerpsV2MarketState public constant perpsv2marketstatebonkperp_i =
        PerpsV2MarketState(0xc27e06964A83eBb5917EAB0e8607f0B1492e755C);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatefetperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstategrtperp_i);
        contracts[6] = address(perpsv2marketstatepythperp_i);
        contracts[7] = address(perpsv2marketstateankrperp_i);
        contracts[8] = address(perpsv2marketstatebonkperp_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, true);

        perpsv2marketstatefetperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sFETPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sFETPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sFETPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sFETPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sFETPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sFETPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sFETPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sFETPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sFETPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sFETPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sFETPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sFETPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sFETPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sFETPERP", 900000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sFETPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sFETPERP", 17000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sFETPERP", "ocFETPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sFETPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sFETPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sFETPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sFETPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sFETPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sFETPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocFETPERP", 80);
        perpsv2marketstategrtperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sGRTPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sGRTPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sGRTPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sGRTPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sGRTPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sGRTPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sGRTPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sGRTPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sGRTPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sGRTPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sGRTPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sGRTPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sGRTPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sGRTPERP", 3300000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sGRTPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sGRTPERP", 75000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sGRTPERP", "ocGRTPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sGRTPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sGRTPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sGRTPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sGRTPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sGRTPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sGRTPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocGRTPERP", 80);
        perpsv2marketstatepythperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sPYTHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sPYTHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sPYTHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sPYTHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sPYTHPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sPYTHPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sPYTHPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sPYTHPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sPYTHPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sPYTHPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sPYTHPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sPYTHPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sPYTHPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sPYTHPERP", 955000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sPYTHPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sPYTHPERP", 16500000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sPYTHPERP", "ocPYTHPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sPYTHPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sPYTHPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sPYTHPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sPYTHPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sPYTHPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sPYTHPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocPYTHPERP", 80);
        perpsv2marketstateankrperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sANKRPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sANKRPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sANKRPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sANKRPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sANKRPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sANKRPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sANKRPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sANKRPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sANKRPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sANKRPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sANKRPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sANKRPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sANKRPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sANKRPERP", 12000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sANKRPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sANKRPERP", 250000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sANKRPERP", "ocANKRPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sANKRPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sANKRPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sANKRPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sANKRPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sANKRPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sANKRPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocANKRPERP", 80);
        perpsv2marketstatebonkperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_109();
        futuresmarketmanager_addProxiedMarkets_110();
        perpsv2marketsettings_i.setTakerFee("sBONKPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sBONKPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sBONKPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sBONKPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sBONKPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sBONKPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sBONKPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sBONKPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sBONKPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sBONKPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sBONKPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sBONKPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sBONKPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sBONKPERP", 61000000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sBONKPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sBONKPERP", 760000000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sBONKPERP", "ocBONKPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sBONKPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sBONKPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sBONKPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sBONKPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sBONKPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sBONKPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocBONKPERP", 80);
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
            0xc3A4c26DFF46Da40C508BAa09C94f222fF5452eb
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x0f98F15020CBeaa572E86E05e4717E504b6A4fA5
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x4272b356e7E406Eeef15E47692f7f4dE86370634);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0xB9020cE5086feC8e9cEfe86b23C2d31Ee5f6f678
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0x6cE41F0c16BD789CD4b97ff75fBFB510a6c211e5
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0x3f957DF3AB99ff502eE09071dd353bf4352BBEfE);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0xF854e2472E56fe064f726baE7352F1Ed486c6684
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x41c49bBc181211b289D2a29318f485fAc2692489
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x296286ae0b5c066CBcFe46cc4Ffb375bCCAFE640);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0x977264557C22491947c88c72eb91Bf297d1bB44f
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0x93465C5a94361A8bc7313e9a443bf76d54e09Ce9
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0x90c9B9D7399323FfFe63819788EeD7Cde1e6A78C);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_109() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[0] = address(
            0x31d83b7A96B298111352A5a8D9cD396ED9eCC4c9
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[1] = address(
            0x1496d992e66a1843fE91659689C697844aC8712d
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0);
    }

    function futuresmarketmanager_addProxiedMarkets_110() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0[0] = address(0xB3422e49dB926f7C5F5d7DaF5F1069Abf1b7E894);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0);
    }
}

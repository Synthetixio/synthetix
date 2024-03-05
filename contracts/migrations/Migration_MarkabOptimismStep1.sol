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
contract Migration_MarkabOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x5060490e390dc3D4590BD732550B3cf042d41334
    PerpsV2MarketState public constant perpsv2marketstatejupperp_i =
        PerpsV2MarketState(0x5060490e390dc3D4590BD732550B3cf042d41334);
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
    // https://explorer.optimism.io/address/0xb76ab289C1C81498A17382CA40E799DA494f7EB7
    PerpsV2MarketState public constant perpsv2marketstatecvxperp_i =
        PerpsV2MarketState(0xb76ab289C1C81498A17382CA40E799DA494f7EB7);
    // https://explorer.optimism.io/address/0x73f056Ca71F4f4f5eA6375dD710D62247873001b
    PerpsV2MarketState public constant perpsv2marketstatestrkperp_i =
        PerpsV2MarketState(0x73f056Ca71F4f4f5eA6375dD710D62247873001b);
    // https://explorer.optimism.io/address/0xe9Eb0074F3c7e4Fc5c8F717fB565649749EeFc4a
    PerpsV2MarketState public constant perpsv2marketstatependleperp_i =
        PerpsV2MarketState(0xe9Eb0074F3c7e4Fc5c8F717fB565649749EeFc4a);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatejupperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstatecvxperp_i);
        contracts[6] = address(perpsv2marketstatestrkperp_i);
        contracts[7] = address(perpsv2marketstatependleperp_i);
        contracts[8] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatejupperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sJUPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sJUPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sJUPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sJUPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sJUPPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sJUPPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sJUPPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sJUPPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sJUPPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sJUPPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sJUPPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sJUPPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sJUPPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sJUPPERP", 2000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sJUPPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sJUPPERP", 22500000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sJUPPERP", "ocJUPPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sJUPPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sJUPPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sJUPPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sJUPPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sJUPPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sJUPPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocJUPPERP", 80);
        perpsv2marketstatecvxperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sCVXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sCVXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sCVXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sCVXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sCVXPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sCVXPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sCVXPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sCVXPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sCVXPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sCVXPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sCVXPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sCVXPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sCVXPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sCVXPERP", 40000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sCVXPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sCVXPERP", 750000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sCVXPERP", "ocCVXPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sCVXPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sCVXPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sCVXPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sCVXPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sCVXPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sCVXPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocCVXPERP", 80);
        perpsv2marketstatestrkperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sSTRKPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sSTRKPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sSTRKPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sSTRKPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sSTRKPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sSTRKPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sSTRKPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sSTRKPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sSTRKPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sSTRKPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sSTRKPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sSTRKPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sSTRKPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sSTRKPERP", 500000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sSTRKPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sSTRKPERP", 5400000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sSTRKPERP", "ocSTRKPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sSTRKPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sSTRKPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sSTRKPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sSTRKPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sSTRKPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sSTRKPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocSTRKPERP", 80);
        perpsv2marketstatependleperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sPENDLEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sPENDLEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sPENDLEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sPENDLEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sPENDLEPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sPENDLEPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sPENDLEPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sPENDLEPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sPENDLEPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sPENDLEPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sPENDLEPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sPENDLEPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sPENDLEPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sPENDLEPERP", 250000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sPENDLEPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sPENDLEPERP", 2500000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sPENDLEPERP", "ocPENDLEPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sPENDLEPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sPENDLEPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sPENDLEPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sPENDLEPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sPENDLEPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sPENDLEPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocPENDLEPERP", 80);
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for CVX;
        exchangerates_i.addAggregator("CVX", 0x955b05dD4573dDFAfB47cb78db16B1Fa127E6e71);
        // Ensure the ExchangeRates contract has the standalone feed for JUP;
        exchangerates_i.addAggregator("JUP", 0x5eb9F7baCd59C886fBD9aa2C0a891223482a1ed4);
        // Ensure the ExchangeRates contract has the standalone feed for PENDLE;
        exchangerates_i.addAggregator("PENDLE", 0x58F23F80bF389DB1af9e3aA8c59679806749A8a4);
        // Ensure the ExchangeRates contract has the standalone feed for STRK;
        exchangerates_i.addAggregator("STRK", 0x8814dEC83E2862A3792A0D6aDFC48CF76Add1890);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for CVX;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "CVX",
            0x6aac625e125ada0d2a6b98316493256ca733a5808cd34ccef79b0e28c64d1e76
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for JUP;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "JUP",
            0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for PENDLE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "PENDLE",
            0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for STRK;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "STRK",
            0x6a182399ff70ccf3e06024898942028204125a819e519a335ffa4579e66cd870
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
            0x3756909c4240aD5b442eC3d138e2cE42F27eC605
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0xa3D7AeCf60B33eB7582E6cC38bFb60926E7D2131
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0xf9AE92bc49A5DD96AE5840eaAE75218016811c99);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0xc23BAbF6Ff26b9EBD36Bb28da9eeA3F42534Aa79
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0x400813263d6300347423E02fc8402735340aaE72
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0x2F0Fe4B621E7e54110446cE2df699004c6194636);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0x3b17232cBcEcb5DE01bb92Aee2fC35e507F0aBbb
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0xdA9303CE53a1800b0F077C1A9a1A253Ee8A64457
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x2F0F0865dFDD52AdefB583Ae824dDE7D60b76a3B);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0xaEE950b1704c3eeeF954FA326AF42A4A9d083Cc2
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0x83C71b63c14900026f30af0a39C0e1CaB30f4A2f
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0xd4e9e0784C3cE4796f54F2EA0D337c7CFcCFD645);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }
}

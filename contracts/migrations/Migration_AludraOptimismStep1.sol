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
contract Migration_AludraOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x4B786a8b4b7ca90f9857776b0B888cED53CFeeF0
    PerpsV2MarketState public constant perpsv2marketstatetrbperp_i =
        PerpsV2MarketState(0x4B786a8b4b7ca90f9857776b0B888cED53CFeeF0);
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
    // https://explorer.optimism.io/address/0x75D9ABD9B5e9724345570cFa587BA791c6B012a3
    PerpsV2MarketState public constant perpsv2marketstatetiaperp_i =
        PerpsV2MarketState(0x75D9ABD9B5e9724345570cFa587BA791c6B012a3);
    // https://explorer.optimism.io/address/0x4AfD66f7379449a73C4848B30DBeb93016346FBE
    PerpsV2MarketState public constant perpsv2marketstateimxperp_i =
        PerpsV2MarketState(0x4AfD66f7379449a73C4848B30DBeb93016346FBE);
    // https://explorer.optimism.io/address/0xeF35211B545B8f7EAF77F0d144A2e023d21Cb453
    PerpsV2MarketState public constant perpsv2marketstatememeperp_i =
        PerpsV2MarketState(0xeF35211B545B8f7EAF77F0d144A2e023d21Cb453);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatetrbperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstatetiaperp_i);
        contracts[6] = address(perpsv2marketstateimxperp_i);
        contracts[7] = address(perpsv2marketstatememeperp_i);
        contracts[8] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, true);

        perpsv2marketstatetrbperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sTRBPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sTRBPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sTRBPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sTRBPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sTRBPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sTRBPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sTRBPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sTRBPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sTRBPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sTRBPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sTRBPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sTRBPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sTRBPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sTRBPERP", 23000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sTRBPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sTRBPERP", 200000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sTRBPERP", "ocTRBPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sTRBPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sTRBPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sTRBPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sTRBPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sTRBPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sTRBPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocTRBPERP", 80);
        perpsv2marketstatetiaperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sTIAPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sTIAPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sTIAPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sTIAPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sTIAPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sTIAPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sTIAPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sTIAPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sTIAPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sTIAPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sTIAPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sTIAPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sTIAPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sTIAPERP", 270000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sTIAPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sTIAPERP", 3000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sTIAPERP", "ocTIAPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sTIAPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sTIAPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sTIAPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sTIAPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sTIAPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sTIAPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocTIAPERP", 80);
        perpsv2marketstateimxperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sIMXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sIMXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sIMXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sIMXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sIMXPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sIMXPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sIMXPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sIMXPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sIMXPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sIMXPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sIMXPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sIMXPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sIMXPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sIMXPERP", 500000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sIMXPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sIMXPERP", 8000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sIMXPERP", "ocIMXPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sIMXPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sIMXPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sIMXPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sIMXPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sIMXPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sIMXPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocIMXPERP", 80);
        perpsv2marketstatememeperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sMEMEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sMEMEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sMEMEPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sMEMEPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sMEMEPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sMEMEPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sMEMEPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sMEMEPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sMEMEPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sMEMEPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sMEMEPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sMEMEPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sMEMEPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sMEMEPERP", 25000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sMEMEPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sMEMEPERP", 650000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sMEMEPERP", "ocMEMEPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sMEMEPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sMEMEPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sMEMEPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sMEMEPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sMEMEPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sMEMEPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocMEMEPERP", 80);
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for TRB;
        exchangerates_i.addAggregator("TRB", 0x3FF5BDB2bB6E3f946d9485De6c591c93B4179ae7);
        // Ensure the ExchangeRates contract has the standalone feed for TIA;
        exchangerates_i.addAggregator("TIA", 0xD7bC56BBF8D555936cb5121f38d1d362c586776A);
        // Ensure the ExchangeRates contract has the standalone feed for IMX;
        exchangerates_i.addAggregator("IMX", 0x26Fce884555FAe5F0E4701cc976FE8D8bB111A38);
        // Ensure the ExchangeRates contract has the standalone feed for MEME;
        exchangerates_i.addAggregator("MEME", 0xC6884869673a6960486FE0f6B0E775A53521e433);
        // Ensure the ExchangeRates contract has the standalone feed for FET;
        exchangerates_i.addAggregator("FET", 0xf37c76163b2918bB4533579D449524F8542E64AD);
        // Ensure the ExchangeRates contract has the standalone feed for GRT;
        exchangerates_i.addAggregator("GRT", 0xfa042d5F474d7A39454C594CCfE014Ea011495f2);
        // Ensure the ExchangeRates contract has the standalone feed for PYTH;
        exchangerates_i.addAggregator("PYTH", 0x0838cFe6A97C9CE1611a6Ed17252477a3c71eBEb);
        // Ensure the ExchangeRates contract has the standalone feed for ANKR;
        exchangerates_i.addAggregator("ANKR", 0xaE2f8ca8d89c3E4521B918D9D5F5bB30e937d68a);
        // Ensure the ExchangeRates contract has the standalone feed for BONK;
        exchangerates_i.addAggregator("BONK", 0xec236454209A76a6deCdf5C1183aE2Eb5e82a829);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for TRB;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "TRB",
            0xddcd037c2de8dbf2a0f6eebf1c039924baf7ebf0e7eb3b44bf421af69cc1b06d
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for TIA;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "TIA",
            0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for IMX;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "IMX",
            0x941320a8989414874de5aa2fc340a75d5ed91fdff1613dd55f83844d52ea63a2
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for MEME;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "MEME",
            0xcd2cee36951a571e035db0dfad138e6ecdb06b517cc3373cd7db5d3609b7927c
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for FET;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "FET",
            0xb98e7ae8af2d298d2651eb21ab5b8b5738212e13efb43bd0dfbce7a74ba4b5d0
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for GRT;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "GRT",
            0x4d1f8dae0d96236fb98e8f47471a366ec3b1732b47041781934ca3a9bb2f35e7
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for PYTH;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "PYTH",
            0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ANKR;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ANKR",
            0x89a58e1cab821118133d6831f5018fba5b354afb78b2d18f575b3cbf69a4f652
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for BONK;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "BONK",
            0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419
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
            0x5e24c013e8d8b60D53D77cce019263e1964ed8D1
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x30BB2B3A49ca31e0DD9D1C330E3e9bC8d4390B33
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0xbdb26bfb6A229d7f254FAf1B2c744887ec5F1f31);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x2774b19d141019B296E880aBd5f7E39A81D3164C
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0x89EF1ccB62eE764Be2f817f3fDf20598EC90fBCa
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0x35B0ed8473e7943d31Ee1eeeAd06C8767034Ce39);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0xbBF6444e3Ba09ae34288EFc9139A669A3359Dc95
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x6DAa4Eb27a25C3727e9857FD6b0B736Ff397542e
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0xBBd74c2c8c89D45B822e08fCe400F4DDE99e600b);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0xE0d47B8F4c0fa9BEef45544b2507c4832d0aDB06
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0x2cFD760B02CC196E611CE867862C0654B1527c2C
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0x48BeadAB5781aF9C4Fec27AC6c8E0F402F2Cc3D6);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }
}

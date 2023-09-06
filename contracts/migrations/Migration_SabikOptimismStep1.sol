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
contract Migration_SabikOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x982bb9880295EcBc34a56772fEF81E964Aee4A9f
    PerpsV2MarketState public constant perpsv2marketstatebalperp_i =
        PerpsV2MarketState(0x982bb9880295EcBc34a56772fEF81E964Aee4A9f);
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
    // https://explorer.optimism.io/address/0xd9AC5ECbB704f0bdb0a96bEBfA3B79bE829d2bC1
    PerpsV2MarketState public constant perpsv2marketstatefxsperp_i =
        PerpsV2MarketState(0xd9AC5ECbB704f0bdb0a96bEBfA3B79bE829d2bC1);
    // https://explorer.optimism.io/address/0x325AF017A497953734CB7B1F51580ff9aD1122B1
    PerpsV2MarketState public constant perpsv2marketstatekncperp_i =
        PerpsV2MarketState(0x325AF017A497953734CB7B1F51580ff9aD1122B1);
    // https://explorer.optimism.io/address/0x82DCd3e7224DDA8dF6A746d70F1Cce80df4384c2
    PerpsV2MarketState public constant perpsv2marketstaterndrperp_i =
        PerpsV2MarketState(0x82DCd3e7224DDA8dF6A746d70F1Cce80df4384c2);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatebalperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstatefxsperp_i);
        contracts[6] = address(perpsv2marketstatekncperp_i);
        contracts[7] = address(perpsv2marketstaterndrperp_i);
        contracts[8] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Add migration contract permission to pause
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatebalperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sBALPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sBALPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sBALPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sBALPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sBALPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sBALPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sBALPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sBALPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sBALPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sBALPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sBALPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sBALPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sBALPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sBALPERP", 125000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sBALPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sBALPERP", 1500000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sBALPERP", "ocBALPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sBALPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sBALPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sBALPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sBALPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sBALPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sBALPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocBALPERP", 80);
        perpsv2marketstatefxsperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sFXSPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sFXSPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sFXSPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sFXSPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sFXSPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sFXSPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sFXSPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sFXSPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sFXSPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sFXSPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sFXSPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sFXSPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sFXSPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sFXSPERP", 40000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sFXSPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sFXSPERP", 1250000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sFXSPERP", "ocFXSPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sFXSPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sFXSPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sFXSPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sFXSPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sFXSPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sFXSPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocFXSPERP", 80);
        perpsv2marketstatekncperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sKNCPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sKNCPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sKNCPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sKNCPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sKNCPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sKNCPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sKNCPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sKNCPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sKNCPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sKNCPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sKNCPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sKNCPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sKNCPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sKNCPERP", 750000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sKNCPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sKNCPERP", 36000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sKNCPERP", "ocKNCPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sKNCPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sKNCPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sKNCPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sKNCPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sKNCPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sKNCPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocKNCPERP", 80);
        perpsv2marketstaterndrperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sRNDRPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sRNDRPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sRNDRPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sRNDRPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sRNDRPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sRNDRPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sRNDRPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sRNDRPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sRNDRPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sRNDRPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sRNDRPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sRNDRPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sRNDRPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sRNDRPERP", 200000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sRNDRPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sRNDRPERP", 10000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sRNDRPERP", "ocRNDRPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sRNDRPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sRNDRPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sRNDRPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sRNDRPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sRNDRPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sRNDRPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocRNDRPERP", 80);
        // Remove permission to migration contract
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for STETHETH;
        exchangerates_i.addAggregator("STETHETH", 0x14d2d3a82AeD4019FddDfe07E8bdc485fb0d2249);
        // Ensure the ExchangeRates contract has the standalone feed for BAL;
        exchangerates_i.addAggregator("BAL", 0x30D9d31C1ac29Bc2c2c312c1bCa9F8b3D60e2376);
        // Ensure the ExchangeRates contract has the standalone feed for FXS;
        exchangerates_i.addAggregator("FXS", 0xB9B16330671067B1b062B9aC2eFd2dB75F03436E);
        // Ensure the ExchangeRates contract has the standalone feed for KNC;
        exchangerates_i.addAggregator("KNC", 0xCB24d22aF35986aC1feb8874AdBbDF68f6dC2e96);
        // Ensure the ExchangeRates contract has the standalone feed for RNDR;
        exchangerates_i.addAggregator("RNDR", 0x53623FD50C5Fd8788746af00F088FD7f06fD4116);
        // Ensure the ExchangeRates contract has the standalone feed for ONE;
        exchangerates_i.addAggregator("ONE", 0x7CFB4fac1a2FDB1267F8bc17FADc12804AC13CFE);
        // Ensure the ExchangeRates contract has the standalone feed for PERP;
        exchangerates_i.addAggregator("PERP", 0xA12CDDd8e986AF9288ab31E58C60e65F2987fB13);
        // Ensure the ExchangeRates contract has the standalone feed for ZIL;
        exchangerates_i.addAggregator("ZIL", 0x1520874FC216f5F07E03607303Df2Fda6C3Fc203);
        // Ensure the ExchangeRates contract has the standalone feed for RUNE;
        exchangerates_i.addAggregator("RUNE", 0x372cc5e685115A56F14fa7e4716F1294e04c278A);
        // Ensure the ExchangeRates contract has the standalone feed for SUSHI;
        exchangerates_i.addAggregator("SUSHI", 0x72155D46FD9f03AF1739637F9E7Db8A87C40A730);
        // Ensure the ExchangeRates contract has the standalone feed for ZEC;
        exchangerates_i.addAggregator("ZEC", 0x2FF8822F371b283604369700d6F06da3fBb31064);
        // Ensure the ExchangeRates contract has the standalone feed for XTZ;
        exchangerates_i.addAggregator("XTZ", 0xeA2aeD0087A620995Bf609D1bCD76Ea099905138);
        // Ensure the ExchangeRates contract has the standalone feed for UMA;
        exchangerates_i.addAggregator("UMA", 0xeEC819b2e155CC8FEae194F5129f767409e2327c);
        // Ensure the ExchangeRates contract has the standalone feed for ENJ;
        exchangerates_i.addAggregator("ENJ", 0x0cD83cC474e69E611d240f0d35D5794361F5e5C2);
        // Ensure the ExchangeRates contract has the standalone feed for ICP;
        exchangerates_i.addAggregator("ICP", 0xe98290265E4aE3758503a03e937F381A2A7aFB57);
        // Ensure the ExchangeRates contract has the standalone feed for XLM;
        exchangerates_i.addAggregator("XLM", 0x799A346e7dBfa0f66Ad0961259366F93A1ee34C4);
        // Ensure the ExchangeRates contract has the standalone feed for 1INCH;
        exchangerates_i.addAggregator("1INCH", 0x9fCe737834500045FB07AD158991BCAC3b05D5A6);
        // Ensure the ExchangeRates contract has the standalone feed for EOS;
        exchangerates_i.addAggregator("EOS", 0x8E8E6C8c4942e4963C682fF54A0d058458393DCC);
        // Ensure the ExchangeRates contract has the standalone feed for CELO;
        exchangerates_i.addAggregator("CELO", 0x5A9072a995E072fD06D8f1EB95933955FDa53C0a);
        // Ensure the ExchangeRates contract has the standalone feed for ALGO;
        exchangerates_i.addAggregator("ALGO", 0xBf5384854988939729E8B76b8AeCe7d8D930F9f3);
        // Ensure the ExchangeRates contract has the standalone feed for ZRX;
        exchangerates_i.addAggregator("ZRX", 0xBfbb4fE2fB71022DbFE0D4232c8C528bddf9c57f);
        // Ensure the ExchangeRates contract has the standalone feed for SEI;
        exchangerates_i.addAggregator("SEI", 0x6f6cED6B096708C1276056fdBdb7BbDe07Ca462C);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for BAL;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "BAL",
            0x07ad7b4a7662d19a6bc675f6b467172d2f3947fa653ca97555a9b20236406628
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for FXS;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "FXS",
            0x735f591e4fed988cd38df74d8fcedecf2fe8d9111664e0fd500db9aa78b316b1
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for RNDR;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "RNDR",
            0xab7347771135fc733f8f38db462ba085ed3309955f42554a14fa13e855ac0e2f
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ONE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ONE",
            0xc572690504b42b57a3f7aed6bd4aae08cbeeebdadcf130646a692fe73ec1e009
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for PERP;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "PERP",
            0x944f2f908c5166e0732ea5b610599116cd8e1c41f47452697c1e84138b7184d6
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ZIL;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ZIL",
            0x609722f3b6dc10fee07907fe86781d55eb9121cd0705b480954c00695d78f0cb
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for KNC;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "KNC",
            0xb9ccc817bfeded3926af791f09f76c5ffbc9b789cac6e9699ec333a79cacbe2a
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for RUNE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "RUNE",
            0x5fcf71143bb70d41af4fa9aa1287e2efd3c5911cee59f909f915c9f61baacb1e
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for SUSHI;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "SUSHI",
            0x26e4f737fde0263a9eea10ae63ac36dcedab2aaf629261a994e1eeb6ee0afe53
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ZEC;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ZEC",
            0xbe9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for XTZ;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "XTZ",
            0x0affd4b8ad136a21d79bc82450a325ee12ff55a235abc242666e423b8bcffd03
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for UMA;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "UMA",
            0x4b78d251770732f6304b1f41e9bebaabc3b256985ef18988f6de8d6562dd254c
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ENJ;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ENJ",
            0x5cc254b7cb9532df39952aee2a6d5497b42ec2d2330c7b76147f695138dbd9f3
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ICP;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ICP",
            0xc9907d786c5821547777780a1e4f89484f3417cb14dd244f2b0a34ea7a554d67
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for XLM;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "XLM",
            0xb7a8eba68a997cd0210c2e1e4ee811ad2d174b3611c22d9ebf16f4cb7e9ba850
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for 1INCH;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "1INCH",
            0x63f341689d98a12ef60a5cff1d7f85c70a9e17bf1575f0e7c0b2512d48b1c8b3
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for EOS;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "EOS",
            0x06ade621dbc31ed0fc9255caaab984a468abe84164fb2ccc76f02a4636d97e31
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for CELO;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "CELO",
            0x7d669ddcdd23d9ef1fa9a9cc022ba055ec900e91c4cb960f3c20429d4447a411
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ALGO;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ALGO",
            0xfa17ceaf30d19ba51112fdcc750cc83454776f47fb0112e4af07f15f4bb1ebc0
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ZRX;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ZRX",
            0x7d17b9fe4ea7103be16b6836984fabbc889386d700ca5e5b3d34b7f92e449268
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for SEI;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "SEI",
            0x53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for STETHETH;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "STETHETH",
            0x3af6a3098c56f58ff47cc46dee4a5b1910e5c157f7f0b665952445867470d61f
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
            0xBc5B0A6dCaDD4Fc27665601401D6f03D97375B24
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x8d51BF0759e1a01c15F91940BaaaD08B6B45a637
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x71f42cA320b3e9A8e4816e26De70c9b69eAf9d24);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x4022AB250B5c32c286A3953bc740368D6b68b067
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0xcCe2c84C91e6c4de7e87704b3D5C4fba10626234
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0x2fD9a39ACF071Aa61f92F3D7A98332c68d6B6602);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0xE6bf793B3ED4b42f8c3FB883a60e49f976a1791e
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0xE1264B2B97be89755FBCE7A280FD276C55F661D1
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x152Da6a8F32F25B56A32ef5559d4A2A96D09148b);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0xC81e43B6FB257760cb655C5B3Ea0b87d93cf01B5
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0x097b1ec678F135fa31C7D4c0D92b34940dB06251
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0x91cc4a83d026e5171525aFCAEd020123A653c2C9);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }
}

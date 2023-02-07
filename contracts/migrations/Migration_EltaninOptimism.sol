pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../PerpsV2ExchangeRate.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../ExchangeRates.sol";
import "../PerpsV2MarketSettings.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_EltaninOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C
    PerpsV2ExchangeRate public constant perpsv2exchangerate_i =
        PerpsV2ExchangeRate(0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C);
    // https://explorer.optimism.io/address/0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e);
    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);
    // https://explorer.optimism.io/address/0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1
    PerpsV2MarketSettings public constant perpsv2marketsettings_i =
        PerpsV2MarketSettings(0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xFEAF9e0A57e626f72E1a5fff507D7A2d9A9F0EE9
    address public constant new_PerpsV2MarketStateBTCPERP_contract = 0xFEAF9e0A57e626f72E1a5fff507D7A2d9A9F0EE9;
    // https://explorer.optimism.io/address/0x49dC714eaD0cc585eBaC8A412098914a2CE7B7B2
    address public constant new_PerpsV2MarketStateLINKPERP_contract = 0x49dC714eaD0cc585eBaC8A412098914a2CE7B7B2;
    // https://explorer.optimism.io/address/0x5da48D842542eF497ad68FAEd3480b3B1609Afe5
    address public constant new_PerpsV2MarketStateSOLPERP_contract = 0x5da48D842542eF497ad68FAEd3480b3B1609Afe5;
    // https://explorer.optimism.io/address/0x3d368332c5E5c454f179f36e716b7cfA09906454
    address public constant new_PerpsV2MarketStateAVAXPERP_contract = 0x3d368332c5E5c454f179f36e716b7cfA09906454;
    // https://explorer.optimism.io/address/0x9821CC43096b3F35744423C9B029854064dfe9Ab
    address public constant new_PerpsV2MarketStateAAVEPERP_contract = 0x9821CC43096b3F35744423C9B029854064dfe9Ab;
    // https://explorer.optimism.io/address/0xcF4a5F99902887d6CF5A2271cC1f54b5c2321e29
    address public constant new_PerpsV2MarketStateUNIPERP_contract = 0xcF4a5F99902887d6CF5A2271cC1f54b5c2321e29;
    // https://explorer.optimism.io/address/0xfC99d08D8ff69e31095E7372620369Fa92c82960
    address public constant new_PerpsV2MarketStateMATICPERP_contract = 0xfC99d08D8ff69e31095E7372620369Fa92c82960;
    // https://explorer.optimism.io/address/0xDaA88C67eBA3a95715d678557A4F42e26cd01F1A
    address public constant new_PerpsV2MarketStateAPEPERP_contract = 0xDaA88C67eBA3a95715d678557A4F42e26cd01F1A;
    // https://explorer.optimism.io/address/0xA1c26b1ff002993dD1fd43c0f662C5d93cC5B66E
    address public constant new_PerpsV2MarketStateDYDXPERP_contract = 0xA1c26b1ff002993dD1fd43c0f662C5d93cC5B66E;
    // https://explorer.optimism.io/address/0x7b75C4857E84C8421D422E06447A7Fb03c398eDd
    address public constant new_PerpsV2MarketStateBNBPERP_contract = 0x7b75C4857E84C8421D422E06447A7Fb03c398eDd;
    // https://explorer.optimism.io/address/0xa26c97A0c9788e937986ee6276f3762c20C06ef5
    address public constant new_PerpsV2MarketStateOPPERP_contract = 0xa26c97A0c9788e937986ee6276f3762c20C06ef5;
    // https://explorer.optimism.io/address/0xd6fe35B896FaE8b22AA6E47bE2752CF87eB1FcaC
    address public constant new_PerpsV2MarketStateDOGEPERP_contract = 0xd6fe35B896FaE8b22AA6E47bE2752CF87eB1FcaC;
    // https://explorer.optimism.io/address/0x58e7da4Ee20f1De44F59D3Dd2640D5D844e443cF
    address public constant new_PerpsV2MarketStateXAUPERP_contract = 0x58e7da4Ee20f1De44F59D3Dd2640D5D844e443cF;
    // https://explorer.optimism.io/address/0x90276BA2Ac35D2BE30588b5019CF257f80b89E71
    address public constant new_PerpsV2MarketStateXAGPERP_contract = 0x90276BA2Ac35D2BE30588b5019CF257f80b89E71;
    // https://explorer.optimism.io/address/0x0E48C8662e98f576e84d0ccDb146538269653225
    address public constant new_PerpsV2MarketStateEURPERP_contract = 0x0E48C8662e98f576e84d0ccDb146538269653225;
    // https://explorer.optimism.io/address/0x91a480Bf2518C037E644fE70F207E66fdAA4d948
    address public constant new_PerpsV2MarketStateATOMPERP_contract = 0x91a480Bf2518C037E644fE70F207E66fdAA4d948;
    // https://explorer.optimism.io/address/0x78fC32b982F5f35325996655a8Bd92715CfEfD06
    address public constant new_PerpsV2MarketStateAXSPERP_contract = 0x78fC32b982F5f35325996655a8Bd92715CfEfD06;
    // https://explorer.optimism.io/address/0x49700Eb35841E9CD637B3352A26B7d685aDaFD94
    address public constant new_PerpsV2MarketStateFLOWPERP_contract = 0x49700Eb35841E9CD637B3352A26B7d685aDaFD94;
    // https://explorer.optimism.io/address/0xe76DF4d2554C74B746c5A1Df8EAA4eA8F657916d
    address public constant new_PerpsV2MarketStateFTMPERP_contract = 0xe76DF4d2554C74B746c5A1Df8EAA4eA8F657916d;
    // https://explorer.optimism.io/address/0xea53A19B50C51881C0734a7169Fe9C6E44A09cf9
    address public constant new_PerpsV2MarketStateNEARPERP_contract = 0xea53A19B50C51881C0734a7169Fe9C6E44A09cf9;
    // https://explorer.optimism.io/address/0x973dE36Bb8022942e2658D5d129CbDdCF105a470
    address public constant new_PerpsV2MarketStateAUDPERP_contract = 0x973dE36Bb8022942e2658D5d129CbDdCF105a470;
    // https://explorer.optimism.io/address/0x4E1F44E48D2E87E279d25EEd88ced1Ec7f51438e
    address public constant new_PerpsV2MarketStateGBPPERP_contract = 0x4E1F44E48D2E87E279d25EEd88ced1Ec7f51438e;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0] = address(perpsv2exchangerate_i);
        contracts[1] = address(futuresmarketmanager_i);
        contracts[2] = address(addressresolver_i);
        contracts[3] = address(exchangerates_i);
        contracts[4] = address(perpsv2marketsettings_i);
        contracts[5] = address(systemstatus_i);
    }

    function migrate2() external onlyOwner {
        futuresmarketmanager_addProxiedMarkets_1();
    }

    function migrate3() external onlyOwner {
        futuresmarketmanager_addProxiedMarkets_2();
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // Ensure perpsV2 market is paused according to config;
        bytes32[] memory marketsToSuspend = new bytes32[](44);

        marketsToSuspend[0] = "sBTCPERP";
        marketsToSuspend[1] = "ocBTCPERP";
        marketsToSuspend[2] = "sLINKPERP";
        marketsToSuspend[3] = "ocLINKPERP";
        marketsToSuspend[4] = "sSOLPERP";
        marketsToSuspend[5] = "ocSOLPERP";
        marketsToSuspend[6] = "sAVAXPERP";
        marketsToSuspend[7] = "ocAVAXPERP";
        marketsToSuspend[8] = "sAAVEPERP";
        marketsToSuspend[9] = "ocAAVEPERP";
        marketsToSuspend[10] = "sUNIPERP";
        marketsToSuspend[11] = "ocUNIPERP";
        marketsToSuspend[12] = "sMATICPERP";
        marketsToSuspend[13] = "ocMATICPERP";
        marketsToSuspend[14] = "sAPEPERP";
        marketsToSuspend[15] = "ocAPEPERP";
        marketsToSuspend[16] = "sDYDXPERP";
        marketsToSuspend[17] = "ocDYDXPERP";
        marketsToSuspend[18] = "sBNBPERP";
        marketsToSuspend[19] = "ocBNBPERP";
        marketsToSuspend[20] = "sOPPERP";
        marketsToSuspend[21] = "ocOPPERP";
        marketsToSuspend[22] = "sDOGEPERP";
        marketsToSuspend[23] = "ocDOGEPERP";
        marketsToSuspend[24] = "sXAUPERP";
        marketsToSuspend[25] = "ocXAUPERP";
        marketsToSuspend[26] = "sXAGPERP";
        marketsToSuspend[27] = "ocXAGPERP";
        marketsToSuspend[28] = "sEURPERP";
        marketsToSuspend[29] = "ocEURPERP";
        marketsToSuspend[30] = "sATOMPERP";
        marketsToSuspend[31] = "ocATOMPERP";
        marketsToSuspend[32] = "sAXSPERP";
        marketsToSuspend[33] = "ocAXSPERP";
        marketsToSuspend[34] = "sFLOWPERP";
        marketsToSuspend[35] = "ocFLOWPERP";
        marketsToSuspend[36] = "sFTMPERP";
        marketsToSuspend[37] = "ocFTMPERP";
        marketsToSuspend[38] = "sNEARPERP";
        marketsToSuspend[39] = "ocNEARPERP";
        marketsToSuspend[40] = "sAUDPERP";
        marketsToSuspend[41] = "ocAUDPERP";
        marketsToSuspend[42] = "sGBPPERP";
        marketsToSuspend[43] = "ocGBPPERP";

        systemstatus_i.suspendFuturesMarkets(marketsToSuspend, 80);

        // MIGRATION
        perpsv2exchangerate_addAssociatedContracts_0();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_2();
        // Ensure the ExchangeRates contract has the standalone feed for ATOM;
        exchangerates_i.addAggregator("ATOM", 0xEF89db2eA46B4aD4E333466B6A486b809e613F39);
        // Ensure the ExchangeRates contract has the standalone feed for AXS;
        exchangerates_i.addAggregator("AXS", 0x805a61D54bb686e57F02D1EC96A1491C7aF40893);
        // Ensure the ExchangeRates contract has the standalone feed for FLOW;
        exchangerates_i.addAggregator("FLOW", 0x2fF1EB7D0ceC35959F0248E9354c3248c6683D9b);
        // Ensure the ExchangeRates contract has the standalone feed for FTM;
        exchangerates_i.addAggregator("FTM", 0xc19d58652d6BfC6Db6FB3691eDA6Aa7f3379E4E9);
        // Ensure the ExchangeRates contract has the standalone feed for NEAR;
        exchangerates_i.addAggregator("NEAR", 0xca6fa4b8CB365C02cd3Ba70544EFffe78f63ac82);
        // Ensure the ExchangeRates contract has the standalone feed for AUD;
        exchangerates_i.addAggregator("AUD", 0x39be70E93D2D285C9E71be7f70FC5a45A7777B14);
        // Ensure the ExchangeRates contract has the standalone feed for GBP;
        exchangerates_i.addAggregator("GBP", 0x540D48C01F946e729174517E013Ad0bdaE5F08C0);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for sBTC;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "sBTC",
            0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for LINK;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "LINK",
            0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for SOL;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "SOL",
            0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for AVAX;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "AVAX",
            0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for AAVE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "AAVE",
            0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for UNI;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "UNI",
            0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for MATIC;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "MATIC",
            0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for APE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "APE",
            0x15add95022ae13563a11992e727c91bdb6b55bc183d9d747436c80a483d8c864
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for DYDX;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "DYDX",
            0x6489800bb8974169adfe35937bf6736507097d13c190d760c557108c7e93a81b
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for BNB;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "BNB",
            0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for OP;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "OP",
            0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for DOGE;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "DOGE",
            0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for XAU;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "XAU",
            0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for XAG;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "XAG",
            0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for EUR;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "EUR",
            0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ATOM;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ATOM",
            0xb00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for AXS;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "AXS",
            0xb7e3904c08ddd9c0c10c6d207d390fd19e87eb6aab96304f571ed94caebdefa0
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for FLOW;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "FLOW",
            0x2fb245b9a84554a0f15aa123cbb5f64cd263b59e9a87d80148cbffab50c69f30
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for FTM;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "FTM",
            0x5c6c0d2386e3352356c3ab84434fafb5ea067ac2678a38a338c4a69ddc4bdb0c
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for NEAR;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "NEAR",
            0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for AUD;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "AUD",
            0x67a6f93030420c1c9e3fe37c1ab6b77966af82f995944a9fefce357a22854a80
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for GBP;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "GBP",
            0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1
        );

        // perpsv2marketsettings_i.setTakerFee("sBTCPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sBTCPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sBTCPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sBTCPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sBTCPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sBTCPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sBTCPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sBTCPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sBTCPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sBTCPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sBTCPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sBTCPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sBTCPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sBTCPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sBTCPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sBTCPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sBTCPERP", "ocBTCPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sBTCPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sBTCPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sLINKPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sLINKPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sLINKPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sLINKPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sLINKPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sLINKPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sLINKPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sLINKPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sLINKPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sLINKPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sLINKPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sLINKPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sLINKPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sLINKPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sLINKPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sLINKPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sLINKPERP", "ocLINKPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sLINKPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sLINKPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sSOLPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sSOLPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sSOLPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sSOLPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sSOLPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sSOLPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sSOLPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sSOLPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sSOLPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sSOLPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sSOLPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sSOLPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sSOLPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sSOLPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sSOLPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sSOLPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sSOLPERP", "ocSOLPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sSOLPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sSOLPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sAVAXPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sAVAXPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sAVAXPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sAVAXPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sAVAXPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sAVAXPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sAVAXPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sAVAXPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sAVAXPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sAVAXPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sAVAXPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sAVAXPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sAVAXPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sAVAXPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sAVAXPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sAVAXPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sAVAXPERP", "ocAVAXPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sAVAXPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sAVAXPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sAAVEPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sAAVEPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sAAVEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sAAVEPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sAAVEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sAAVEPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sAAVEPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sAAVEPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sAAVEPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sAAVEPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sAAVEPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sAAVEPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sAAVEPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sAAVEPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sAAVEPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sAAVEPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sAAVEPERP", "ocAAVEPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sAAVEPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sAAVEPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sUNIPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sUNIPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sUNIPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sUNIPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sUNIPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sUNIPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sUNIPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sUNIPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sUNIPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sUNIPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sUNIPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sUNIPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sUNIPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sUNIPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sUNIPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sUNIPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sUNIPERP", "ocUNIPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sUNIPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sUNIPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sMATICPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sMATICPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sMATICPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sMATICPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sMATICPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sMATICPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sMATICPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sMATICPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sMATICPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sMATICPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sMATICPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sMATICPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sMATICPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sMATICPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sMATICPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sMATICPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sMATICPERP", "ocMATICPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sMATICPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sMATICPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sAPEPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sAPEPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sAPEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sAPEPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sAPEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sAPEPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sAPEPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sAPEPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sAPEPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sAPEPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sAPEPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sAPEPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sAPEPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sAPEPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sAPEPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sAPEPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sAPEPERP", "ocAPEPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sAPEPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sAPEPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sDYDXPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sDYDXPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sDYDXPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sDYDXPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sDYDXPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sDYDXPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sDYDXPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sDYDXPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sDYDXPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sDYDXPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sDYDXPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sDYDXPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sDYDXPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sDYDXPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sDYDXPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sDYDXPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sDYDXPERP", "ocDYDXPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sDYDXPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sDYDXPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sBNBPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sBNBPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sBNBPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sBNBPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sBNBPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sBNBPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sBNBPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sBNBPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sBNBPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sBNBPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sBNBPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sBNBPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sBNBPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sBNBPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sBNBPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sBNBPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sBNBPERP", "ocBNBPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sBNBPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sBNBPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sOPPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sOPPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sOPPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sOPPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sOPPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sOPPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sOPPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sOPPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sOPPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sOPPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sOPPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sOPPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sOPPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sOPPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sOPPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sOPPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sOPPERP", "ocOPPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sOPPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sOPPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sDOGEPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sDOGEPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sDOGEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sDOGEPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sDOGEPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sDOGEPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sDOGEPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sDOGEPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sDOGEPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sDOGEPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sDOGEPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sDOGEPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sDOGEPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sDOGEPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sDOGEPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sDOGEPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sDOGEPERP", "ocDOGEPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sDOGEPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sDOGEPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sXAUPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sXAUPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sXAUPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sXAUPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sXAUPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sXAUPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sXAUPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sXAUPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sXAUPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sXAUPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sXAUPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sXAUPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sXAUPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sXAUPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sXAUPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sXAUPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sXAUPERP", "ocXAUPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sXAUPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sXAUPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sXAGPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sXAGPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sXAGPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sXAGPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sXAGPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sXAGPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sXAGPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sXAGPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sXAGPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sXAGPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sXAGPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sXAGPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sXAGPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sXAGPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sXAGPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sXAGPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sXAGPERP", "ocXAGPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sXAGPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sXAGPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sEURPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sEURPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sEURPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sEURPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sEURPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sEURPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sEURPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sEURPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sEURPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sEURPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sEURPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sEURPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sEURPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sEURPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sEURPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sEURPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sEURPERP", "ocEURPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sEURPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sEURPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sATOMPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sATOMPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sATOMPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sATOMPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sATOMPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sATOMPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sATOMPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sATOMPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sATOMPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sATOMPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sATOMPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sATOMPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sATOMPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sATOMPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sATOMPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sATOMPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sATOMPERP", "ocATOMPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sATOMPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sATOMPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sAXSPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sAXSPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sAXSPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sAXSPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sAXSPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sAXSPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sAXSPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sAXSPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sAXSPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sAXSPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sAXSPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sAXSPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sAXSPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sAXSPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sAXSPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sAXSPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sAXSPERP", "ocAXSPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sAXSPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sAXSPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sFLOWPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sFLOWPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sFLOWPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sFLOWPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sFLOWPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sFLOWPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sFLOWPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sFLOWPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sFLOWPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sFLOWPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sFLOWPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sFLOWPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sFLOWPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sFLOWPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sFLOWPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sFLOWPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sFLOWPERP", "ocFLOWPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sFLOWPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sFLOWPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sFTMPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sFTMPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sFTMPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sFTMPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sFTMPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sFTMPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sFTMPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sFTMPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sFTMPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sFTMPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sFTMPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sFTMPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sFTMPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sFTMPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sFTMPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sFTMPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sFTMPERP", "ocFTMPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sFTMPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sFTMPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sNEARPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sNEARPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sNEARPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sNEARPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sNEARPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sNEARPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sNEARPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sNEARPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sNEARPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sNEARPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sNEARPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sNEARPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sNEARPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sNEARPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sNEARPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sNEARPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sNEARPERP", "ocNEARPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sNEARPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sNEARPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sAUDPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sAUDPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sAUDPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sAUDPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sAUDPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sAUDPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sAUDPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sAUDPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sAUDPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sAUDPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sAUDPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sAUDPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sAUDPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sAUDPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sAUDPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sAUDPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sAUDPERP", "ocAUDPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sAUDPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sAUDPERP", 1000000000000000000);

        // perpsv2marketsettings_i.setTakerFee("sGBPPERP", 10000000000000000);
        // perpsv2marketsettings_i.setMakerFee("sGBPPERP", 7000000000000000);
        // perpsv2marketsettings_i.setTakerFeeDelayedOrder("sGBPPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeDelayedOrder("sGBPPERP", 500000000000000);
        // perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sGBPPERP", 1000000000000000);
        // perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sGBPPERP", 500000000000000);
        // perpsv2marketsettings_i.setNextPriceConfirmWindow("sGBPPERP", 2);
        // perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sGBPPERP", 120);
        // perpsv2marketsettings_i.setMinDelayTimeDelta("sGBPPERP", 60);
        // perpsv2marketsettings_i.setMaxDelayTimeDelta("sGBPPERP", 6000);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sGBPPERP", 15);
        // perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sGBPPERP", 120);
        // perpsv2marketsettings_i.setMaxLeverage("sGBPPERP", 100000000000000000000);
        // perpsv2marketsettings_i.setMaxMarketValue("sGBPPERP", 1000000000000000000000);
        // perpsv2marketsettings_i.setMaxFundingVelocity("sGBPPERP", 3000000000000000000);
        // perpsv2marketsettings_i.setSkewScale("sGBPPERP", 1000000000000000000000000);
        // perpsv2marketsettings_i.setOffchainMarketKey("sGBPPERP", "ocGBPPERP");
        // perpsv2marketsettings_i.setOffchainPriceDivergence("sGBPPERP", 20000000000000000);
        // perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sGBPPERP", 1000000000000000000);

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

    function perpsv2exchangerate_addAssociatedContracts_0() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0 = new address[](22);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[0] = address(
            0x194ffc3D2cE0552720F24FefDf57a6c534223174
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[1] = address(
            0xf67fDa142f31686523D2b52CE25aD66895f23116
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[2] = address(
            0x139AF9de51Ca2594911502E7A5653D4693EFb4ED
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[3] = address(
            0xF7df260a4F46Eaf5A82589B9e9D3879e6FCee431
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[4] = address(
            0x2BF61b08F3e8DA40799D90C3b1e60f1c4DDb7fDA
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[5] = address(
            0x85875A05bE4db7a21dB6C53CeD09b06a5aD83402
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[6] = address(
            0x1651e832dcc1B9cF697810d822aee35A9f5fFD64
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[7] = address(
            0xE99dB61288A4e8968ee58C03cc142c6ddB500598
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[8] = address(
            0xF612F3098a277cb80Ad03f20cf7787aD1Dc48f4a
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[9] = address(
            0x8c2c26494eAe20A8a22f94ED5Fa4B104FAD6bcca
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[10] = address(
            0xd2471115Be883EA7A32907D78062C323a5E85593
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[11] = address(
            0xfde9d8F4d2fB18823363fdd0E1fF305c4696A19D
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[12] = address(
            0xf8B9Dd242BDAF6242cb783F02b49D1Dd9126DE5c
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[13] = address(
            0x909c690556D8389AEa348377EB27dECFb1b27d29
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[14] = address(
            0xB0A058c7781F6EcA709d4b469FCc522a6fA38E60
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[15] = address(
            0x14688DFAa8b4085DA485579f72F3DE467485411a
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[16] = address(
            0x43406c99fc8a7776F2870800e38FF5c8Cc96a2fE
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[17] = address(
            0xF40482B4DA5509d6a9fb3Bed08E2356D72c31028
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[18] = address(
            0x08941749026fF010c22E8B9d93a76EEBFC61C13b
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[19] = address(
            0xBF3B13F155070a61156f261b26D0Eb06f629C2e6
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[20] = address(
            0x2A656E9618185782A638c86C64b5702854DDB11A
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0[21] = address(
            0x0BB25623946960D8FB1696a9D70466766F2C8aa7
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_0_0);
    }

    function futuresmarketmanager_addProxiedMarkets_1() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0 = new address[](11);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[0] = address(0x59b007E9ea8F89b069c43F8f45834d30853e3699);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[1] = address(0x31A1659Ca00F617E86Dc765B6494Afe70a5A9c1A);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[2] = address(0x0EA09D97b4084d859328ec4bF8eBCF9ecCA26F1D);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[3] = address(0xc203A12F298CE73E44F7d45A4f59a43DBfFe204D);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[4] = address(0x5374761526175B59f1E583246E20639909E189cE);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[5] = address(0x4308427C463CAEAaB50FFf98a9deC569C31E4E87);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[6] = address(0x074B8F19fc91d6B2eb51143E1f186Ca0DDB88042);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[7] = address(0x5B6BeB79E959Aac2659bEE60fE0D0885468BF886);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[8] = address(0x139F94E4f0e1101c1464a321CBA815c34d58B5D9);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[9] = address(0x0940B0A96C5e1ba33AEE331a9f950Bb2a6F2Fb25);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[10] = address(0x442b69937a0daf9D46439a71567fABE6Cb69FBaf);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0 = new address[](11);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[0] = address(0x98cCbC721cc05E28a125943D69039B39BE6A21e9);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[1] = address(0x549dbDFfbd47bD5639f9348eBE82E63e2f9F777A);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[2] = address(0xdcB8438c979fA030581314e5A5Df42bbFEd744a0);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[3] = address(0x87AE62c5720DAB812BDacba66cc24839440048d1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[4] = address(0xbB16C7B3244DFA1a6BF83Fcce3EE4560837763CD);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[5] = address(0x3a52b21816168dfe35bE99b7C5fc209f17a0aDb1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[6] = address(0x27665271210aCff4Fab08AD9Bb657E91866471F0);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[7] = address(0xC18f85A6DD3Bcd0516a1CA08d3B1f0A4E191A2C4);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[8] = address(0xC8fCd6fB4D15dD7C455373297dEF375a08942eCe);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[9] = address(0x9De146b5663b82F44E5052dEDe2aA3Fd4CBcDC99);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0[10] = address(0x1dAd8808D8aC58a0df912aDC4b215ca3B93D6C49);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_1_0);
    }

    function addressresolver_importAddresses_2() internal {
        bytes32[] memory addressresolver_importAddresses_names_2_0 = new bytes32[](22);
        addressresolver_importAddresses_names_2_0[0] = bytes32("PerpsV2MarketStateBTCPERP");
        addressresolver_importAddresses_names_2_0[1] = bytes32("PerpsV2MarketStateLINKPERP");
        addressresolver_importAddresses_names_2_0[2] = bytes32("PerpsV2MarketStateSOLPERP");
        addressresolver_importAddresses_names_2_0[3] = bytes32("PerpsV2MarketStateAVAXPERP");
        addressresolver_importAddresses_names_2_0[4] = bytes32("PerpsV2MarketStateAAVEPERP");
        addressresolver_importAddresses_names_2_0[5] = bytes32("PerpsV2MarketStateUNIPERP");
        addressresolver_importAddresses_names_2_0[6] = bytes32("PerpsV2MarketStateMATICPERP");
        addressresolver_importAddresses_names_2_0[7] = bytes32("PerpsV2MarketStateAPEPERP");
        addressresolver_importAddresses_names_2_0[8] = bytes32("PerpsV2MarketStateDYDXPERP");
        addressresolver_importAddresses_names_2_0[9] = bytes32("PerpsV2MarketStateBNBPERP");
        addressresolver_importAddresses_names_2_0[10] = bytes32("PerpsV2MarketStateOPPERP");
        addressresolver_importAddresses_names_2_0[11] = bytes32("PerpsV2MarketStateDOGEPERP");
        addressresolver_importAddresses_names_2_0[12] = bytes32("PerpsV2MarketStateXAUPERP");
        addressresolver_importAddresses_names_2_0[13] = bytes32("PerpsV2MarketStateXAGPERP");
        addressresolver_importAddresses_names_2_0[14] = bytes32("PerpsV2MarketStateEURPERP");
        addressresolver_importAddresses_names_2_0[15] = bytes32("PerpsV2MarketStateATOMPERP");
        addressresolver_importAddresses_names_2_0[16] = bytes32("PerpsV2MarketStateAXSPERP");
        addressresolver_importAddresses_names_2_0[17] = bytes32("PerpsV2MarketStateFLOWPERP");
        addressresolver_importAddresses_names_2_0[18] = bytes32("PerpsV2MarketStateFTMPERP");
        addressresolver_importAddresses_names_2_0[19] = bytes32("PerpsV2MarketStateNEARPERP");
        addressresolver_importAddresses_names_2_0[20] = bytes32("PerpsV2MarketStateAUDPERP");
        addressresolver_importAddresses_names_2_0[21] = bytes32("PerpsV2MarketStateGBPPERP");
        address[] memory addressresolver_importAddresses_destinations_2_1 = new address[](22);
        addressresolver_importAddresses_destinations_2_1[0] = address(new_PerpsV2MarketStateBTCPERP_contract);
        addressresolver_importAddresses_destinations_2_1[1] = address(new_PerpsV2MarketStateLINKPERP_contract);
        addressresolver_importAddresses_destinations_2_1[2] = address(new_PerpsV2MarketStateSOLPERP_contract);
        addressresolver_importAddresses_destinations_2_1[3] = address(new_PerpsV2MarketStateAVAXPERP_contract);
        addressresolver_importAddresses_destinations_2_1[4] = address(new_PerpsV2MarketStateAAVEPERP_contract);
        addressresolver_importAddresses_destinations_2_1[5] = address(new_PerpsV2MarketStateUNIPERP_contract);
        addressresolver_importAddresses_destinations_2_1[6] = address(new_PerpsV2MarketStateMATICPERP_contract);
        addressresolver_importAddresses_destinations_2_1[7] = address(new_PerpsV2MarketStateAPEPERP_contract);
        addressresolver_importAddresses_destinations_2_1[8] = address(new_PerpsV2MarketStateDYDXPERP_contract);
        addressresolver_importAddresses_destinations_2_1[9] = address(new_PerpsV2MarketStateBNBPERP_contract);
        addressresolver_importAddresses_destinations_2_1[10] = address(new_PerpsV2MarketStateOPPERP_contract);
        addressresolver_importAddresses_destinations_2_1[11] = address(new_PerpsV2MarketStateDOGEPERP_contract);
        addressresolver_importAddresses_destinations_2_1[12] = address(new_PerpsV2MarketStateXAUPERP_contract);
        addressresolver_importAddresses_destinations_2_1[13] = address(new_PerpsV2MarketStateXAGPERP_contract);
        addressresolver_importAddresses_destinations_2_1[14] = address(new_PerpsV2MarketStateEURPERP_contract);
        addressresolver_importAddresses_destinations_2_1[15] = address(new_PerpsV2MarketStateATOMPERP_contract);
        addressresolver_importAddresses_destinations_2_1[16] = address(new_PerpsV2MarketStateAXSPERP_contract);
        addressresolver_importAddresses_destinations_2_1[17] = address(new_PerpsV2MarketStateFLOWPERP_contract);
        addressresolver_importAddresses_destinations_2_1[18] = address(new_PerpsV2MarketStateFTMPERP_contract);
        addressresolver_importAddresses_destinations_2_1[19] = address(new_PerpsV2MarketStateNEARPERP_contract);
        addressresolver_importAddresses_destinations_2_1[20] = address(new_PerpsV2MarketStateAUDPERP_contract);
        addressresolver_importAddresses_destinations_2_1[21] = address(new_PerpsV2MarketStateGBPPERP_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_2_0,
            addressresolver_importAddresses_destinations_2_1
        );
    }
}

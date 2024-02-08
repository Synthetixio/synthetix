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
contract Migration_SabikOptimismStep3 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xe94afDEd9CB9AB143E8cCc8C7439794E8C41F1A6
    PerpsV2MarketState public constant perpsv2marketstatezecperp_i =
        PerpsV2MarketState(0xe94afDEd9CB9AB143E8cCc8C7439794E8C41F1A6);
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
    // https://explorer.optimism.io/address/0xaf621161755C601C1469e3487ce971f39Ae507BC
    PerpsV2MarketState public constant perpsv2marketstatextzperp_i =
        PerpsV2MarketState(0xaf621161755C601C1469e3487ce971f39Ae507BC);
    // https://explorer.optimism.io/address/0x595f37E1b21870571eE99fbe815D6790D817C0Ba
    PerpsV2MarketState public constant perpsv2marketstateumaperp_i =
        PerpsV2MarketState(0x595f37E1b21870571eE99fbe815D6790D817C0Ba);
    // https://explorer.optimism.io/address/0x8327AA139bd7eEE62730a2cB9B9A86821810d4DB
    PerpsV2MarketState public constant perpsv2marketstateenjperp_i =
        PerpsV2MarketState(0x8327AA139bd7eEE62730a2cB9B9A86821810d4DB);
    // https://explorer.optimism.io/address/0x4bD5674a720c212FF515Dd51d4E5d304FF16B3d0
    PerpsV2MarketState public constant perpsv2marketstateicpperp_i =
        PerpsV2MarketState(0x4bD5674a720c212FF515Dd51d4E5d304FF16B3d0);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatezecperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstatextzperp_i);
        contracts[6] = address(perpsv2marketstateumaperp_i);
        contracts[7] = address(perpsv2marketstateenjperp_i);
        contracts[8] = address(perpsv2marketstateicpperp_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatezecperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sZECPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sZECPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sZECPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sZECPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sZECPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sZECPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sZECPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sZECPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sZECPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sZECPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sZECPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sZECPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sZECPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sZECPERP", 15000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sZECPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sZECPERP", 780000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sZECPERP", "ocZECPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sZECPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sZECPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sZECPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sZECPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sZECPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sZECPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocZECPERP", 80);
        perpsv2marketstatextzperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sXTZPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sXTZPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sXTZPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sXTZPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sXTZPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sXTZPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sXTZPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sXTZPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sXTZPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sXTZPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sXTZPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sXTZPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sXTZPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sXTZPERP", 400000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sXTZPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sXTZPERP", 19000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sXTZPERP", "ocXTZPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sXTZPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sXTZPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sXTZPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sXTZPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sXTZPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sXTZPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocXTZPERP", 80);
        perpsv2marketstateumaperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sUMAPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sUMAPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sUMAPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sUMAPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sUMAPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sUMAPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sUMAPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sUMAPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sUMAPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sUMAPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sUMAPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sUMAPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sUMAPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sUMAPERP", 40000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sUMAPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sUMAPERP", 3700000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sUMAPERP", "ocUMAPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sUMAPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sUMAPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sUMAPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sUMAPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sUMAPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sUMAPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocUMAPERP", 80);
        perpsv2marketstateenjperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sENJPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sENJPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sENJPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sENJPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sENJPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sENJPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sENJPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sENJPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sENJPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sENJPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sENJPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sENJPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sENJPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sENJPERP", 1250000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sENJPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sENJPERP", 46000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sENJPERP", "ocENJPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sENJPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sENJPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sENJPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sENJPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sENJPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sENJPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocENJPERP", 80);
        perpsv2marketstateicpperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_109();
        futuresmarketmanager_addProxiedMarkets_110();
        perpsv2marketsettings_i.setTakerFee("sICPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sICPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sICPPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sICPPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sICPPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sICPPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sICPPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sICPPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sICPPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sICPPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sICPPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sICPPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sICPPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sICPPERP", 75000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sICPPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sICPPERP", 4000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sICPPERP", "ocICPPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sICPPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sICPPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sICPPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sICPPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sICPPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sICPPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocICPPERP", 80);
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
            0xD21257d00E06621b1946532a2410dB1aBa75C638
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x3f9917995e1a55060B984dbeE9d7358D9eB7AC8c
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0xf8aB6B9008f2290965426d3076bC9d2EA835575e);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0xa7912822C220cda3596CAbFe9077769576E2b46E
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0x4Fb59e8dAfcd398b2ca7Fe2Af5a7405Cd0d22278
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0xC645A757DD81C69641e010aDD2Da894b4b7Bc921);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0xD60E490fBF42a43E67F1e8d74debd7bCB5240F80
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x581Fa71eB5b5D704d0c268EEd58e48f801338f7B
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0xb815Eb8D3a9dA3EdDD926225c0FBD3A566e8C749);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0xf23DF6328A8EDCFb34B9905715a32181e72964c3
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0xE7b44E0411307B637A1B3B75AF8c37d752857Ae1
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0x88C8316E5CCCCE2E27e5BFcDAC99f1251246196a);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_109() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[0] = address(
            0xcAd243fA79De8Acb3B0336Dd9793A16D8e6A3aA5
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[1] = address(
            0xE72f5C2B7C8E8697aFFe886497d22ad47D832085
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0);
    }

    function futuresmarketmanager_addProxiedMarkets_110() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0[0] = address(0x105f7F2986A2414B4007958b836904100a53d1AD);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0);
    }
}

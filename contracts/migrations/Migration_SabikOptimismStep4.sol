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
contract Migration_SabikOptimismStep4 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xEaFa65b829b37277a14fE43de9fAda0d9e897E4d
    PerpsV2MarketState public constant perpsv2marketstatexlmperp_i =
        PerpsV2MarketState(0xEaFa65b829b37277a14fE43de9fAda0d9e897E4d);
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
    // https://explorer.optimism.io/address/0x26A035D9A2eD696EacC3816674C66A7eB73aAb70
    PerpsV2MarketState public constant perpsv2marketstate1inchperp_i =
        PerpsV2MarketState(0x26A035D9A2eD696EacC3816674C66A7eB73aAb70);
    // https://explorer.optimism.io/address/0x1f53699b435326B6e264727b5504Cc28006Bed8B
    PerpsV2MarketState public constant perpsv2marketstateeosperp_i =
        PerpsV2MarketState(0x1f53699b435326B6e264727b5504Cc28006Bed8B);
    // https://explorer.optimism.io/address/0xb8BC48ed3D08A3ac02D62174652369d3279705dE
    PerpsV2MarketState public constant perpsv2marketstateceloperp_i =
        PerpsV2MarketState(0xb8BC48ed3D08A3ac02D62174652369d3279705dE);
    // https://explorer.optimism.io/address/0xd856b45d4D9671482e53E705058aF3fF09000A28
    PerpsV2MarketState public constant perpsv2marketstatealgoperp_i =
        PerpsV2MarketState(0xd856b45d4D9671482e53E705058aF3fF09000A28);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstatexlmperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstate1inchperp_i);
        contracts[6] = address(perpsv2marketstateeosperp_i);
        contracts[7] = address(perpsv2marketstateceloperp_i);
        contracts[8] = address(perpsv2marketstatealgoperp_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatexlmperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sXLMPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sXLMPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sXLMPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sXLMPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sXLMPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sXLMPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sXLMPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sXLMPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sXLMPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sXLMPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sXLMPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sXLMPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sXLMPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sXLMPERP", 4500000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sXLMPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sXLMPERP", 333000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sXLMPERP", "ocXLMPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sXLMPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sXLMPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sXLMPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sXLMPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sXLMPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sXLMPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocXLMPERP", 80);
        perpsv2marketstate1inchperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("s1INCHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("s1INCHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("s1INCHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("s1INCHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("s1INCHPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("s1INCHPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("s1INCHPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("s1INCHPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("s1INCHPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("s1INCHPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("s1INCHPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("s1INCHPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("s1INCHPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("s1INCHPERP", 1250000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("s1INCHPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("s1INCHPERP", 60000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("s1INCHPERP", "oc1INCHPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("s1INCHPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("s1INCHPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("s1INCHPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("s1INCHPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("s1INCHPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("s1INCHPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("oc1INCHPERP", 80);
        perpsv2marketstateeosperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sEOSPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sEOSPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sEOSPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sEOSPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sEOSPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sEOSPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sEOSPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sEOSPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sEOSPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sEOSPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sEOSPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sEOSPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sEOSPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sEOSPERP", 1000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sEOSPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sEOSPERP", 128000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sEOSPERP", "ocEOSPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sEOSPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sEOSPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sEOSPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sEOSPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sEOSPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sEOSPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocEOSPERP", 80);
        perpsv2marketstateceloperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_82();
        futuresmarketmanager_addProxiedMarkets_83();
        perpsv2marketsettings_i.setTakerFee("sCELOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sCELOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sCELOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sCELOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sCELOPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sCELOPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sCELOPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sCELOPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sCELOPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sCELOPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sCELOPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sCELOPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sCELOPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sCELOPERP", 1250000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sCELOPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sCELOPERP", 55000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sCELOPERP", "ocCELOPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sCELOPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sCELOPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sCELOPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sCELOPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sCELOPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sCELOPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocCELOPERP", 80);
        perpsv2marketstatealgoperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_109();
        futuresmarketmanager_addProxiedMarkets_110();
        perpsv2marketsettings_i.setTakerFee("sALGOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sALGOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sALGOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sALGOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sALGOPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sALGOPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sALGOPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sALGOPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sALGOPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sALGOPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sALGOPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sALGOPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sALGOPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sALGOPERP", 6000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sALGOPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sALGOPERP", 277000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sALGOPERP", "ocALGOPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sALGOPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sALGOPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sALGOPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sALGOPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sALGOPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sALGOPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocALGOPERP", 80);
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
            0x9576B1104c0fa29F76B3559B77e0fD0A6b450213
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x2aEF3F9E57E2695C32bEaC56d79BFe4efb55bF63
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0xfbbBFA96Af2980aE4014d5D5A2eF14bD79B2a299);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x6d5403B5b195F0F26aaF5e2a7FD58aB1D0Fb2F3e
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0xDC7a51F5c32909AcD5D03d11944c4480bee1Cd47
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0xd5fAaa459e5B3c118fD85Fc0fD67f56310b1618D);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0x02A26Df328E08c12ce3A5ed428b83Dc5e4c2ee67
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x15F71Cb39F39A3b30ef610a15Ce1CBE766CB069C
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x50a40d947726ac1373DC438e7aaDEde9b237564d);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_82() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[0] = address(
            0x32a357AdE8497EA57446b4BF5099FA9F0918592f
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0[1] = address(
            0x5dCA1c6c75f6410CB4020A4aB5657FEF716fCfc3
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_82_0);
    }

    function futuresmarketmanager_addProxiedMarkets_83() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0[0] = address(0x2292865b2b6C837B7406E819200CE61c1c4F8d43);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_83_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_109() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[0] = address(
            0x9bAEDd40FaE33Ce9022D39a9bd71F325E626a06e
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0[1] = address(
            0x799654ecaF87E769C56f722C82Fbc7BBCC4f621C
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_109_0);
    }

    function futuresmarketmanager_addProxiedMarkets_110() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0[0] = address(0x96f2842007021a4C5f06Bcc72961701D66Ff8465);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_110_0);
    }
}

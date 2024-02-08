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
contract Migration_SabikOptimismStep5 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x0e4695edb83FB23E6b12AFa3660beF09610791de
    PerpsV2MarketState public constant perpsv2marketstatezrxperp_i =
        PerpsV2MarketState(0x0e4695edb83FB23E6b12AFa3660beF09610791de);
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
    // https://explorer.optimism.io/address/0x9F6AA1c141838DF56eF82Be286cAbd2616c8B309
    PerpsV2MarketState public constant perpsv2marketstateseiperp_i =
        PerpsV2MarketState(0x9F6AA1c141838DF56eF82Be286cAbd2616c8B309);
    // https://explorer.optimism.io/address/0x2EC454957C0e66266398076f066fAaC77c48d88d
    PerpsV2MarketState public constant perpsv2marketstatestethethperp_i =
        PerpsV2MarketState(0x2EC454957C0e66266398076f066fAaC77c48d88d);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(perpsv2marketstatezrxperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstateseiperp_i);
        contracts[6] = address(perpsv2marketstatestethethperp_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatezrxperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sZRXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sZRXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sZRXPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sZRXPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sZRXPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sZRXPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sZRXPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sZRXPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sZRXPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sZRXPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sZRXPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sZRXPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sZRXPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sZRXPERP", 2250000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sZRXPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sZRXPERP", 40000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sZRXPERP", "ocZRXPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sZRXPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sZRXPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sZRXPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sZRXPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sZRXPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sZRXPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocZRXPERP", 80);
        perpsv2marketstateseiperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sSEIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sSEIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sSEIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sSEIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sSEIPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sSEIPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sSEIPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sSEIPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sSEIPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sSEIPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sSEIPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sSEIPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sSEIPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sSEIPERP", 3000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sSEIPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sSEIPERP", 142000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sSEIPERP", "ocSEIPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sSEIPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sSEIPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sSEIPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sSEIPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sSEIPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sSEIPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocSEIPERP", 80);
        perpsv2marketstatestethethperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        perpsv2marketsettings_i.setTakerFee("sSTETHETHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sSTETHETHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sSTETHETHPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sSTETHETHPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sSTETHETHPERP", 150000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sSTETHETHPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sSTETHETHPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sSTETHETHPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sSTETHETHPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sSTETHETHPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sSTETHETHPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sSTETHETHPERP", 55000000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sSTETHETHPERP", 5000000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sSTETHETHPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sSTETHETHPERP", 2000000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sSTETHETHPERP", "ocSTETHETHPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sSTETHETHPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sSTETHETHPERP", 1000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sSTETHETHPERP", 150000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sSTETHETHPERP", 10000000000000000);
        perpsv2marketsettings_i.setMaxPD("sSTETHETHPERP", 300000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sSTETHETHPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocSTETHETHPERP", 80);
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
            0x58e178B0CacD1bc56a2cC408030A1f69eDc315f7
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x08BCea94194A1D63379123073Cb254b77f7721A5
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x76BB1Edf0C55eC68f4C8C7fb3C076b811b1a9b9f);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x9D81F2898127f812751dc09C210D839a7DB651aa
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0xb2E9642F96A1b576ab0232ec35Cb0d7d07D1172F
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0x66fc48720f09Ac386608FB65ede53Bb220D0D5Bc);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0xFF5CfDB5b9640EaEA8D23C1d72014346aE8174FD
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[1] = address(
            0x4c0f7b167e7D280D97471f5A17F4Eb214E15A440
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x08388dC122A956887c2F736Aaec4A0Ce6f0536Ce);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }
}

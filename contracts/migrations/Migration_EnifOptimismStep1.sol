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
contract Migration_EnifOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xd4b10C896D82B3158A9a9fcb8F6fBC5A8D833C04
    PerpsV2MarketState public constant perpsv2marketstatewldperp_i =
        PerpsV2MarketState(0xd4b10C896D82B3158A9a9fcb8F6fBC5A8D833C04);
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
        contracts[0] = address(perpsv2marketstatewldperp_i);
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
        perpsv2marketstatewldperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sWLDPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sWLDPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sWLDPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sWLDPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sWLDPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sWLDPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sWLDPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sWLDPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sWLDPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sWLDPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sWLDPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sWLDPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sWLDPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sWLDPERP", 650000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sWLDPERP", 27000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sWLDPERP", 33000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sWLDPERP", "ocWLDPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sWLDPERP", 25000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sWLDPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sWLDPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sWLDPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sWLDPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sWLDPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocWLDPERP", 80);
        // Remove permission to migration contract
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for WLD;
        exchangerates_i.addAggregator("WLD", 0x4e1C6B168DCFD7758bC2Ab9d2865f1895813D236);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for WLD;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "WLD",
            0xd6835ad1f773de4a378115eb6824bd0c0e42d84d1c84d9750e853fb6b6c7794a
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
            0x81891EBC7cF265B87D8658EC2E703fB703392845
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x695Fdda0E1546cA369Df3CabE8ED33407Cf62341
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0x77DA808032dCdd48077FA7c57afbF088713E09aD);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }
}

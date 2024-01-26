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
contract Migration_MarkebOptimismStep1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xbC2FDA8D78A9a7F0AFEfD45EE5c4A78f02088C10
    PerpsV2MarketState public constant perpsv2marketstatejtoperp_i =
        PerpsV2MarketState(0xbC2FDA8D78A9a7F0AFEfD45EE5c4A78f02088C10);
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
    // https://explorer.optimism.io/address/0xDe344136FB507e96Df8694615f6AF1739A2a9AaD
    PerpsV2MarketState public constant perpsv2marketstateordiperp_i =
        PerpsV2MarketState(0xDe344136FB507e96Df8694615f6AF1739A2a9AaD);
    // https://explorer.optimism.io/address/0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x913bd76F7E1572CC8278CeF2D6b06e2140ca9Ce2);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(perpsv2marketstatejtoperp_i);
        contracts[1] = address(perpsv2exchangerate_i);
        contracts[2] = address(futuresmarketmanager_i);
        contracts[3] = address(perpsv2marketsettings_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(perpsv2marketstateordiperp_i);
        contracts[6] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        systemstatus_i.updateAccessControl("Futures", address(this), true, false);
        perpsv2marketstatejtoperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_1();
        futuresmarketmanager_addProxiedMarkets_2();
        perpsv2marketsettings_i.setTakerFee("sJTOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sJTOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sJTOPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sJTOPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sJTOPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sJTOPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sJTOPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sJTOPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sJTOPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sJTOPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sJTOPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sJTOPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sJTOPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sJTOPERP", 550000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sJTOPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sJTOPERP", 8000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sJTOPERP", "ocJTOPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sJTOPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sJTOPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sJTOPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sJTOPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sJTOPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sJTOPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocJTOPERP", 80);
        perpsv2marketstateordiperp_i.linkOrInitializeState();
        perpsv2exchangerate_addAssociatedContracts_28();
        futuresmarketmanager_addProxiedMarkets_29();
        perpsv2marketsettings_i.setTakerFee("sORDIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFee("sORDIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sORDIPERP", 300000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sORDIPERP", 300000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sORDIPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sORDIPERP", 200000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sORDIPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sORDIPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sORDIPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sORDIPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sORDIPERP", 2);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sORDIPERP", 60);
        perpsv2marketsettings_i.setMaxLeverage("sORDIPERP", 27500000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sORDIPERP", 20000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sORDIPERP", 36000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sORDIPERP", 750000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sORDIPERP", "ocORDIPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sORDIPERP", 100000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sORDIPERP", 3000000000000000000);
        perpsv2marketsettings_i.setMaxLiquidationDelta("sORDIPERP", 1200000000000000);
        perpsv2marketsettings_i.setLiquidationBufferRatio("sORDIPERP", 15000000000000000);
        perpsv2marketsettings_i.setMaxPD("sORDIPERP", 2400000000000000);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("sORDIPERP", 80);
        // Ensure perpsV2 market is paused according to config;
        systemstatus_i.suspendFuturesMarket("ocORDIPERP", 80);
        systemstatus_i.updateAccessControl("Futures", address(this), false, false);
        // Ensure the ExchangeRates contract has the standalone feed for JTO;
        exchangerates_i.addAggregator("JTO", 0xFC3b7bd4368b2919f67E437f8c6Ca42C7FD55dd5);
        // Ensure the ExchangeRates contract has the standalone feed for ORDI;
        exchangerates_i.addAggregator("ORDI", 0x30795BeACc0f43920EF1288dB6676B5e205AE288);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for JTO;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "JTO",
            0xb43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2
        );
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ORDI;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ORDI",
            0x193c739db502aadcef37c2589738b1e37bdb257d58cf1ab3c7ebc8e6df4e3ec0
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
            0x064F65c29d29386b37d7D78804fd4246AC7edA0B
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0[1] = address(
            0x05718A8adFaF321b0e21DaaE77A44a2De71F6d9f
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_1_0);
    }

    function futuresmarketmanager_addProxiedMarkets_2() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0[0] = address(0xae90E9BB73b32505FB56a0F4Fd4eC8cf94BaB730);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_2_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_28() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0 = new address[](2);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[0] = address(
            0x709F4EF76E243B365f0172f6C4CFA825af7Ae468
        );
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0[1] = address(
            0xf595193ba60485855d3F6bD2e60c487cC6A99B9D
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_28_0);
    }

    function futuresmarketmanager_addProxiedMarkets_29() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0[0] = address(0xE698CcC3cD4f2172a848094eA6D28D89d750C16f);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_29_0);
    }
}

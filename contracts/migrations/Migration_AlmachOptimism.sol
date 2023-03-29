pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../PerpsV2MarketState.sol";
import "../PerpsV2MarketDelayedOrders.sol";
import "../PerpsV2MarketDelayedOrdersOffchain.sol";
import "../PerpsV2Market.sol";
import "../ProxyPerpsV2.sol";
import "../PerpsV2ExchangeRate.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../ExchangeRates.sol";
import "../PerpsV2MarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlmachOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xa31717145C27bb37868829E92A3601014768d145
    PerpsV2MarketState public constant perpsv2marketstate_i = PerpsV2MarketState(0xa31717145C27bb37868829E92A3601014768d145);
    // https://explorer.optimism.io/address/0x0f5af2A8a4Df79e354455788fdA73bed85AB435C
    PerpsV2MarketDelayedOrders public constant perpsv2marketdelayedorders_i =
        PerpsV2MarketDelayedOrders(0x0f5af2A8a4Df79e354455788fdA73bed85AB435C);
    // https://explorer.optimism.io/address/0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C
    PerpsV2MarketDelayedOrdersOffchain public constant perpsv2marketdelayedordersoffchain_i =
        PerpsV2MarketDelayedOrdersOffchain(0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C);
    // https://explorer.optimism.io/address/0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6
    PerpsV2Market public constant perpsv2market_i = PerpsV2Market(0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6);
    // https://explorer.optimism.io/address/0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e
    ProxyPerpsV2 public constant proxyperpsv2_i = ProxyPerpsV2(0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e);
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

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xa31717145C27bb37868829E92A3601014768d145
    address public constant new_PerpsV2MarketStateARBPERP_contract = 0xa31717145C27bb37868829E92A3601014768d145;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](10);
        contracts[0] = address(perpsv2marketstate_i);
        contracts[1] = address(perpsv2marketdelayedorders_i);
        contracts[2] = address(perpsv2marketdelayedordersoffchain_i);
        contracts[3] = address(perpsv2market_i);
        contracts[4] = address(proxyperpsv2_i);
        contracts[5] = address(perpsv2exchangerate_i);
        contracts[6] = address(futuresmarketmanager_i);
        contracts[7] = address(addressresolver_i);
        contracts[8] = address(exchangerates_i);
        contracts[9] = address(perpsv2marketsettings_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        perpsv2marketstate_removeAssociatedContracts_0();
        perpsv2marketstate_addAssociatedContracts_1();
        perpsv2marketdelayedorders_i.setProxy(0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e);
        perpsv2marketstate_addAssociatedContracts_3();
        perpsv2marketdelayedordersoffchain_i.setProxy(0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e);
        perpsv2marketstate_addAssociatedContracts_5();
        perpsv2market_i.setProxy(0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e);
        proxyperpsv2_i.addRoute(0x785cdeec, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x1bf556d0, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xd24378eb, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xcdf456e1, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xb9f4ff55, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x3aef4d0b, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xb74e3806, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xea9f9aa7, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x27b9a236, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x41108cf2, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xcded0cea, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x2af64bd3, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xc8023af4, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x964db90c, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xe8c63470, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xd7103a46, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xeb56105d, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x5fc890c2, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x2b58ecef, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xb895daab, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x4dd9d7e9, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x55f57510, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xea1d5478, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xb111dfac, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x9cfbf4e4, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0x917e77f5, 0x4DC1636f5B4C1143cB03772A93923718E4320543, true);
        proxyperpsv2_i.addRoute(0xc70b41e9, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0xc8b809aa, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, true);
        proxyperpsv2_i.addRoute(0xa8300afb, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0xd67bdd25, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, true);
        proxyperpsv2_i.addRoute(0xec556889, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, true);
        proxyperpsv2_i.addRoute(0xbc67f832, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0x97107d6d, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0x09461cfe, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0x787d6c30, 0x0f5af2A8a4Df79e354455788fdA73bed85AB435C, false);
        proxyperpsv2_i.addRoute(0xdcce5806, 0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C, false);
        proxyperpsv2_i.addRoute(0xdfa723cc, 0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C, false);
        proxyperpsv2_i.addRoute(0xa1c35a35, 0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C, false);
        proxyperpsv2_i.addRoute(0x85f05ab5, 0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C, false);
        proxyperpsv2_i.addRoute(0xa126d601, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x5c8011c3, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x7498a0f0, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x4ad4914b, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x32f05103, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x4eb985cc, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x88a3c848, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        proxyperpsv2_i.addRoute(0x5a1cbd2b, 0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6, false);
        perpsv2exchangerate_addAssociatedContracts_54();
        futuresmarketmanager_addProxiedMarkets_55();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_56();
        // Ensure the ExchangeRates contract has the standalone feed for ARB;
        exchangerates_i.addAggregator("ARB", 0x8f14546d0B960793180ee355B73fA55041a4a356);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ARB;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "ARB",
            0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5
        );
        perpsv2marketsettings_i.setTakerFee("sARBPERP", 50000000000000000);
        perpsv2marketsettings_i.setMakerFee("sARBPERP", 50000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sARBPERP", 50000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sARBPERP", 50000000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sARBPERP", 1200000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sARBPERP", 400000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sARBPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sARBPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sARBPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sARBPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sARBPERP", 15);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sARBPERP", 120);
        perpsv2marketsettings_i.setMaxLeverage("sARBPERP", 100000000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sARBPERP", 1500000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sARBPERP", 9000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sARBPERP", 150000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sARBPERP", "ocARBPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sARBPERP", 30000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sARBPERP", 1000000000000000000);

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

    function perpsv2marketstate_removeAssociatedContracts_0() internal {
        address[] memory perpsv2marketstate_removeAssociatedContracts_associatedContracts_0_0 = new address[](1);
        perpsv2marketstate_removeAssociatedContracts_associatedContracts_0_0[0] = address(
            0x302d2451d9f47620374B54c521423Bf0403916A2
        );
        perpsv2marketstate_i.removeAssociatedContracts(perpsv2marketstate_removeAssociatedContracts_associatedContracts_0_0);
    }

    function perpsv2marketstate_addAssociatedContracts_1() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_1_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_1_0[0] = address(
            0x0f5af2A8a4Df79e354455788fdA73bed85AB435C
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_1_0);
    }

    function perpsv2marketstate_addAssociatedContracts_3() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_3_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_3_0[0] = address(
            0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_3_0);
    }

    function perpsv2marketstate_addAssociatedContracts_5() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_5_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_5_0[0] = address(
            0xF676e375eD19bd05C85F7EF8958C69684fD1b3c6
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_5_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_54() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0 = new address[](1);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0[0] = address(
            0x5d89892BCa7aa5619fd6168D38F73bb84D777e9C
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0);
    }

    function futuresmarketmanager_addProxiedMarkets_55() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_55_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_55_0[0] = address(0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_55_0);
    }

    function addressresolver_importAddresses_56() internal {
        bytes32[] memory addressresolver_importAddresses_names_56_0 = new bytes32[](1);
        addressresolver_importAddresses_names_56_0[0] = bytes32("PerpsV2MarketStateARBPERP");
        address[] memory addressresolver_importAddresses_destinations_56_1 = new address[](1);
        addressresolver_importAddresses_destinations_56_1[0] = address(new_PerpsV2MarketStateARBPERP_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_56_0,
            addressresolver_importAddresses_destinations_56_1
        );
    }
}

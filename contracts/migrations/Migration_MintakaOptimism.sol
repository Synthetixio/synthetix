pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../ProxyPerpsV2.sol";
import "../PerpsV2MarketState.sol";
import "../PerpsV2MarketDelayedOrders.sol";
import "../PerpsV2MarketDelayedOrdersOffchain.sol";
import "../PerpsV2Market.sol";
import "../PerpsV2ExchangeRate.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../PerpsV2MarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MintakaOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x038dC05D68ED32F23e6856c0D44b0696B325bfC8
    PerpsV2MarketState public constant perpsv2marketstate_i = PerpsV2MarketState(0x038dC05D68ED32F23e6856c0D44b0696B325bfC8);
    // https://explorer.optimism.io/address/0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6
    PerpsV2MarketDelayedOrders public constant perpsv2marketdelayedorders_i =
        PerpsV2MarketDelayedOrders(0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6);
    // https://explorer.optimism.io/address/0x0454E103a712b257819efBBB797EaE80918dd2FF
    PerpsV2MarketDelayedOrdersOffchain public constant perpsv2marketdelayedordersoffchain_i =
        PerpsV2MarketDelayedOrdersOffchain(0x0454E103a712b257819efBBB797EaE80918dd2FF);
    // https://explorer.optimism.io/address/0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c
    PerpsV2Market public constant perpsv2market_i = PerpsV2Market(0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c);
    // https://explorer.optimism.io/address/0x2B3bb4c683BFc5239B029131EEf3B1d214478d93
    ProxyPerpsV2 public constant proxyperpsv2_i = ProxyPerpsV2(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
    // https://explorer.optimism.io/address/0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C
    PerpsV2ExchangeRate public constant perpsv2exchangerate_i =
        PerpsV2ExchangeRate(0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C);
    // https://explorer.optimism.io/address/0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e);
    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1
    PerpsV2MarketSettings public constant perpsv2marketsettings_i =
        PerpsV2MarketSettings(0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1
    address public constant new_PerpsV2MarketSettings_contract = 0x09793Aad1518B8d8CC72FDd356479E3CBa7B4Ad1;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(perpsv2marketstate_i);
        contracts[1] = address(perpsv2marketdelayedorders_i);
        contracts[2] = address(perpsv2marketdelayedordersoffchain_i);
        contracts[3] = address(perpsv2market_i);
        contracts[4] = address(proxyperpsv2_i);
        contracts[5] = address(perpsv2exchangerate_i);
        contracts[6] = address(futuresmarketmanager_i);
        contracts[7] = address(addressresolver_i);
        contracts[8] = address(perpsv2marketsettings_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        perpsv2marketstate_addAssociatedContracts_0();
        perpsv2marketdelayedorders_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        perpsv2marketstate_addAssociatedContracts_2();
        perpsv2marketdelayedordersoffchain_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        perpsv2marketstate_addAssociatedContracts_4();
        perpsv2market_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        proxyperpsv2_i.addRoute(0x785cdeec, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x1bf556d0, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xd24378eb, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xcdf456e1, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xb9f4ff55, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x3aef4d0b, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xb74e3806, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xea9f9aa7, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x27b9a236, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x41108cf2, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xcded0cea, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x2af64bd3, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xc8023af4, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x964db90c, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xe8c63470, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xd7103a46, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xeb56105d, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x5fc890c2, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x2b58ecef, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xb895daab, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x4dd9d7e9, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x55f57510, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xea1d5478, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xb111dfac, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x9cfbf4e4, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0x917e77f5, 0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D, true);
        proxyperpsv2_i.addRoute(0xc70b41e9, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0xc8b809aa, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, true);
        proxyperpsv2_i.addRoute(0xa8300afb, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0xd67bdd25, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, true);
        proxyperpsv2_i.addRoute(0xec556889, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, true);
        proxyperpsv2_i.addRoute(0xbc67f832, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0x97107d6d, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0x09461cfe, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0x787d6c30, 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6, false);
        proxyperpsv2_i.addRoute(0xdcce5806, 0x0454E103a712b257819efBBB797EaE80918dd2FF, false);
        proxyperpsv2_i.addRoute(0xdfa723cc, 0x0454E103a712b257819efBBB797EaE80918dd2FF, false);
        proxyperpsv2_i.addRoute(0xa1c35a35, 0x0454E103a712b257819efBBB797EaE80918dd2FF, false);
        proxyperpsv2_i.addRoute(0x85f05ab5, 0x0454E103a712b257819efBBB797EaE80918dd2FF, false);
        proxyperpsv2_i.addRoute(0xa126d601, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x5c8011c3, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x7498a0f0, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x4ad4914b, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x32f05103, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x4eb985cc, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x88a3c848, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        proxyperpsv2_i.addRoute(0x5a1cbd2b, 0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c, false);
        perpsv2exchangerate_removeAssociatedContracts_53();
        perpsv2exchangerate_addAssociatedContracts_54();
        futuresmarketmanager_updateMarketsImplementations_55();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_56();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_57();
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for sBTC;
        // Set the minimum margin to open a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setMinInitialMargin(40000000000000000000);
        // Set the reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setLiquidationFeeRatio(3500000000000000);
        // Set the reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setLiquidationBufferRatio(2500000000000000);
        // Set the minimum reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setMinKeeperFee(2000000000000000000);
        // Set the maximum reward for liquidating a perpsV2 position;
        perpsv2marketsettings_i.setMaxKeeperFee(1000000000000000000000);
        perpsv2marketsettings_i.setTakerFee("sETHPERP", 10000000000000000);
        perpsv2marketsettings_i.setMakerFee("sETHPERP", 7000000000000000);
        perpsv2marketsettings_i.setTakerFeeDelayedOrder("sETHPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeDelayedOrder("sETHPERP", 500000000000000);
        perpsv2marketsettings_i.setTakerFeeOffchainDelayedOrder("sETHPERP", 1000000000000000);
        perpsv2marketsettings_i.setMakerFeeOffchainDelayedOrder("sETHPERP", 500000000000000);
        perpsv2marketsettings_i.setNextPriceConfirmWindow("sETHPERP", 2);
        perpsv2marketsettings_i.setDelayedOrderConfirmWindow("sETHPERP", 120);
        perpsv2marketsettings_i.setMinDelayTimeDelta("sETHPERP", 60);
        perpsv2marketsettings_i.setMaxDelayTimeDelta("sETHPERP", 6000);
        perpsv2marketsettings_i.setOffchainDelayedOrderMinAge("sETHPERP", 15);
        perpsv2marketsettings_i.setOffchainDelayedOrderMaxAge("sETHPERP", 120);
        perpsv2marketsettings_i.setMaxLeverage("sETHPERP", 100000000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sETHPERP", 1000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sETHPERP", 3000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sETHPERP", 1000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sETHPERP", "ocETHPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sETHPERP", 20000000000000000);
        perpsv2marketsettings_i.setLiquidationPremiumMultiplier("sETHPERP", 1000000000000000000);

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

    function perpsv2marketstate_addAssociatedContracts_0() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_0_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_0_0[0] = address(
            0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_0_0);
    }

    function perpsv2marketstate_addAssociatedContracts_2() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0[0] = address(
            0x0454E103a712b257819efBBB797EaE80918dd2FF
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0);
    }

    function perpsv2marketstate_addAssociatedContracts_4() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0[0] = address(
            0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0);
    }

    function perpsv2exchangerate_removeAssociatedContracts_53() internal {
        address[] memory perpsv2exchangerate_removeAssociatedContracts_associatedContracts_53_0 = new address[](1);
        perpsv2exchangerate_removeAssociatedContracts_associatedContracts_53_0[0] = address(
            0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d
        );
        perpsv2exchangerate_i.removeAssociatedContracts(
            perpsv2exchangerate_removeAssociatedContracts_associatedContracts_53_0
        );
    }

    function perpsv2exchangerate_addAssociatedContracts_54() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0 = new address[](1);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0[0] = address(
            0x0454E103a712b257819efBBB797EaE80918dd2FF
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_54_0);
    }

    function futuresmarketmanager_updateMarketsImplementations_55() internal {
        address[] memory futuresmarketmanager_updateMarketsImplementations_marketsToUpdate_55_0 = new address[](1);
        futuresmarketmanager_updateMarketsImplementations_marketsToUpdate_55_0[0] = address(
            0x2B3bb4c683BFc5239B029131EEf3B1d214478d93
        );
        futuresmarketmanager_i.updateMarketsImplementations(
            futuresmarketmanager_updateMarketsImplementations_marketsToUpdate_55_0
        );
    }

    function addressresolver_importAddresses_56() internal {
        bytes32[] memory addressresolver_importAddresses_names_56_0 = new bytes32[](1);
        addressresolver_importAddresses_names_56_0[0] = bytes32("PerpsV2MarketSettings");
        address[] memory addressresolver_importAddresses_destinations_56_1 = new address[](1);
        addressresolver_importAddresses_destinations_56_1[0] = address(new_PerpsV2MarketSettings_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_56_0,
            addressresolver_importAddresses_destinations_56_1
        );
    }

    function addressresolver_rebuildCaches_57() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_57_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_57_0[0] = MixinResolver(0x35CcAC0A67D2a1EF1FDa8898AEcf1415FE6cf94c);
        addressresolver_rebuildCaches_destinations_57_0[1] = MixinResolver(0x9363c080Ca0B16EAD12Fd33aac65c8D0214E9d6D);
        addressresolver_rebuildCaches_destinations_57_0[2] = MixinResolver(0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6);
        addressresolver_rebuildCaches_destinations_57_0[3] = MixinResolver(0x0454E103a712b257819efBBB797EaE80918dd2FF);
        addressresolver_rebuildCaches_destinations_57_0[4] = MixinResolver(new_PerpsV2MarketSettings_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_57_0);
    }
}

pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../ProxyPerpsV2.sol";
import "../PerpsV2MarketState.sol";
import "../PerpsV2MarketDelayedOrders.sol";
import "../PerpsV2MarketDelayedOrdersOffchain.sol";
import "../PerpsV2Market.sol";
import "../PerpsV2ExchangeRate.sol";
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

    // https://explorer.optimism.io/address/0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e);
    // https://explorer.optimism.io/address/0x038dC05D68ED32F23e6856c0D44b0696B325bfC8
    PerpsV2MarketState public constant perpsv2marketstate_i = PerpsV2MarketState(0x038dC05D68ED32F23e6856c0D44b0696B325bfC8);
    // https://explorer.optimism.io/address/0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB
    PerpsV2MarketDelayedOrders public constant perpsv2marketdelayedorders_i =
        PerpsV2MarketDelayedOrders(0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB);
    // https://explorer.optimism.io/address/0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d
    PerpsV2MarketDelayedOrdersOffchain public constant perpsv2marketdelayedordersoffchain_i =
        PerpsV2MarketDelayedOrdersOffchain(0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d);
    // https://explorer.optimism.io/address/0x517D0676E80115c1Aab36332B1732567Ce6D7010
    PerpsV2Market public constant perpsv2market_i = PerpsV2Market(0x517D0676E80115c1Aab36332B1732567Ce6D7010);
    // https://explorer.optimism.io/address/0x2B3bb4c683BFc5239B029131EEf3B1d214478d93
    ProxyPerpsV2 public constant proxyperpsv2_i = ProxyPerpsV2(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
    // https://explorer.optimism.io/address/0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C
    PerpsV2ExchangeRate public constant perpsv2exchangerate_i =
        PerpsV2ExchangeRate(0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C);
    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0xd442Dc2Ac1f3cA1C86C8329246e47Ca0C91D0471
    PerpsV2MarketSettings public constant perpsv2marketsettings_i =
        PerpsV2MarketSettings(0xd442Dc2Ac1f3cA1C86C8329246e47Ca0C91D0471);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e
    address public constant new_FuturesMarketManager_contract = 0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e;
    // https://explorer.optimism.io/address/0xd442Dc2Ac1f3cA1C86C8329246e47Ca0C91D0471
    address public constant new_PerpsV2MarketSettings_contract = 0xd442Dc2Ac1f3cA1C86C8329246e47Ca0C91D0471;
    // https://explorer.optimism.io/address/0xF7D3D05cCeEEcC9d77864Da3DdE67Ce9a0215A9D
    address public constant new_PerpsV2MarketData_contract = 0xF7D3D05cCeEEcC9d77864Da3DdE67Ce9a0215A9D;
    // https://explorer.optimism.io/address/0x038dC05D68ED32F23e6856c0D44b0696B325bfC8
    address public constant new_PerpsV2MarketStateETHPERP_contract = 0x038dC05D68ED32F23e6856c0D44b0696B325bfC8;
    // https://explorer.optimism.io/address/0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C
    address public constant new_PerpsV2ExchangeRate_contract = 0x4aD2d14Bed21062Ef7B85C378F69cDdf6ED7489C;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(perpsv2marketstate_i);
        contracts[2] = address(perpsv2marketdelayedorders_i);
        contracts[3] = address(perpsv2marketdelayedordersoffchain_i);
        contracts[4] = address(perpsv2market_i);
        contracts[5] = address(proxyperpsv2_i);
        contracts[6] = address(perpsv2exchangerate_i);
        contracts[7] = address(addressresolver_i);
        contracts[8] = address(perpsv2marketsettings_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        futuresmarketmanager_addMarkets_0();
        perpsv2marketstate_removeAssociatedContracts_1();
        perpsv2marketstate_addAssociatedContracts_2();
        perpsv2marketdelayedorders_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        perpsv2marketstate_addAssociatedContracts_4();
        perpsv2marketdelayedordersoffchain_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        perpsv2marketstate_addAssociatedContracts_6();
        perpsv2market_i.setProxy(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        proxyperpsv2_i.addRoute(0x785cdeec, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x1bf556d0, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xd24378eb, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xcdf456e1, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xb9f4ff55, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x3aef4d0b, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xb74e3806, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xea9f9aa7, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x27b9a236, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x41108cf2, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xcded0cea, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x2af64bd3, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xc8023af4, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x964db90c, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xe8c63470, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xd7103a46, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xeb56105d, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x5fc890c2, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x2b58ecef, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xb895daab, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x4dd9d7e9, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x55f57510, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xea1d5478, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xb111dfac, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x9cfbf4e4, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0x917e77f5, 0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12, true);
        proxyperpsv2_i.addRoute(0xc70b41e9, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0xc8b809aa, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, true);
        proxyperpsv2_i.addRoute(0xa8300afb, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0xd67bdd25, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, true);
        proxyperpsv2_i.addRoute(0xec556889, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, true);
        proxyperpsv2_i.addRoute(0xbc67f832, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0x97107d6d, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0x09461cfe, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0x787d6c30, 0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB, false);
        proxyperpsv2_i.addRoute(0xdcce5806, 0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d, false);
        proxyperpsv2_i.addRoute(0xdfa723cc, 0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d, false);
        proxyperpsv2_i.addRoute(0xa1c35a35, 0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d, false);
        proxyperpsv2_i.addRoute(0x85f05ab5, 0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d, false);
        proxyperpsv2_i.addRoute(0xa126d601, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x5c8011c3, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x7498a0f0, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x4ad4914b, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x32f05103, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x4eb985cc, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x88a3c848, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        proxyperpsv2_i.addRoute(0x5a1cbd2b, 0x517D0676E80115c1Aab36332B1732567Ce6D7010, false);
        perpsv2exchangerate_addAssociatedContracts_55();
        futuresmarketmanager_addProxiedMarkets_56();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_57();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_58();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_59();
        // Ensure the PerpsV2ExchangeRate has the oracle address configured to 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C;
        perpsv2exchangerate_i.setOffchainOracle(0xff1a0f4744e8582DF1aE09D5611b887B6a12925C);
        // Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for sETH;
        perpsv2exchangerate_i.setOffchainPriceFeedId(
            "sETH",
            0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
        );
        // Set the minimum margin to open a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setMinInitialMargin(40000000000000000000);
        // Set the reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setLiquidationFeeRatio(3500000000000000);
        // Set the reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setLiquidationBufferRatio(2500000000000000);
        // Set the minimum reward for liquidating a perpsV2 position (SIP-80);
        perpsv2marketsettings_i.setMinKeeperFee(1000000000000000000);
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
        perpsv2marketsettings_i.setMaxLeverage("sETHPERP", 27000000000000000000);
        perpsv2marketsettings_i.setMaxMarketValue("sETHPERP", 20000000000000000000000);
        perpsv2marketsettings_i.setMaxFundingVelocity("sETHPERP", 3000000000000000000);
        perpsv2marketsettings_i.setSkewScale("sETHPERP", 1000000000000000000000000);
        perpsv2marketsettings_i.setOffchainMarketKey("sETHPERP", "ocETHPERP");
        perpsv2marketsettings_i.setOffchainPriceDivergence("sETHPERP", 20000000000000000);

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

    function futuresmarketmanager_addMarkets_0() internal {
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_0_0 = new address[](18);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[0] = address(0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[1] = address(0xf86048DFf23cF130107dfB4e6386f574231a5C65);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[2] = address(0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[3] = address(0xcF853f7f8F78B2B801095b66F8ba9c5f04dB1640);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[4] = address(0x4ff54624D5FB61C34c634c3314Ed3BfE4dBB665a);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[5] = address(0x001b7876F567f0b3A639332Ed1e363839c6d85e2);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[6] = address(0x5Af0072617F7f2AEB0e314e2faD1DE0231Ba97cD);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[7] = address(0xbCB2D435045E16B059b2130b28BE70b5cA47bFE5);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[8] = address(0x4434f56ddBdE28fab08C4AE71970a06B300F8881);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[9] = address(0xb147C69BEe211F57290a6cde9d1BAbfD0DCF3Ea3);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[10] = address(0xad44873632840144fFC97b2D1de716f6E2cF0366);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[11] = address(0xFe00395ec846240dc693e92AB2Dd720F94765Aa3);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[12] = address(0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[13] = address(0x4Aa0dabd22BC0894975324Bec293443c8538bD08);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[14] = address(0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[15] = address(0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[16] = address(0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[17] = address(0xd325B17d5C9C3f2B6853A760afCF81945b0184d3);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_0_0);
    }

    function perpsv2marketstate_removeAssociatedContracts_1() internal {
        address[] memory perpsv2marketstate_removeAssociatedContracts_associatedContracts_1_0 = new address[](1);
        perpsv2marketstate_removeAssociatedContracts_associatedContracts_1_0[0] = address(
            0x302d2451d9f47620374B54c521423Bf0403916A2
        );
        perpsv2marketstate_i.removeAssociatedContracts(perpsv2marketstate_removeAssociatedContracts_associatedContracts_1_0);
    }

    function perpsv2marketstate_addAssociatedContracts_2() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0[0] = address(
            0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_2_0);
    }

    function perpsv2marketstate_addAssociatedContracts_4() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0[0] = address(
            0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_4_0);
    }

    function perpsv2marketstate_addAssociatedContracts_6() internal {
        address[] memory perpsv2marketstate_addAssociatedContracts_associatedContracts_6_0 = new address[](1);
        perpsv2marketstate_addAssociatedContracts_associatedContracts_6_0[0] = address(
            0x517D0676E80115c1Aab36332B1732567Ce6D7010
        );
        perpsv2marketstate_i.addAssociatedContracts(perpsv2marketstate_addAssociatedContracts_associatedContracts_6_0);
    }

    function perpsv2exchangerate_addAssociatedContracts_55() internal {
        address[] memory perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0 = new address[](1);
        perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0[0] = address(
            0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d
        );
        perpsv2exchangerate_i.addAssociatedContracts(perpsv2exchangerate_addAssociatedContracts_associatedContracts_55_0);
    }

    function futuresmarketmanager_addProxiedMarkets_56() internal {
        address[] memory futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0 = new address[](1);
        futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0[0] = address(0x2B3bb4c683BFc5239B029131EEf3B1d214478d93);
        futuresmarketmanager_i.addProxiedMarkets(futuresmarketmanager_addProxiedMarkets_marketsToAdd_56_0);
    }

    function addressresolver_importAddresses_57() internal {
        bytes32[] memory addressresolver_importAddresses_names_57_0 = new bytes32[](5);
        addressresolver_importAddresses_names_57_0[0] = bytes32("FuturesMarketManager");
        addressresolver_importAddresses_names_57_0[1] = bytes32("PerpsV2MarketSettings");
        addressresolver_importAddresses_names_57_0[2] = bytes32("PerpsV2MarketData");
        addressresolver_importAddresses_names_57_0[3] = bytes32("PerpsV2MarketStateETHPERP");
        addressresolver_importAddresses_names_57_0[4] = bytes32("PerpsV2ExchangeRate");
        address[] memory addressresolver_importAddresses_destinations_57_1 = new address[](5);
        addressresolver_importAddresses_destinations_57_1[0] = address(new_FuturesMarketManager_contract);
        addressresolver_importAddresses_destinations_57_1[1] = address(new_PerpsV2MarketSettings_contract);
        addressresolver_importAddresses_destinations_57_1[2] = address(new_PerpsV2MarketData_contract);
        addressresolver_importAddresses_destinations_57_1[3] = address(new_PerpsV2MarketStateETHPERP_contract);
        addressresolver_importAddresses_destinations_57_1[4] = address(new_PerpsV2ExchangeRate_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_57_0,
            addressresolver_importAddresses_destinations_57_1
        );
    }

    function addressresolver_rebuildCaches_58() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_58_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_58_0[0] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_58_0[1] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_58_0[2] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_58_0[3] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_rebuildCaches_destinations_58_0[4] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_58_0[5] = MixinResolver(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        addressresolver_rebuildCaches_destinations_58_0[6] = MixinResolver(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        addressresolver_rebuildCaches_destinations_58_0[7] = MixinResolver(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        addressresolver_rebuildCaches_destinations_58_0[8] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_rebuildCaches_destinations_58_0[9] = MixinResolver(0x34783A738DdC355cD7c737D4101b20622681332a);
        addressresolver_rebuildCaches_destinations_58_0[10] = MixinResolver(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        addressresolver_rebuildCaches_destinations_58_0[11] = MixinResolver(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        addressresolver_rebuildCaches_destinations_58_0[12] = MixinResolver(0xaE55F163337A2A46733AA66dA9F35299f9A46e9e);
        addressresolver_rebuildCaches_destinations_58_0[13] = MixinResolver(0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95);
        addressresolver_rebuildCaches_destinations_58_0[14] = MixinResolver(0xf86048DFf23cF130107dfB4e6386f574231a5C65);
        addressresolver_rebuildCaches_destinations_58_0[15] = MixinResolver(0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A);
        addressresolver_rebuildCaches_destinations_58_0[16] = MixinResolver(0xcF853f7f8F78B2B801095b66F8ba9c5f04dB1640);
        addressresolver_rebuildCaches_destinations_58_0[17] = MixinResolver(0x4ff54624D5FB61C34c634c3314Ed3BfE4dBB665a);
        addressresolver_rebuildCaches_destinations_58_0[18] = MixinResolver(0x001b7876F567f0b3A639332Ed1e363839c6d85e2);
        addressresolver_rebuildCaches_destinations_58_0[19] = MixinResolver(0x5Af0072617F7f2AEB0e314e2faD1DE0231Ba97cD);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_58_0);
    }

    function addressresolver_rebuildCaches_59() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_59_0 = new MixinResolver[](18);
        addressresolver_rebuildCaches_destinations_59_0[0] = MixinResolver(0xbCB2D435045E16B059b2130b28BE70b5cA47bFE5);
        addressresolver_rebuildCaches_destinations_59_0[1] = MixinResolver(0x4434f56ddBdE28fab08C4AE71970a06B300F8881);
        addressresolver_rebuildCaches_destinations_59_0[2] = MixinResolver(0xb147C69BEe211F57290a6cde9d1BAbfD0DCF3Ea3);
        addressresolver_rebuildCaches_destinations_59_0[3] = MixinResolver(0xad44873632840144fFC97b2D1de716f6E2cF0366);
        addressresolver_rebuildCaches_destinations_59_0[4] = MixinResolver(0xFe00395ec846240dc693e92AB2Dd720F94765Aa3);
        addressresolver_rebuildCaches_destinations_59_0[5] = MixinResolver(0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf);
        addressresolver_rebuildCaches_destinations_59_0[6] = MixinResolver(0x4Aa0dabd22BC0894975324Bec293443c8538bD08);
        addressresolver_rebuildCaches_destinations_59_0[7] = MixinResolver(0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632);
        addressresolver_rebuildCaches_destinations_59_0[8] = MixinResolver(0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558);
        addressresolver_rebuildCaches_destinations_59_0[9] = MixinResolver(0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf);
        addressresolver_rebuildCaches_destinations_59_0[10] = MixinResolver(0xd325B17d5C9C3f2B6853A760afCF81945b0184d3);
        addressresolver_rebuildCaches_destinations_59_0[11] = MixinResolver(new_PerpsV2MarketSettings_contract);
        addressresolver_rebuildCaches_destinations_59_0[12] = MixinResolver(0x517D0676E80115c1Aab36332B1732567Ce6D7010);
        addressresolver_rebuildCaches_destinations_59_0[13] = MixinResolver(0xa1245E5B52555e40aa8A3Ffb95C5C426c7c7ef12);
        addressresolver_rebuildCaches_destinations_59_0[14] = MixinResolver(0xfe4950F0D73014039BE3CE900d5dcD24Ded54cCB);
        addressresolver_rebuildCaches_destinations_59_0[15] = MixinResolver(0x36841F7Ff6fBD318202A5101F8426eBb051d5e4d);
        addressresolver_rebuildCaches_destinations_59_0[16] = MixinResolver(new_FuturesMarketManager_contract);
        addressresolver_rebuildCaches_destinations_59_0[17] = MixinResolver(new_PerpsV2ExchangeRate_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_59_0);
    }
}

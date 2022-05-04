pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../FuturesMarketSettings.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MirachOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319
    address public constant new_SystemSettings_contract = 0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319;
    // https://kovan-explorer.optimism.io/address/0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00
    address public constant new_Issuer_contract = 0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00;
    // https://kovan-explorer.optimism.io/address/0xE61d388DD2AA9F79f4fC708b630bC24B661D6934
    address public constant new_SynthetixBridgeToBase_contract = 0xE61d388DD2AA9F79f4fC708b630bC24B661D6934;
    // https://kovan-explorer.optimism.io/address/0x6D0C13aF650bA81798cf48632506Fcc3A38Ed644
    address public constant new_FuturesMarketXAG_contract = 0x6D0C13aF650bA81798cf48632506Fcc3A38Ed644;
    // https://kovan-explorer.optimism.io/address/0x01aac5868ee944F162C347FE9d43aa3229267CBd
    address public constant new_FuturesMarketXAU_contract = 0x01aac5868ee944F162C347FE9d43aa3229267CBd;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(futuresmarketsettings_i);
        contracts[3] = address(systemstatus_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        futuresmarketmanager_removeMarkets_0();
        futuresmarketmanager_addMarkets_1();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_2();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_3();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_4();

        futuresmarketsettings_i.setTakerFee("sWTI", 2500000000000000);

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

    function futuresmarketmanager_removeMarkets_0() internal {
        address[] memory futuresmarketmanager_removeMarkets_marketsToRemove_0_0 = new address[](7);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[0] = address(0x522aBb55e6f1e1E9E5Fccf5e8f3FeF3e31093530);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[1] = address(0x72CeE2960b65aa4d37DDb89b83b2adeB64d34d2E);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[2] = address(0x86BE944F673D77B93dc5F19655C915b002d42beb);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[3] = address(0x8C1D513188Cc86c1e8c9bE002F69f174016f1d17);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[4] = address(0x8e5691736079FebEfD8A634FC0d6eE0478Cc940b);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[5] = address(0x944E3E0cDE5daB927AB174bc22C4c0dA013436B6);
        futuresmarketmanager_removeMarkets_marketsToRemove_0_0[6] = address(0xe6c5F1dBde6aB671c60E511c2dC064f5F43BF988);
        futuresmarketmanager_i.removeMarkets(futuresmarketmanager_removeMarkets_marketsToRemove_0_0);
    }

    function futuresmarketmanager_addMarkets_1() internal {
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_1_0 = new address[](2);
        futuresmarketmanager_addMarkets_marketsToAdd_1_0[0] = address(new_FuturesMarketXAU_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_1_0[1] = address(new_FuturesMarketXAG_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_1_0);
    }

    function addressresolver_importAddresses_2() internal {
        bytes32[] memory addressresolver_importAddresses_names_2_0 = new bytes32[](5);
        addressresolver_importAddresses_names_2_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_2_0[1] = bytes32("Issuer");
        addressresolver_importAddresses_names_2_0[2] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_2_0[3] = bytes32("FuturesMarketXAG");
        addressresolver_importAddresses_names_2_0[4] = bytes32("FuturesMarketXAU");
        address[] memory addressresolver_importAddresses_destinations_2_1 = new address[](5);
        addressresolver_importAddresses_destinations_2_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_2_1[1] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_2_1[2] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_2_1[3] = address(new_FuturesMarketXAG_contract);
        addressresolver_importAddresses_destinations_2_1[4] = address(new_FuturesMarketXAU_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_2_0,
            addressresolver_importAddresses_destinations_2_1
        );
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xb205415386F4b1Da1A60Dd739BFf60761A99792f);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0xE8d1bd4DE9A0aB4aF9197c13E6029c4Ea4E14de3);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        addressresolver_rebuildCaches_destinations_3_0[17] = MixinResolver(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        addressresolver_rebuildCaches_destinations_3_0[18] = MixinResolver(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        addressresolver_rebuildCaches_destinations_3_0[19] = MixinResolver(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function addressresolver_rebuildCaches_4() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_4_0 = new MixinResolver[](7);
        addressresolver_rebuildCaches_destinations_4_0[0] = MixinResolver(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        addressresolver_rebuildCaches_destinations_4_0[1] = MixinResolver(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        addressresolver_rebuildCaches_destinations_4_0[2] = MixinResolver(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        addressresolver_rebuildCaches_destinations_4_0[3] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_4_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_4_0[5] = MixinResolver(new_FuturesMarketXAG_contract);
        addressresolver_rebuildCaches_destinations_4_0[6] = MixinResolver(new_FuturesMarketXAU_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_4_0);
    }
}

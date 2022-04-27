
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";

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

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00
    Issuer public constant issuer_i = Issuer(0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00);
    // https://kovan-explorer.optimism.io/address/0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319
    SystemSettings public constant systemsettings_i = SystemSettings(0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319
    address public constant new_SystemSettings_contract = 0x61560Fd10fff898b7C35ba9a56DA0F03FCa6A319;
    // https://kovan-explorer.optimism.io/address/0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00
    address public constant new_Issuer_contract = 0x1596A3bDf28A681D589a89Cd04dCFB9C4A763B00;
    // https://kovan-explorer.optimism.io/address/0xE61d388DD2AA9F79f4fC708b630bC24B661D6934
    address public constant new_SynthetixBridgeToBase_contract = 0xE61d388DD2AA9F79f4fC708b630bC24B661D6934;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(systemstatus_i);
        contracts[2]= address(issuer_i);
        contracts[3]= address(systemsettings_i);
    }

    function migrate() external onlyOwner {
        require(ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings", "Invalid contract supplied for SystemSettings");
        require(ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer", "Invalid contract supplied for Issuer");
        require(ISynthetixNamedContract(new_SynthetixBridgeToBase_contract).CONTRACT_NAME() == "SynthetixBridgeToBase", "Invalid contract supplied for SynthetixBridgeToBase");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_7();
        // Set the exchange rates for various synths;
        systemsettings_setExchangeFeeRateForSynths_8();

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

    
    function addressresolver_importAddresses_0() internal {
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](3);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthetixBridgeToBase");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xb205415386F4b1Da1A60Dd739BFf60761A99792f);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xE8d1bd4DE9A0aB4aF9197c13E6029c4Ea4E14de3);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](3);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    
    function issuer_addSynths_7() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_7_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_7_0[0] = ISynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        issuer_addSynths_synthsToAdd_7_0[1] = ISynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        issuer_addSynths_synthsToAdd_7_0[2] = ISynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        issuer_addSynths_synthsToAdd_7_0[3] = ISynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        issuer_addSynths_synthsToAdd_7_0[4] = ISynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        issuer_addSynths_synthsToAdd_7_0[5] = ISynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        issuer_addSynths_synthsToAdd_7_0[6] = ISynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        issuer_addSynths_synthsToAdd_7_0[7] = ISynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        issuer_addSynths_synthsToAdd_7_0[8] = ISynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        issuer_addSynths_synthsToAdd_7_0[9] = ISynth(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_7_0);
    }

    
    function systemsettings_setExchangeFeeRateForSynths_8() internal {
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0 = new bytes32[](1);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0[0] = bytes32("sUSD");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1 = new uint256[](1);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1[0] = uint256(3000000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0, systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1);
    }
}

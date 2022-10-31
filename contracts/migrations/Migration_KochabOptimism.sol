pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../interfaces/IIssuer.sol";
import "../interfaces/ICollateralManager.sol";
import "../CollateralShort.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_KochabOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x84Ec90f9CD4D00Ad95002d88D35f99cd9F66E393
    IIssuer public constant issuer_i = IIssuer(0x84Ec90f9CD4D00Ad95002d88D35f99cd9F66E393);
    // https://explorer.optimism.io/address/0x15E7D4972a3E477878A5867A47617122BE2d1fF0
    ICollateralManager public constant collateralmanager_i = ICollateralManager(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
    // https://explorer.optimism.io/address/0xeb4b5ABcE7310855319440d936cd3aDd77DFA193
    CollateralShort public constant collateralshort_i = CollateralShort(0xeb4b5ABcE7310855319440d936cd3aDd77DFA193);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x84Ec90f9CD4D00Ad95002d88D35f99cd9F66E393
    address public constant new_Issuer_contract = 0x84Ec90f9CD4D00Ad95002d88D35f99cd9F66E393;
    // https://explorer.optimism.io/address/0xeb4b5ABcE7310855319440d936cd3aDd77DFA193
    address public constant new_CollateralShort_contract = 0xeb4b5ABcE7310855319440d936cd3aDd77DFA193;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(issuer_i);
        contracts[3] = address(collateralmanager_i);
        contracts[4] = address(collateralshort_i);
    }

    function migrate() external onlyOwner {
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
        issuer_addSynths_6();
        // Ensure the CollateralManager has all Collateral contracts added;
        collateralmanager_addCollaterals_8();
        // Ensure the CollateralShort contract has all associated synths added;
        collateralshort_addSynths_9();
        // Ensure the CollateralShort contract has its issue fee rate set;
        collateralshort_i.setIssueFeeRate(4000000000000000);

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](2);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[1] = bytes32("CollateralShort");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_CollateralShort_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xE50124A0C087EC06a273D0B9886902273B02d4D8);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xE45A27fd3ad929866CEFc6786d8360fF6665c660);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x28CAb2c065bC0aAE84f6763e621B0b814C77922B);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xfff685537fdbD9CA07BD863Ac0b422863BF3114f);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x5b643DFC67f9701929A0b55f23e0Af61df50E75D);
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
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xc66499aCe3B6c6a30c784bE5511E8d338d543913);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_CollateralShort_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_6() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_6_0 = new ISynth[](13);
        issuer_addSynths_synthsToAdd_6_0[0] = ISynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        issuer_addSynths_synthsToAdd_6_0[1] = ISynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        issuer_addSynths_synthsToAdd_6_0[2] = ISynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        issuer_addSynths_synthsToAdd_6_0[3] = ISynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        issuer_addSynths_synthsToAdd_6_0[4] = ISynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        issuer_addSynths_synthsToAdd_6_0[5] = ISynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        issuer_addSynths_synthsToAdd_6_0[6] = ISynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        issuer_addSynths_synthsToAdd_6_0[7] = ISynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        issuer_addSynths_synthsToAdd_6_0[8] = ISynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        issuer_addSynths_synthsToAdd_6_0[9] = ISynth(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        issuer_addSynths_synthsToAdd_6_0[10] = ISynth(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        issuer_addSynths_synthsToAdd_6_0[11] = ISynth(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        issuer_addSynths_synthsToAdd_6_0[12] = ISynth(0x2eC164E5b91f9627193C0268F1462327e3D7EC68);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_6_0);
    }

    function collateralmanager_addCollaterals_8() internal {
        address[] memory collateralmanager_addCollaterals_collaterals_8_0 = new address[](1);
        collateralmanager_addCollaterals_collaterals_8_0[0] = address(new_CollateralShort_contract);
        collateralmanager_i.addCollaterals(collateralmanager_addCollaterals_collaterals_8_0);
    }

    function collateralshort_addSynths_9() internal {
        bytes32[] memory collateralshort_addSynths__synthNamesInResolver_9_0 = new bytes32[](8);
        collateralshort_addSynths__synthNamesInResolver_9_0[0] = bytes32("SynthsBTC");
        collateralshort_addSynths__synthNamesInResolver_9_0[1] = bytes32("SynthsETH");
        collateralshort_addSynths__synthNamesInResolver_9_0[2] = bytes32("SynthsLINK");
        collateralshort_addSynths__synthNamesInResolver_9_0[3] = bytes32("SynthsSOL");
        collateralshort_addSynths__synthNamesInResolver_9_0[4] = bytes32("SynthsAVAX");
        collateralshort_addSynths__synthNamesInResolver_9_0[5] = bytes32("SynthsMATIC");
        collateralshort_addSynths__synthNamesInResolver_9_0[6] = bytes32("SynthsUNI");
        collateralshort_addSynths__synthNamesInResolver_9_0[7] = bytes32("SynthsAAVE");
        bytes32[] memory collateralshort_addSynths__synthKeys_9_1 = new bytes32[](8);
        collateralshort_addSynths__synthKeys_9_1[0] = bytes32("sBTC");
        collateralshort_addSynths__synthKeys_9_1[1] = bytes32("sETH");
        collateralshort_addSynths__synthKeys_9_1[2] = bytes32("sLINK");
        collateralshort_addSynths__synthKeys_9_1[3] = bytes32("sSOL");
        collateralshort_addSynths__synthKeys_9_1[4] = bytes32("sAVAX");
        collateralshort_addSynths__synthKeys_9_1[5] = bytes32("sMATIC");
        collateralshort_addSynths__synthKeys_9_1[6] = bytes32("sUNI");
        collateralshort_addSynths__synthKeys_9_1[7] = bytes32("sAAVE");
        collateralshort_i.addSynths(
            collateralshort_addSynths__synthNamesInResolver_9_0,
            collateralshort_addSynths__synthKeys_9_1
        );
    }
}

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
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

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
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x274D1dbe298993EaD5AC1B25624F53786d16006e);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xcC02F000b0aA8a0eFC2B55C9cf2305Fb3531cca1);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x0681883084b5De1564FE2706C87affD77F1677D5);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
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
        ISynth[] memory issuer_addSynths_synthsToAdd_6_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_6_0[0] = ISynth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        issuer_addSynths_synthsToAdd_6_0[1] = ISynth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        issuer_addSynths_synthsToAdd_6_0[2] = ISynth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        issuer_addSynths_synthsToAdd_6_0[3] = ISynth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        issuer_addSynths_synthsToAdd_6_0[4] = ISynth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        issuer_addSynths_synthsToAdd_6_0[5] = ISynth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        issuer_addSynths_synthsToAdd_6_0[6] = ISynth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        issuer_addSynths_synthsToAdd_6_0[7] = ISynth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        issuer_addSynths_synthsToAdd_6_0[8] = ISynth(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        issuer_addSynths_synthsToAdd_6_0[9] = ISynth(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        issuer_addSynths_synthsToAdd_6_0[10] = ISynth(0xc66499aCe3B6c6a30c784bE5511E8d338d543913);
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

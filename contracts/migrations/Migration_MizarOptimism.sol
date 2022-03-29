pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MizarOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x81875E4A7b256762381F5ADf95dCb4324450B01F
    Issuer public constant issuer_i = Issuer(0x81875E4A7b256762381F5ADf95dCb4324450B01F);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x81875E4A7b256762381F5ADf95dCb4324450B01F
    address public constant new_Issuer_contract = 0x81875E4A7b256762381F5ADf95dCb4324450B01F;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](3);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );

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
        issuer_addSynths_5();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](1);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x14E6f8e6Da00a32C069b11b64e48EA1FEF2361D4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x8518f879a2B8138405E947A48326F55FF9D5f3aD);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x059681217E9186E007864AA16893b65A0589718B);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x0681883084b5De1564FE2706C87affD77F1677D5);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](1);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_Issuer_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_5() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_5_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_5_0[0] = ISynth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        issuer_addSynths_synthsToAdd_5_0[1] = ISynth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        issuer_addSynths_synthsToAdd_5_0[2] = ISynth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        issuer_addSynths_synthsToAdd_5_0[3] = ISynth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        issuer_addSynths_synthsToAdd_5_0[4] = ISynth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        issuer_addSynths_synthsToAdd_5_0[5] = ISynth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        issuer_addSynths_synthsToAdd_5_0[6] = ISynth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        issuer_addSynths_synthsToAdd_5_0[7] = ISynth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        issuer_addSynths_synthsToAdd_5_0[8] = ISynth(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        issuer_addSynths_synthsToAdd_5_0[9] = ISynth(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_5_0);
    }
}

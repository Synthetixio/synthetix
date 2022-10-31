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
contract Migration_AlgolOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x7EF2EDd3623312B9a82E25647e12F1c77D0Ea012
    Issuer public constant issuer_i = Issuer(0x7EF2EDd3623312B9a82E25647e12F1c77D0Ea012);
    // https://explorer.optimism.io/address/0x05E1b1Dff853B1D67828Aa5E8CB37cC25aA050eE
    SystemSettings public constant systemsettings_i = SystemSettings(0x05E1b1Dff853B1D67828Aa5E8CB37cC25aA050eE);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x05E1b1Dff853B1D67828Aa5E8CB37cC25aA050eE
    address public constant new_SystemSettings_contract = 0x05E1b1Dff853B1D67828Aa5E8CB37cC25aA050eE;
    // https://explorer.optimism.io/address/0x7EF2EDd3623312B9a82E25647e12F1c77D0Ea012
    address public constant new_Issuer_contract = 0x7EF2EDd3623312B9a82E25647e12F1c77D0Ea012;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(issuer_i);
        contracts[3] = address(systemsettings_i);
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
        // Set the penalty amount of SNX from a liquidated account;
        systemsettings_i.setSnxLiquidationPenalty(300000000000000000);
        // Set the penalty amount of Collateral from a liquidated account;
        systemsettings_i.setLiquidationPenalty(100000000000000000);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xFE8E48Bf36ccC3254081eC8C65965D1c8b2E744D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xcC02F000b0aA8a0eFC2B55C9cf2305Fb3531cca1);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x34783A738DdC355cD7c737D4101b20622681332a);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_6() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_6_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_6_0[0] = ISynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        issuer_addSynths_synthsToAdd_6_0[1] = ISynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        issuer_addSynths_synthsToAdd_6_0[2] = ISynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        issuer_addSynths_synthsToAdd_6_0[3] = ISynth(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        issuer_addSynths_synthsToAdd_6_0[4] = ISynth(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        issuer_addSynths_synthsToAdd_6_0[5] = ISynth(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        issuer_addSynths_synthsToAdd_6_0[6] = ISynth(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        issuer_addSynths_synthsToAdd_6_0[7] = ISynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        issuer_addSynths_synthsToAdd_6_0[8] = ISynth(0x34783A738DdC355cD7c737D4101b20622681332a);
        issuer_addSynths_synthsToAdd_6_0[9] = ISynth(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        issuer_addSynths_synthsToAdd_6_0[10] = ISynth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_6_0);
    }
}

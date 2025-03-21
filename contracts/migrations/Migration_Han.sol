pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";
import "../CollateralManager.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Han is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0x7A1b3DB73E5B8c58EDC8A821890005064f2B83Fd
    Issuer public constant issuer_i = Issuer(0x7A1b3DB73E5B8c58EDC8A821890005064f2B83Fd);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x7A1b3DB73E5B8c58EDC8A821890005064f2B83Fd
    address public constant new_Issuer_contract = 0x7A1b3DB73E5B8c58EDC8A821890005064f2B83Fd;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](3);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(issuer_i);
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
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xc5f0b4194455e0C175ab68C501400e46C7203504);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xFAd53Cc9480634563E8ec71E8e693Ffd07981d38);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x8e9757479D5ad4E7f9d951B60d39F5220b893d6c);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xf79603a71144e415730C1A6f57F366E4Ea962C00);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x83105D7CDd2fd9b8185BFF1cb56bB1595a618618);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xd1cad1A569E70d2Df4C8ed43d3cC93DBE16285dE);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xaeA0065E146FD75Dc24465961a583827284D405a);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x94f864e55c77E07C2C7BF7bFBc334b7a8123442A);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x38c8A4d93757D3D2E0110Cfb5f18B9cC293e0fdA);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](7);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x7A3d898b717e50a96fd8b232E9d15F0A547A7eeb);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_5() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_5_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_5_0[0] = ISynth(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        issuer_addSynths_synthsToAdd_5_0[1] = ISynth(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        issuer_addSynths_synthsToAdd_5_0[2] = ISynth(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        issuer_addSynths_synthsToAdd_5_0[3] = ISynth(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        issuer_addSynths_synthsToAdd_5_0[4] = ISynth(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        issuer_addSynths_synthsToAdd_5_0[5] = ISynth(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        issuer_addSynths_synthsToAdd_5_0[6] = ISynth(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        issuer_addSynths_synthsToAdd_5_0[7] = ISynth(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        issuer_addSynths_synthsToAdd_5_0[8] = ISynth(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        issuer_addSynths_synthsToAdd_5_0[9] = ISynth(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_5_0);
    }
}

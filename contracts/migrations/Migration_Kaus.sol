pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SynthetixState.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Kaus is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82
    SynthetixState public constant synthetixstate_i = SynthetixState(0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82);
    // https://etherscan.io/address/0xF67998902EBc37d885ad310C2430C822Ca981E1E
    Issuer public constant issuer_i = Issuer(0xF67998902EBc37d885ad310C2430C822Ca981E1E);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    address public constant new_ProxySynthetix_contract = 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F;
    // https://etherscan.io/address/0x08118E04F58d7863b4fCF1de0e07c83a2541b89e
    address public constant new_DebtCache_contract = 0x08118E04F58d7863b4fCF1de0e07c83a2541b89e;
    // https://etherscan.io/address/0xF67998902EBc37d885ad310C2430C822Ca981E1E
    address public constant new_Issuer_contract = 0xF67998902EBc37d885ad310C2430C822Ca981E1E;
    // https://etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    address public constant new_ProxysUSD_contract = 0x57Ab1ec28D129707052df4dF418D58a2D46d5f51;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](3);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(synthetixstate_i);
        contracts[2] = address(issuer_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(
            ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache",
            "Invalid contract supplied for DebtCache"
        );
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
        // Ensure that Synthetix can write to its State contract;
        synthetixstate_i.setAssociatedContract(new_Issuer_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_6();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](4);
        addressresolver_importAddresses_names_0_0[0] = bytes32("ProxySynthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[3] = bytes32("ProxysUSD");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](4);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ProxySynthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_ProxysUSD_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x7634F2A1741a683ccda37Dce864c187F990D7B4b);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x510adfDF6E7554C571b7Cd9305Ce91473610015e);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x54f25546260C7539088982bcF4b7dC8EDEF19f21);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xCd9D4988C0AE61887B075bA77f08cbFAd2b65068);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xC61b352fCc311Ae6B0301459A970150005e74b3E);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x388fD1A8a7d36e03eFA1ab100a1c5159a3A3d427);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x37B648a07476F4941D3D647f81118AFd55fa8a04);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xEF285D339c91aDf1dD7DE0aEAa6250805FD68258);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xcf9bB94b5d65589039607BA66e3DAC686d3eFf01);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xCeC4e038371d32212C6Dcdf36Fdbcb6F8a34C6d8);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xCFA46B4923c0E75B7b84E9FBde70ED26feFefBf6);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xcd980Fc5CcdAe62B18A52b83eC64200121A929db);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xC22e51FA362654ea453B4018B616ef6f6ab3b779);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xaB38249f4f56Ef868F6b5E01D9cFa26B952c1270);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xfD0435A588BF5c5a6974BA19Fa627b772833d4eb);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x46A7Af405093B27DA6DeF193C508Bd9240A255FA);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_6() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_6_0 = new ISynth[](14);
        issuer_addSynths_synthsToAdd_6_0[0] = ISynth(0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b);
        issuer_addSynths_synthsToAdd_6_0[1] = ISynth(0xC61b352fCc311Ae6B0301459A970150005e74b3E);
        issuer_addSynths_synthsToAdd_6_0[2] = ISynth(0x388fD1A8a7d36e03eFA1ab100a1c5159a3A3d427);
        issuer_addSynths_synthsToAdd_6_0[3] = ISynth(0x37B648a07476F4941D3D647f81118AFd55fa8a04);
        issuer_addSynths_synthsToAdd_6_0[4] = ISynth(0xEF285D339c91aDf1dD7DE0aEAa6250805FD68258);
        issuer_addSynths_synthsToAdd_6_0[5] = ISynth(0xcf9bB94b5d65589039607BA66e3DAC686d3eFf01);
        issuer_addSynths_synthsToAdd_6_0[6] = ISynth(0xCeC4e038371d32212C6Dcdf36Fdbcb6F8a34C6d8);
        issuer_addSynths_synthsToAdd_6_0[7] = ISynth(0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9);
        issuer_addSynths_synthsToAdd_6_0[8] = ISynth(0xCFA46B4923c0E75B7b84E9FBde70ED26feFefBf6);
        issuer_addSynths_synthsToAdd_6_0[9] = ISynth(0xcd980Fc5CcdAe62B18A52b83eC64200121A929db);
        issuer_addSynths_synthsToAdd_6_0[10] = ISynth(0xC22e51FA362654ea453B4018B616ef6f6ab3b779);
        issuer_addSynths_synthsToAdd_6_0[11] = ISynth(0xaB38249f4f56Ef868F6b5E01D9cFa26B952c1270);
        issuer_addSynths_synthsToAdd_6_0[12] = ISynth(0xfD0435A588BF5c5a6974BA19Fa627b772833d4eb);
        issuer_addSynths_synthsToAdd_6_0[13] = ISynth(0x46A7Af405093B27DA6DeF193C508Bd9240A255FA);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_6_0);
    }
}

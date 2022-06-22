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
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0xA727916250F1d0e1190b9CAdfaD75aCBbFC8B8ce
    Issuer public constant issuer_i = Issuer(0xA727916250F1d0e1190b9CAdfaD75aCBbFC8B8ce);
    // https://kovan-explorer.optimism.io/address/0x56D751dbE802fb91C3e6389c0e442B4cC8cAb78C
    SystemSettings public constant systemsettings_i = SystemSettings(0x56D751dbE802fb91C3e6389c0e442B4cC8cAb78C);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x56D751dbE802fb91C3e6389c0e442B4cC8cAb78C
    address public constant new_SystemSettings_contract = 0x56D751dbE802fb91C3e6389c0e442B4cC8cAb78C;
    // https://kovan-explorer.optimism.io/address/0xA727916250F1d0e1190b9CAdfaD75aCBbFC8B8ce
    address public constant new_Issuer_contract = 0xA727916250F1d0e1190b9CAdfaD75aCBbFC8B8ce;

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
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xE50124A0C087EC06a273D0B9886902273B02d4D8);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xE45A27fd3ad929866CEFc6786d8360fF6665c660);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x75d83253021b7874DF52B1f954Eb70AcA918a537);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xfff685537fdbD9CA07BD863Ac0b422863BF3114f);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x5b643DFC67f9701929A0b55f23e0Af61df50E75D);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xCB2A226c20f404d7fcFC3eC95B38D06877284527);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x9C570575586ba29ed8a2523639865fF131F59411);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x2269411619c1FF9C02F251167d583450EB1E4847);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x1a77afdFa733292C17975e83b08091674A8FF3B4);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xDe64a263c044e193B50d5eafd5EDD330997EA39e);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](7);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x042c26bBa8741B9b277695426861c09dD1c41366);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xc696eB9b1726256bd2039a322aBBd48bD389dEF4);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xe97b8152CB74ED9935d2f8b2C09331415A6ba856);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_Issuer_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_6() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_6_0 = new ISynth[](13);
        issuer_addSynths_synthsToAdd_6_0[0] = ISynth(0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95);
        issuer_addSynths_synthsToAdd_6_0[1] = ISynth(0xCB2A226c20f404d7fcFC3eC95B38D06877284527);
        issuer_addSynths_synthsToAdd_6_0[2] = ISynth(0x9C570575586ba29ed8a2523639865fF131F59411);
        issuer_addSynths_synthsToAdd_6_0[3] = ISynth(0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454);
        issuer_addSynths_synthsToAdd_6_0[4] = ISynth(0x2269411619c1FF9C02F251167d583450EB1E4847);
        issuer_addSynths_synthsToAdd_6_0[5] = ISynth(0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958);
        issuer_addSynths_synthsToAdd_6_0[6] = ISynth(0x1a77afdFa733292C17975e83b08091674A8FF3B4);
        issuer_addSynths_synthsToAdd_6_0[7] = ISynth(0xDe64a263c044e193B50d5eafd5EDD330997EA39e);
        issuer_addSynths_synthsToAdd_6_0[8] = ISynth(0x042c26bBa8741B9b277695426861c09dD1c41366);
        issuer_addSynths_synthsToAdd_6_0[9] = ISynth(0xc696eB9b1726256bd2039a322aBBd48bD389dEF4);
        issuer_addSynths_synthsToAdd_6_0[10] = ISynth(0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B);
        issuer_addSynths_synthsToAdd_6_0[11] = ISynth(0xe97b8152CB74ED9935d2f8b2C09331415A6ba856);
        issuer_addSynths_synthsToAdd_6_0[12] = ISynth(0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_6_0);
    }
}


pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MirzamOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8
    ExchangeState public constant exchangestate_i = ExchangeState(0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8);
    // https://explorer.optimism.io/address/0xf83c5f65dBef4017CD19Ae99b15E1B8649AdbEb4
    SystemStatus public constant systemstatus_i = SystemStatus(0xf83c5f65dBef4017CD19Ae99b15E1B8649AdbEb4);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x5a439C235C8BB9F813C5b45Dc194A00EC23CB78E
    address public constant new_Exchanger_contract = 0x5a439C235C8BB9F813C5b45Dc194A00EC23CB78E;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](3);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(exchangestate_i);
        contracts[2]= address(systemstatus_i);
    }

    function migrate() external onlyOwner {
        require(ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger", "Invalid contract supplied for Exchanger");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Exchanger contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_Exchanger_contract, true, false);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x20eBfbdD14c9D8093E9AC33e736Ac61bbaC90092);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x01f8C5e421172B67cc14B7f5F369cfb10de0acD4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xA2412e0654CdD40F5677Aaad1a0c572e75dF246C);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_Exchanger_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

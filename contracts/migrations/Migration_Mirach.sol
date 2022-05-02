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
contract Migration_Mirach is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0x648727A32112e6C233c1c5d8d57A9AA736FfB18B
    SystemStatus public constant systemstatus_i = SystemStatus(0x648727A32112e6C233c1c5d8d57A9AA736FfB18B);
    // https://kovan.etherscan.io/address/0xAb6dA3A3C7428606851f2bd33C118B2a77183578
    Issuer public constant issuer_i = Issuer(0xAb6dA3A3C7428606851f2bd33C118B2a77183578);
    // https://kovan.etherscan.io/address/0xa090A311Aa4FEb1399D4463c44B357D05E41946c
    SystemSettings public constant systemsettings_i = SystemSettings(0xa090A311Aa4FEb1399D4463c44B357D05E41946c);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan.etherscan.io/address/0xa090A311Aa4FEb1399D4463c44B357D05E41946c
    address public constant new_SystemSettings_contract = 0xa090A311Aa4FEb1399D4463c44B357D05E41946c;
    // https://kovan.etherscan.io/address/0x828d4F922E446c76E2D0e0582EAa38acc4d793a2
    address public constant new_SynthetixBridgeToOptimism_contract = 0x828d4F922E446c76E2D0e0582EAa38acc4d793a2;
    // https://kovan.etherscan.io/address/0xAb6dA3A3C7428606851f2bd33C118B2a77183578
    address public constant new_Issuer_contract = 0xAb6dA3A3C7428606851f2bd33C118B2a77183578;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(issuer_i);
        contracts[3] = address(systemsettings_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_SynthetixBridgeToOptimism_contract).CONTRACT_NAME() == "SynthetixBridgeToOptimism",
            "Invalid contract supplied for SynthetixBridgeToOptimism"
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
        addressresolver_importAddresses_names_0_0[1] = bytes32("SynthetixBridgeToOptimism");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SynthetixBridgeToOptimism_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_SynthetixBridgeToOptimism_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x0f46148D93b52e2B503fE84897609913Cba42B7A);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x42B340961496731B0c4337E2A600087A2368DfCF);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x80a371e65dB3dD35b39d094AED82c28bafeA9A65);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xD63db8cD2dbFd7E0999D8D58C94d9ECF0004e180);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x4bd5B027679E630e11BE8F34a0354ee88c3e84db);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xB26c16491869Eb115362CE6dd456C4786bf10B3E);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x151af739E74589320C3Db8852C806F28073928B1);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xdFd88Db048F5dBe7a42593556E607675C6D912f5);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x894235628D36aA617ad5EE49A3763b287F506204);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x821621D141584dB05aE9593f6E42BfC6ebA90462);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x23d4b4D2318aFAA26205c21192696aDb64BA86c2);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xA86F796336C821340619174dB7B46c4d492AF2A4);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_7() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_7_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_7_0[0] = ISynth(0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226);
        issuer_addSynths_synthsToAdd_7_0[1] = ISynth(0xB26c16491869Eb115362CE6dd456C4786bf10B3E);
        issuer_addSynths_synthsToAdd_7_0[2] = ISynth(0x151af739E74589320C3Db8852C806F28073928B1);
        issuer_addSynths_synthsToAdd_7_0[3] = ISynth(0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426);
        issuer_addSynths_synthsToAdd_7_0[4] = ISynth(0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56);
        issuer_addSynths_synthsToAdd_7_0[5] = ISynth(0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85);
        issuer_addSynths_synthsToAdd_7_0[6] = ISynth(0xdFd88Db048F5dBe7a42593556E607675C6D912f5);
        issuer_addSynths_synthsToAdd_7_0[7] = ISynth(0x894235628D36aA617ad5EE49A3763b287F506204);
        issuer_addSynths_synthsToAdd_7_0[8] = ISynth(0x821621D141584dB05aE9593f6E42BfC6ebA90462);
        issuer_addSynths_synthsToAdd_7_0[9] = ISynth(0x23d4b4D2318aFAA26205c21192696aDb64BA86c2);
        issuer_addSynths_synthsToAdd_7_0[10] = ISynth(0xA86F796336C821340619174dB7B46c4d492AF2A4);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_7_0);
    }

    function systemsettings_setExchangeFeeRateForSynths_8() internal {
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0 = new bytes32[](1);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0[0] = bytes32("sUSD");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1 = new uint256[](1);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1[0] = uint256(3000000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(
            systemsettings_setExchangeFeeRateForSynths_synthKeys_8_0,
            systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_8_1
        );
    }
}

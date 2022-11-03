pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Suhail is BaseMigration {
    // https://goerli.etherscan.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli.etherscan.io/address/0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB
    AddressResolver public constant addressresolver_i = AddressResolver(0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB);
    // https://goerli.etherscan.io/address/0x4023B3Bf1749725584B0a467406C5bb24DA3AC4e
    ExchangeState public constant exchangestate_i = ExchangeState(0x4023B3Bf1749725584B0a467406C5bb24DA3AC4e);
    // https://goerli.etherscan.io/address/0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3
    SystemStatus public constant systemstatus_i = SystemStatus(0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3);
    // https://goerli.etherscan.io/address/0xC6fEa2a12a8a9e11232b18DC4d9D525F02180247
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0xC6fEa2a12a8a9e11232b18DC4d9D525F02180247);
    // https://goerli.etherscan.io/address/0x35a3F27736955394ee27Ce5348854670CE8D31DF
    Issuer public constant issuer_i = Issuer(0x35a3F27736955394ee27Ce5348854670CE8D31DF);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli.etherscan.io/address/0x063E110E614474Aa1FFB36936aBED4b1d173e5fc
    address public constant new_SystemSettings_contract = 0x063E110E614474Aa1FFB36936aBED4b1d173e5fc;
    // https://goerli.etherscan.io/address/0xC6fEa2a12a8a9e11232b18DC4d9D525F02180247
    address public constant new_ExchangeRates_contract = 0xC6fEa2a12a8a9e11232b18DC4d9D525F02180247;
    // https://goerli.etherscan.io/address/0x6Ce575c870ce744e245Ef8400b6d89412C35c328
    address public constant new_Exchanger_contract = 0x6Ce575c870ce744e245Ef8400b6d89412C35c328;
    // https://goerli.etherscan.io/address/0x35a3F27736955394ee27Ce5348854670CE8D31DF
    address public constant new_Issuer_contract = 0x35a3F27736955394ee27Ce5348854670CE8D31DF;
    // https://goerli.etherscan.io/address/0x79654872398a5C667455058890B29B081Ed47939
    address public constant new_DirectIntegrationManager_contract = 0x79654872398a5C667455058890B29B081Ed47939;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangestate_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(exchangerates_i);
        contracts[4] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
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
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xA39434A63A52E749F02807ae27335515BA4b07F7);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x48731cF7e84dc94C5f84577882c14Be11a5B7456);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xA39434A63A52E749F02807ae27335515BA4b07F7);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_15();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](5);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[4] = bytes32("DirectIntegrationManager");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](5);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_DirectIntegrationManager_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xac0BE3b71d0bd224FCF83654e5aC2d2c9e2817BC);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xc30BECA82f1f60DC0e4d3490428525985eef4D74);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x183B4A053CbA70a420E581918008Ef8e65d95E05);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xf1D0Ee19af243bcbC140A2259290B490E4df92A9);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x1427Bc44755d9Aa317535B1feE38922760Aa4e65);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x9B79D6dFe4650d70f35dbb80f7d1EC0Cf7f823Fd);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x4556b9761b2aC071D1665FAe01faA255a53d1307);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x814AAB41E07D2c3fA53C0c6f3002cD654a4489EE);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x86bfC5Be44f5DE1673824c0d0d1CCEA1306cD40e);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x7D2bEB18a21468808E16fD1fbe9637eFa98D0777);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x0376Bdaf9C97E2e454C83e728154eC621df23958);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x6d20C286D94a603A1cdE80D1f8e5f44Bc22550C0);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x4187a6CecB490F5154c04514410a928191830443);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x9D9aAf3ED4E4A708834F148f9b9d0d12Ba0a8034);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x6eab29a0904d0fd964AdE1F6c3ab1584E36602aE);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](7);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x4300a068B3826aCEFaE7062b411aF467a34Bf3A6);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x671C874C43B571878D6a90C5AA27288096eEac21);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x601A1Cf1a34d9cF0020dCCD361c155Fe54CE24fB);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x32A0BAA5Acec418a85Fd032f0292893B8E4f743B);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_DirectIntegrationManager_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_15() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_15_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_15_0[0] = ISynth(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        issuer_addSynths_synthsToAdd_15_0[1] = ISynth(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        issuer_addSynths_synthsToAdd_15_0[2] = ISynth(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_15_0);
    }
}

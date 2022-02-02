
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRates.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlsephinaOptimism is BaseMigration {
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
    // https://explorer.optimism.io/address/0xB4437efD22B4CCe7E25B3c47A469BC719cBdB60c
    ExchangeRates public constant exchangerates_i = ExchangeRates(0xB4437efD22B4CCe7E25B3c47A469BC719cBdB60c);
    // https://explorer.optimism.io/address/0x28224ef515d01709916F5ac4D8a72664A7b56e98
    SystemSettings public constant systemsettings_i = SystemSettings(0x28224ef515d01709916F5ac4D8a72664A7b56e98);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xB4437efD22B4CCe7E25B3c47A469BC719cBdB60c
    address public constant new_ExchangeRates_contract = 0xB4437efD22B4CCe7E25B3c47A469BC719cBdB60c;
    // https://explorer.optimism.io/address/0x28224ef515d01709916F5ac4D8a72664A7b56e98
    address public constant new_SystemSettings_contract = 0x28224ef515d01709916F5ac4D8a72664A7b56e98;
    // https://explorer.optimism.io/address/0x11Ac553488b2170A9ad751A5455d0C9A134C982f
    address public constant new_Exchanger_contract = 0x11Ac553488b2170A9ad751A5455d0C9A134C982f;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(exchangestate_i);
        contracts[2]= address(systemstatus_i);
        contracts[3]= address(exchangerates_i);
        contracts[4]= address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyOwner {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates", "Invalid contract supplied for ExchangeRates");
        require(ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings", "Invalid contract supplied for SystemSettings");
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
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x588e1f339910c21c7E4864048E37017AafF4cBc6);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0xA969bEB73d918f6100163Cd0fba3C586C269bee1);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0xA969bEB73d918f6100163Cd0fba3C586C269bee1);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xc326371d4D866C6Ff522E69298e36Fe75797D358);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x74d6B50283AC1D651f9Afdc33521e4c1E3332b78);
        // Set exchange dynamic fee threshold (SIP-184);
        systemsettings_i.setExchangeDynamicFeeThreshold(4000000000000000);
        // Set exchange dynamic fee weight decay (SIP-184);
        systemsettings_i.setExchangeDynamicFeeWeightDecay(900000000000000000);
        // Set exchange dynamic fee rounds (SIP-184);
        systemsettings_i.setExchangeDynamicFeeRounds(10);
        // Set exchange max dynamic fee (SIP-184);
        systemsettings_i.setExchangeMaxDynamicFee(50000000000000000);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x14E6f8e6Da00a32C069b11b64e48EA1FEF2361D4);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x01f8C5e421172B67cc14B7f5F369cfb10de0acD4);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xA2412e0654CdD40F5677Aaad1a0c572e75dF246C);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xD21969A86Ce5c41aAb2D492a0F802AA3e015cd9A);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x20eBfbdD14c9D8093E9AC33e736Ac61bbaC90092);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

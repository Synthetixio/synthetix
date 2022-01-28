pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRates.sol";
import "../MultiCollateralSynth.sol";
import "../MultiCollateralSynth.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlsephinaOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0xA6B255CB2Bd5Ad5f3EaE2D246ec1c2c3F7F79574
    SystemStatus public constant systemstatus_i = SystemStatus(0xA6B255CB2Bd5Ad5f3EaE2D246ec1c2c3F7F79574);
    // https://kovan-explorer.optimism.io/address/0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2
    ExchangeRates public constant exchangerates_i = ExchangeRates(0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2);
    // https://kovan-explorer.optimism.io/address/0xE73EB48B9E725E563775fF38cb67Ae09bF34c791
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
    // https://kovan-explorer.optimism.io/address/0x319D190584248280e3084A4692C6472A8dA5CA26
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0x319D190584248280e3084A4692C6472A8dA5CA26);
    // https://kovan-explorer.optimism.io/address/0x0A40F66D5759236A2FE0058F2a47fD9A5FF198Ae
    SystemSettings public constant systemsettings_i = SystemSettings(0x0A40F66D5759236A2FE0058F2a47fD9A5FF198Ae);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x415bE5d790F51fabF4321Be402917DB518a09Ef3
    address public constant new_SystemSettingsLib_contract = 0x415bE5d790F51fabF4321Be402917DB518a09Ef3;
    // https://kovan-explorer.optimism.io/address/0x0A40F66D5759236A2FE0058F2a47fD9A5FF198Ae
    address public constant new_SystemSettings_contract = 0x0A40F66D5759236A2FE0058F2a47fD9A5FF198Ae;
    // https://kovan-explorer.optimism.io/address/0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2
    address public constant new_ExchangeRates_contract = 0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2;
    // https://kovan-explorer.optimism.io/address/0x65a200D47Ef8BABb624E4571b43981f56d6f7a64
    address public constant new_Exchanger_contract = 0x65a200D47Ef8BABb624E4571b43981f56d6f7a64;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangestate_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(exchangerates_i);
        contracts[4] = address(synthslink_i);
        contracts[5] = address(synthsuni_i);
        contracts[6] = address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyOwner {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
        );

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
        exchangerates_i.addAggregator("SNX", 0x38D2f492B4Ef886E71D111c592c9338374e1bd8d);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUNI();
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
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
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xFC6D35EB364951953FD86bb8A1a5b0ba8Cbb6Eb2);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x42d9ac3ebebb9479f24360847350b4F7EADECE50);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x5c9AD159E8fC9DC2dD081872dA56961e0B43d6AD);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x129fd2f3a799bD156e8c00599760AfC2f0f953dA);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x099B3881d63d3Eef0ec32783Aa64B726672213E2);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x319D190584248280e3084A4692C6472A8dA5CA26);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan-explorer.optimism.io/address/0xe5671C038739F8D71b11A5F78888e520356BFCD5;
        Synth existingSynth = Synth(0xe5671C038739F8D71b11A5F78888e520356BFCD5);
        // https://kovan-explorer.optimism.io/address/0xE73EB48B9E725E563775fF38cb67Ae09bF34c791;
        Synth newSynth = Synth(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://kovan-explorer.optimism.io/address/0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b;
        Synth existingSynth = Synth(0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b);
        // https://kovan-explorer.optimism.io/address/0x319D190584248280e3084A4692C6472A8dA5CA26;
        Synth newSynth = Synth(0x319D190584248280e3084A4692C6472A8dA5CA26);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }
}

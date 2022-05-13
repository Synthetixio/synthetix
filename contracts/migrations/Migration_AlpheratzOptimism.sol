pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeState.sol";
import "../Issuer.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlpheratzOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x0064A673267696049938AA47595dD0B3C2e705A1
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x0064A673267696049938AA47595dD0B3C2e705A1);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C
    TokenState public constant tokenstatesynthetix_i = TokenState(0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C);
    // https://kovan-explorer.optimism.io/address/0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB);
    // https://kovan-explorer.optimism.io/address/0x638CCdbB9A014a73FA9b112962A754673582C7e7
    Issuer public constant issuer_i = Issuer(0x638CCdbB9A014a73FA9b112962A754673582C7e7);
    // https://kovan-explorer.optimism.io/address/0x8567bBd72aE1639b8EA378eF108a9614e6Ce8081
    SystemSettings public constant systemsettings_i = SystemSettings(0x8567bBd72aE1639b8EA378eF108a9614e6Ce8081);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x8567bBd72aE1639b8EA378eF108a9614e6Ce8081
    address public constant new_SystemSettings_contract = 0x8567bBd72aE1639b8EA378eF108a9614e6Ce8081;
    // https://kovan-explorer.optimism.io/address/0xE45A27fd3ad929866CEFc6786d8360fF6665c660
    address public constant new_LiquidatorRewards_contract = 0xE45A27fd3ad929866CEFc6786d8360fF6665c660;
    // https://kovan-explorer.optimism.io/address/0xE50124A0C087EC06a273D0B9886902273B02d4D8
    address public constant new_Liquidator_contract = 0xE50124A0C087EC06a273D0B9886902273B02d4D8;
    // https://kovan-explorer.optimism.io/address/0x01eBf544794F7f38d1e937BeA1c15F952ced7c62
    address public constant new_Synthetix_contract = 0x01eBf544794F7f38d1e937BeA1c15F952ced7c62;
    // https://kovan-explorer.optimism.io/address/0xfff685537fdbD9CA07BD863Ac0b422863BF3114f
    address public constant new_Exchanger_contract = 0xfff685537fdbD9CA07BD863Ac0b422863BF3114f;
    // https://kovan-explorer.optimism.io/address/0x638CCdbB9A014a73FA9b112962A754673582C7e7
    address public constant new_Issuer_contract = 0x638CCdbB9A014a73FA9b112962A754673582C7e7;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(tokenstatesynthetix_i);
        contracts[5] = address(rewardsdistribution_i);
        contracts[6] = address(issuer_i);
        contracts[7] = address(systemsettings_i);
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_3();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_15();
        // Set the penalty for self liquidation of an account;
        systemsettings_i.setSelfLiquidationPenalty(200000000000000000);
        // Set the duration of how long liquidation rewards are escrowed for;
        systemsettings_i.setLiquidationEscrowDuration(31536000);
        // Set the reward amount for flagging an account for liquidation;
        systemsettings_i.setFlagReward(1000000000000000000);
        // Set the reward amount for peforming a liquidation;
        systemsettings_i.setLiquidateReward(2000000000000000000);

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](6);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("LiquidatorRewards");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[5] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](6);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_LiquidatorRewards_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_LiquidatorRewards_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x5b643DFC67f9701929A0b55f23e0Af61df50E75D);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x2eC164E5b91f9627193C0268F1462327e3D7EC68);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x698E403AaC625345C6E5fC2D0042274350bEDf78);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x1e28378F64bC04E872a9D01Eb261926717346F98);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x1991bEA1eB08a78701F3330934B2301Fc6520AbA);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x8e0df45f66E620F85dF1D0490Cd2b19E57a4232A);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x86BE944F673D77B93dc5F19655C915b002d42beb);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x944E3E0cDE5daB927AB174bc22C4c0dA013436B6);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x929d8EC9A885cdCfdF28EA31B4A356532757DE5E);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x8C1D513188Cc86c1e8c9bE002F69f174016f1d17);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x522aBb55e6f1e1E9E5Fccf5e8f3FeF3e31093530);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x72CeE2960b65aa4d37DDb89b83b2adeB64d34d2E);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xe6c5F1dBde6aB671c60E511c2dC064f5F43BF988);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](6);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x8e5691736079FebEfD8A634FC0d6eE0478Cc940b);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xd33773480c9b05FDC22359d51992DCE704bDa1d2);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function issuer_addSynths_15() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_15_0 = new ISynth[](13);
        issuer_addSynths_synthsToAdd_15_0[0] = ISynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        issuer_addSynths_synthsToAdd_15_0[1] = ISynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        issuer_addSynths_synthsToAdd_15_0[2] = ISynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        issuer_addSynths_synthsToAdd_15_0[3] = ISynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        issuer_addSynths_synthsToAdd_15_0[4] = ISynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        issuer_addSynths_synthsToAdd_15_0[5] = ISynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        issuer_addSynths_synthsToAdd_15_0[6] = ISynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        issuer_addSynths_synthsToAdd_15_0[7] = ISynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        issuer_addSynths_synthsToAdd_15_0[8] = ISynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        issuer_addSynths_synthsToAdd_15_0[9] = ISynth(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        issuer_addSynths_synthsToAdd_15_0[10] = ISynth(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        issuer_addSynths_synthsToAdd_15_0[11] = ISynth(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        issuer_addSynths_synthsToAdd_15_0[12] = ISynth(0x2eC164E5b91f9627193C0268F1462327e3D7EC68);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_15_0);
    }
}

pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardsDistribution.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_NaosOptimism is BaseMigration {
    // https://goerli-explorer.optimism.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli-explorer.optimism.io/address/0x1d551351613a28d676BaC1Af157799e201279198
    AddressResolver public constant addressresolver_i = AddressResolver(0x1d551351613a28d676BaC1Af157799e201279198);
    // https://goerli-explorer.optimism.io/address/0x2E5ED97596a8368EB9E44B1f3F25B2E813845303
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x2E5ED97596a8368EB9E44B1f3F25B2E813845303);
    // https://goerli-explorer.optimism.io/address/0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916
    SystemStatus public constant systemstatus_i = SystemStatus(0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916);
    // https://goerli-explorer.optimism.io/address/0xB9525040A5B6a2d9e013240397079Fd1320559C4
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0xB9525040A5B6a2d9e013240397079Fd1320559C4);
    // https://goerli-explorer.optimism.io/address/0xb12704F8BddA7CF3eBa5F9A463404D4ba5d0e282
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xb12704F8BddA7CF3eBa5F9A463404D4ba5d0e282);
    // https://goerli-explorer.optimism.io/address/0x42E3288434a04283C55C50D8f61056a955F3bbFA
    Issuer public constant issuer_i = Issuer(0x42E3288434a04283C55C50D8f61056a955F3bbFA);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli-explorer.optimism.io/address/0xB8779a07186ae7555f96eb276925c5B5b7bE4096
    address public constant new_Synthetix_contract = 0xB8779a07186ae7555f96eb276925c5B5b7bE4096;
    // https://goerli-explorer.optimism.io/address/0x42E3288434a04283C55C50D8f61056a955F3bbFA
    address public constant new_Issuer_contract = 0x42E3288434a04283C55C50D8f61056a955F3bbFA;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_8();

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](18);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xF6C92Ad11fa67b7b685aDb435FbE932c049B670c);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x5e042334B5Bb0434aB2512d16FfcD4Db61F94f18);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x1c6C0a89064206e397E75b11Bcd370E8A8A007B4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x164724726608622b6e5Fa1aF8932b45A7Bd1a94D);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x08fb827Ee5A00232aDe347964225Ba4344665eD5);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xD2b3F0Ea40dB68088415412b0043F37B3088836D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x3c710172e7f95aCAaDeD243982a90F8F235fF9f1);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x216EaF79575563A5e13227ad075850cDeb004083);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xFdb50671276DbC9D24D68b272B54dE4a87aaCc6c);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x2A8338199D802620B4516a557195a498595d7Eb6);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x0440f82444C825a0842f50e1c25cb68676d736e3);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function issuer_addSynths_8() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_8_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_8_0[0] = ISynth(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        issuer_addSynths_synthsToAdd_8_0[1] = ISynth(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        issuer_addSynths_synthsToAdd_8_0[2] = ISynth(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_8_0);
    }
}

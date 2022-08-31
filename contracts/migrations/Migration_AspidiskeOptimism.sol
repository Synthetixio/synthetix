pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardsDistribution.sol";
import "../RewardEscrowV2Storage.sol";
import "../BaseRewardEscrowV2.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AspidiskeOptimism is BaseMigration {
    // https://goerli-explorer.optimism.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

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
    // https://goerli-explorer.optimism.io/address/0xFdB31235cDFe68bfFD1d687AC3A2b31E80eacf0d
    RewardEscrowV2Storage public constant rewardescrowv2storage_i =
        RewardEscrowV2Storage(0xFdB31235cDFe68bfFD1d687AC3A2b31E80eacf0d);
    // https://goerli-explorer.optimism.io/address/0x5F0CCaBe97bF838c777F08702E17EC300FF78cD0
    Issuer public constant issuer_i = Issuer(0x5F0CCaBe97bF838c777F08702E17EC300FF78cD0);
    // https://goerli-explorer.etherscan.io/address/0x6dd94459B5A844a6739c2b38a9E6d6b165cE45D9
    BaseRewardEscrowV2 public constant rewardescrowv2frozen_i =
        BaseRewardEscrowV2(0x6dd94459B5A844a6739c2b38a9E6d6b165cE45D9);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli-explorer.optimism.io/address/0x32A0BAA5Acec418a85Fd032f0292893B8E4f743B
    address public constant new_RewardEscrowV2_contract = 0x32A0BAA5Acec418a85Fd032f0292893B8E4f743B;
    // https://goerli-explorer.optimism.io/address/0xD134Db47DDF5A6feB245452af17cCAf92ee53D3c
    address public constant new_Synthetix_contract = 0xD134Db47DDF5A6feB245452af17cCAf92ee53D3c;
    // https://goerli-explorer.optimism.io/address/0xFdB31235cDFe68bfFD1d687AC3A2b31E80eacf0d
    address public constant new_RewardEscrowV2Storage_contract = 0xFdB31235cDFe68bfFD1d687AC3A2b31E80eacf0d;
    // https://goerli-explorer.optimism.io/address/0xa69768003543eBe5DD91E787278D99FfF9aD6095
    address public constant new_Liquidator_contract = 0xa69768003543eBe5DD91E787278D99FfF9aD6095;
    // https://goerli-explorer.optimism.io/address/0x5F0CCaBe97bF838c777F08702E17EC300FF78cD0
    address public constant new_Issuer_contract = 0x5F0CCaBe97bF838c777F08702E17EC300FF78cD0;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(rewardescrowv2storage_i);
        contracts[6] = address(issuer_i);
        contracts[7] = address(rewardescrowv2frozen_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_RewardEscrowV2Storage_contract).CONTRACT_NAME() == "RewardEscrowV2Storage",
            "Invalid contract supplied for RewardEscrowV2Storage"
        );
        require(
            ISynthetixNamedContract(new_Liquidator_contract).CONTRACT_NAME() == "Liquidator",
            "Invalid contract supplied for Liquidator"
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
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure that RewardEscrowV2Frozen account merging is closed;
        rewardescrowv2frozen_i.setAccountMergingDuration(0);
        // Ensure that RewardEscrowV2Frozen is in the address resolver;
        addressresolver_importAddresses_11();
        // Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage;
        rewardescrowv2storage_i.setAssociatedContract(new_RewardEscrowV2_contract);
        // Ensure that RewardEscrowV2Storage contract is initialized with address of RewardEscrowV2Frozen;
        rewardescrowv2storage_i.setFallbackRewardEscrow(IRewardEscrowV2Frozen(0x6dd94459B5A844a6739c2b38a9E6d6b165cE45D9));
        // Ensure the RewardsDistribution can read the RewardEscrowV2 address;
        rewardsdistribution_i.setRewardEscrow(new_RewardEscrowV2_contract);
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
        addressresolver_importAddresses_names_0_0[0] = bytes32("RewardEscrowV2");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("RewardEscrowV2Storage");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](5);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_RewardEscrowV2_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_RewardEscrowV2Storage_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](18);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x1c6C0a89064206e397E75b11Bcd370E8A8A007B4);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x216B2767C7E28f26878e668a6a06d3C364dE0725);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xD2b3F0Ea40dB68088415412b0043F37B3088836D);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_RewardEscrowV2_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x601A1Cf1a34d9cF0020dCCD361c155Fe54CE24fB);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x08fb827Ee5A00232aDe347964225Ba4344665eD5);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x3c710172e7f95aCAaDeD243982a90F8F235fF9f1);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x216EaF79575563A5e13227ad075850cDeb004083);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xFdb50671276DbC9D24D68b272B54dE4a87aaCc6c);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x2A8338199D802620B4516a557195a498595d7Eb6);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x7c0B9FbA343fC80086ccC248A8431D5D8531d782);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x0440f82444C825a0842f50e1c25cb68676d736e3);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_importAddresses_11() internal {
        bytes32[] memory addressresolver_importAddresses_names_11_0 = new bytes32[](1);
        addressresolver_importAddresses_names_11_0[0] = bytes32("RewardEscrowV2Frozen");
        address[] memory addressresolver_importAddresses_destinations_11_1 = new address[](1);
        addressresolver_importAddresses_destinations_11_1[0] = address(0x6dd94459B5A844a6739c2b38a9E6d6b165cE45D9);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_11_0,
            addressresolver_importAddresses_destinations_11_1
        );
    }

    function issuer_addSynths_15() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_15_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_15_0[0] = ISynth(0x7c0B9FbA343fC80086ccC248A8431D5D8531d782);
        issuer_addSynths_synthsToAdd_15_0[1] = ISynth(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        issuer_addSynths_synthsToAdd_15_0[2] = ISynth(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_15_0);
    }
}

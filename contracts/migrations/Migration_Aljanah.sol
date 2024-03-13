pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../RewardEscrowV2Storage.sol";
import "../RewardEscrowV2.sol";
import "../Synthetix.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Aljanah is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b);
    // https://etherscan.io/address/0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB
    RewardEscrowV2Storage public constant rewardescrowv2storage_i =
        RewardEscrowV2Storage(0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB);
    // https://etherscan.io/address/0xFAd53Cc9480634563E8ec71E8e693Ffd07981d38
    RewardEscrowV2 public constant rewardescrowv2_i = RewardEscrowV2(0xFAd53Cc9480634563E8ec71E8e693Ffd07981d38);
    // https://etherscan.io/address/0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3
    RewardEscrowV2 public constant frozenrewardescrowv2_i = RewardEscrowV2(0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3);
    // https://etherscan.io/address/0xd711709eFc452152B7ad11DbD01ed4B69c9421B3
    Synthetix public constant synthetix_i = Synthetix(0xd711709eFc452152B7ad11DbD01ed4B69c9421B3);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xd711709eFc452152B7ad11DbD01ed4B69c9421B3
    address public constant new_Synthetix_contract = 0xd711709eFc452152B7ad11DbD01ed4B69c9421B3;
    // https://etherscan.io/address/0xFAd53Cc9480634563E8ec71E8e693Ffd07981d38
    address public constant new_RewardEscrowV2_contract = 0xFAd53Cc9480634563E8ec71E8e693Ffd07981d38;
    // https://etherscan.io/address/0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3
    address public constant new_RewardEscrowV2Frozen_contract = 0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardescrow_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(rewardescrowv2storage_i);
        contracts[6] = address(rewardescrowv2_i);
        contracts[7] = address(frozenrewardescrowv2_i);
        contracts[8] = address(synthetix_i);
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
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage;
        rewardescrowv2storage_i.setAssociatedContract(new_RewardEscrowV2_contract);
        // Ensure the RewardsDistribution can read the RewardEscrowV2 address;
        rewardsdistribution_i.setRewardEscrow(new_RewardEscrowV2_contract);
        // Allow escrow entry creation by LiquidatorRewards;
        rewardescrowv2_i.setPermittedEscrowCreator(0xf79603a71144e415730C1A6f57F366E4Ea962C00, true);
        // Close account merging on previous RewardEscrowV2 contract;
        frozenrewardescrowv2_i.setAccountMergingDuration(0);
        // Move SNX balance to new RewardEscrowV2 contract;
        synthetix_i.migrateEscrowContractBalance();

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("RewardEscrowV2");
        addressresolver_importAddresses_names_0_0[2] = bytes32("RewardEscrowV2Frozen");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_RewardEscrowV2_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_RewardEscrowV2Frozen_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_RewardEscrowV2_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x8e9757479D5ad4E7f9d951B60d39F5220b893d6c);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xf79603a71144e415730C1A6f57F366E4Ea962C00);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xaeA0065E146FD75Dc24465961a583827284D405a);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xca68a3D663483515a9D434E854AB59A41b3A523c);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x94f864e55c77E07C2C7BF7bFBc334b7a8123442A);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x83105D7CDd2fd9b8185BFF1cb56bB1595a618618);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_RewardEscrowV2Frozen_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

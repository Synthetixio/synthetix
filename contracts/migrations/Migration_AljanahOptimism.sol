pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../TokenState.sol";
import "../RewardsDistribution.sol";
import "../RewardEscrowV2Storage.sol";
import "../ImportableRewardEscrowV2.sol";
import "../MintableSynthetix.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AljanahOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6
    RewardEscrowV2Storage public constant rewardescrowv2storage_i =
        RewardEscrowV2Storage(0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6);
    // https://explorer.optimism.io/address/0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2
    ImportableRewardEscrowV2 public constant rewardescrowv2_i =
        ImportableRewardEscrowV2(0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2);
    // https://explorer.optimism.io/address/0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e
    ImportableRewardEscrowV2 public constant frozenrewardescrowv2_i =
        ImportableRewardEscrowV2(0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e);
    // https://explorer.optimism.io/address/0x5A41F634958dB9183e9d0d1Cd8Dee439B6ABb3BF
    MintableSynthetix public constant synthetix_i = MintableSynthetix(0x5A41F634958dB9183e9d0d1Cd8Dee439B6ABb3BF);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2
    address public constant new_RewardEscrowV2_contract = 0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2;
    // https://explorer.optimism.io/address/0x5A41F634958dB9183e9d0d1Cd8Dee439B6ABb3BF
    address public constant new_Synthetix_contract = 0x5A41F634958dB9183e9d0d1Cd8Dee439B6ABb3BF;
    // https://explorer.optimism.io/address/0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e
    address public constant new_RewardEscrowV2Frozen_contract = 0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardsdistribution_i);
        contracts[4] = address(rewardescrowv2storage_i);
        contracts[5] = address(rewardescrowv2_i);
        contracts[6] = address(frozenrewardescrowv2_i);
        contracts[7] = address(synthetix_i);
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
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage;
        rewardescrowv2storage_i.setAssociatedContract(new_RewardEscrowV2_contract);
        // Ensure the RewardsDistribution can read the RewardEscrowV2 address;
        rewardsdistribution_i.setRewardEscrow(new_RewardEscrowV2_contract);
        // Allow escrow entry creation by DebtMigratorOnOptimism;
        rewardescrowv2_i.setPermittedEscrowCreator(0xA6bc30d854c2647574921c4AF442008DB7d32ad5, true);
        // Allow escrow entry creation by LiquidatorRewards;
        rewardescrowv2_i.setPermittedEscrowCreator(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4, true);
        // Close account merging on previous ImportableRewardEscrowV2 contract;
        frozenrewardescrowv2_i.setAccountMergingDuration(0);
        // Move SNX balance to new ImportableRewardEscrowV2 contract;
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
        addressresolver_importAddresses_names_0_0[0] = bytes32("RewardEscrowV2");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("RewardEscrowV2Frozen");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_RewardEscrowV2_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_RewardEscrowV2Frozen_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xEb66Fc1BFdF3284Cb0CA1dE57149dcf3cEFa5453);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xA6bc30d854c2647574921c4AF442008DB7d32ad5);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_RewardEscrowV2_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xB589Af3f2e3377A9a57da74bE1b6598926479505);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x24b4b6703a2eE7bA75a4Fc859B606F0bbaeef4EA);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_RewardEscrowV2Frozen_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

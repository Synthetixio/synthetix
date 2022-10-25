pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../Synthetix.sol";
import "../RewardEscrowV2Storage.sol";
import "../BaseRewardEscrowV2.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Aspidiske is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x29C295B046a73Cde593f21f63091B072d407e3F2
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);
    // https://etherscan.io/address/0x6b10E5Ce50e3A062731d83Cd3cAD1964e5F93DA6
    Synthetix public constant synthetix_i = Synthetix(0x6b10E5Ce50e3A062731d83Cd3cAD1964e5F93DA6);
    // https://etherscan.io/address/0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB
    RewardEscrowV2Storage public constant rewardescrowv2storage_i =
        RewardEscrowV2Storage(0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB);
    // https://etherscan.io/address/0xDA4eF8520b1A57D7d63f1E249606D1A459698876
    BaseRewardEscrowV2 public constant rewardescrowv2frozen_i =
        BaseRewardEscrowV2(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
    // https://etherscan.io/address/0xf187daD9BEA2ba24bAB1B3094e6fD7d809f29dE7
    Issuer public constant issuer_i = Issuer(0xf187daD9BEA2ba24bAB1B3094e6fD7d809f29dE7);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3
    address public constant new_RewardEscrowV2_contract = 0xAc86855865CbF31c8f9FBB68C749AD5Bd72802e3;
    // https://etherscan.io/address/0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB
    address public constant new_RewardEscrowV2Storage_contract = 0x182738BD9eE9810BC11f1c81b07Ec6F3691110BB;
    // https://etherscan.io/address/0x6b10E5Ce50e3A062731d83Cd3cAD1964e5F93DA6
    address public constant new_Synthetix_contract = 0x6b10E5Ce50e3A062731d83Cd3cAD1964e5F93DA6;
    // https://etherscan.io/address/0x05e661738E3A3C6F254d9c29a40Dad0Ec357ea85
    address public constant new_Liquidator_contract = 0x05e661738E3A3C6F254d9c29a40Dad0Ec357ea85;
    // https://etherscan.io/address/0xf187daD9BEA2ba24bAB1B3094e6fD7d809f29dE7
    address public constant new_Issuer_contract = 0xf187daD9BEA2ba24bAB1B3094e6fD7d809f29dE7;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](10);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardescrow_i);
        contracts[5] = address(rewardsdistribution_i);
        contracts[6] = address(synthetix_i);
        contracts[7] = address(rewardescrowv2storage_i);
        contracts[8] = address(issuer_i);
        contracts[9] = address(rewardescrowv2frozen_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_RewardEscrowV2Storage_contract).CONTRACT_NAME() == "RewardEscrowV2Storage",
            "Invalid contract supplied for RewardEscrowV2Storage"
        );
        require(
            ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix",
            "Invalid contract supplied for Synthetix"
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure that RewardEscrowV2Frozen account merging is closed;
        rewardescrowv2frozen_i.setAccountMergingDuration(0);
        // Ensure that RewardEscrowV2Frozen is in the address resolver;
        addressresolver_importAddresses_13();
        // Ensure that old escrow SNX balance is migrated to new contract;
        synthetix_i.migrateEscrowContractBalance();
        // Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage;
        rewardescrowv2storage_i.setAssociatedContract(new_RewardEscrowV2_contract);
        // Ensure that RewardEscrowV2Storage contract is initialized with address of RewardEscrowV2Frozen;
        rewardescrowv2storage_i.setFallbackRewardEscrow(IRewardEscrowV2Frozen(0xDA4eF8520b1A57D7d63f1E249606D1A459698876));
        // Ensure the RewardsDistribution can read the RewardEscrowV2 address;
        rewardsdistribution_i.setRewardEscrow(new_RewardEscrowV2_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_18();

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
        addressresolver_importAddresses_names_0_0[1] = bytes32("RewardEscrowV2Storage");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](5);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_RewardEscrowV2_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_RewardEscrowV2Storage_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xf79603a71144e415730C1A6f57F366E4Ea962C00);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_RewardEscrowV2_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](10);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_importAddresses_13() internal {
        bytes32[] memory addressresolver_importAddresses_names_13_0 = new bytes32[](1);
        addressresolver_importAddresses_names_13_0[0] = bytes32("RewardEscrowV2Frozen");
        address[] memory addressresolver_importAddresses_destinations_13_1 = new address[](1);
        addressresolver_importAddresses_destinations_13_1[0] = address(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_13_0,
            addressresolver_importAddresses_destinations_13_1
        );
    }

    function issuer_addSynths_18() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_18_0 = new ISynth[](14);
        issuer_addSynths_synthsToAdd_18_0[0] = ISynth(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        issuer_addSynths_synthsToAdd_18_0[1] = ISynth(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        issuer_addSynths_synthsToAdd_18_0[2] = ISynth(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        issuer_addSynths_synthsToAdd_18_0[3] = ISynth(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        issuer_addSynths_synthsToAdd_18_0[4] = ISynth(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        issuer_addSynths_synthsToAdd_18_0[5] = ISynth(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        issuer_addSynths_synthsToAdd_18_0[6] = ISynth(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        issuer_addSynths_synthsToAdd_18_0[7] = ISynth(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        issuer_addSynths_synthsToAdd_18_0[8] = ISynth(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        issuer_addSynths_synthsToAdd_18_0[9] = ISynth(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        issuer_addSynths_synthsToAdd_18_0[10] = ISynth(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        issuer_addSynths_synthsToAdd_18_0[11] = ISynth(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        issuer_addSynths_synthsToAdd_18_0[12] = ISynth(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        issuer_addSynths_synthsToAdd_18_0[13] = ISynth(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_18_0);
    }
}

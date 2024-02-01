pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../RewardsDistribution.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Phecda is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b
    address public constant new_RewardsDistribution_contract = 0x94433f0DA8B5bfb473Ea8cd7ad10D9c8aef4aB7b;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](2);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(rewardsdistribution_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(0xd0dA9cBeA9C3852C5d63A95F9ABCC4f6eA0F9032);
        // Ensure the RewardsDistribution can find the Synthetix proxy to read and transfer;
        rewardsdistribution_i.setSynthetixProxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](1);
        addressresolver_importAddresses_names_0_0[0] = bytes32("RewardsDistribution");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_RewardsDistribution_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](3);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xd0dA9cBeA9C3852C5d63A95F9ABCC4f6eA0F9032);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x83105D7CDd2fd9b8185BFF1cb56bB1595a618618);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

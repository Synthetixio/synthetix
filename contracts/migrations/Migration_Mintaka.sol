pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Mintaka is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6
    address public constant new_FuturesMarketManager_contract = 0xe343542366A9f3Af56Acc6D68154Cfaf23efeba6;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](1);
        contracts[0] = address(addressresolver_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_FuturesMarketManager_contract).CONTRACT_NAME() == "EmptyFuturesMarketManager",
            "Invalid contract supplied for FuturesMarketManager"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("FuturesMarketManager");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FuturesMarketManager_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}


pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Mirzam is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x426Be4cC70066b2C42Edb1aE838c741069b1972c
    address public constant new_Exchanger_contract = 0x426Be4cC70066b2C42Edb1aE838c741069b1972c;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](3);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(exchangestate_i);
        contracts[2]= address(systemstatus_i);
    }

    function migrate() external onlyOwner {
        require(ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives", "Invalid contract supplied for Exchanger");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Exchanger contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_Exchanger_contract, true, false);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xDC01020857afbaE65224CfCeDb265d1216064c59);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xde3892383965FBa6eC434bE6350F85f140098708);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xe2f532c389deb5E42DCe53e78A9762949A885455);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xc70B42930BD8D30A79B55415deC3be60827559f7);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xcc3aab773e2171b2E257Ee17001400eE378aa52B);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](4);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}

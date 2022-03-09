
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../Proxy.sol";
import "../legacy/LegacyTokenState.sol";
import "../SynthetixState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../FeePool.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alphard is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xb440DD674e1243644791a4AdfE3A2AbB0A92d309
    Proxy public constant proxyfeepool_i = Proxy(0xb440DD674e1243644791a4AdfE3A2AbB0A92d309);
    // https://etherscan.io/address/0xC9DFff5fA5605fd94F8B7927b892F2B57391e8bB
    FeePoolEternalStorage public constant feepooleternalstorage_i = FeePoolEternalStorage(0xC9DFff5fA5605fd94F8B7927b892F2B57391e8bB);
    // https://etherscan.io/address/0x11164F6a47C3f8472D19b9aDd516Fc780cb7Ee02
    FeePoolState public constant feepoolstate_i = FeePoolState(0x11164F6a47C3f8472D19b9aDd516Fc780cb7Ee02);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82
    SynthetixState public constant synthetixstate_i = SynthetixState(0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x29C295B046a73Cde593f21f63091B072d407e3F2
    RewardsDistribution public constant rewardsdistribution_i = RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);
    // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec
    FeePool public constant feepool_i = FeePool(0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec);
    // https://etherscan.io/address/0x16e5ACe2B8a9DE5c42fCFd85d6EC5992a43C0837
    Issuer public constant issuer_i = Issuer(0x16e5ACe2B8a9DE5c42fCFd85d6EC5992a43C0837);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x89FCb32F29e509cc42d0C8b6f058C993013A843F
    address public constant new_SynthetixDebtShare_contract = 0x89FCb32F29e509cc42d0C8b6f058C993013A843F;
    // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec
    address public constant new_FeePool_contract = 0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec;
    // https://etherscan.io/address/0x97607b048aEa97A821C3EdC881aF7743f8868950
    address public constant new_Synthetix_contract = 0x97607b048aEa97A821C3EdC881aF7743f8868950;
    // https://etherscan.io/address/0x16e5ACe2B8a9DE5c42fCFd85d6EC5992a43C0837
    address public constant new_Issuer_contract = 0x16e5ACe2B8a9DE5c42fCFd85d6EC5992a43C0837;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](11);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(proxyfeepool_i);
        contracts[2]= address(feepooleternalstorage_i);
        contracts[3]= address(feepoolstate_i);
        contracts[4]= address(proxysynthetix_i);
        contracts[5]= address(tokenstatesynthetix_i);
        contracts[6]= address(synthetixstate_i);
        contracts[7]= address(rewardescrow_i);
        contracts[8]= address(rewardsdistribution_i);
        contracts[9]= address(feepool_i);
        contracts[10]= address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(ISynthetixNamedContract(new_SynthetixDebtShare_contract).CONTRACT_NAME() == "SynthetixDebtShare", "Invalid contract supplied for SynthetixDebtShare");
        require(ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool", "Invalid contract supplied for FeePool");
        require(ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix", "Invalid contract supplied for Synthetix");
        require(ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer", "Invalid contract supplied for Issuer");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the FeePool contract can write to its State;
        feepoolstate_i.setFeePool(IFeePool(new_FeePool_contract));
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure that Synthetix can write to its State contract;
        synthetixstate_i.setAssociatedContract(new_Issuer_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_19();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](4);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SynthetixDebtShare");
        addressresolver_importAddresses_names_0_0[1] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](4);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SynthetixDebtShare_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_SynthetixDebtShare_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x426Be4cC70066b2C42Edb1aE838c741069b1972c);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x02f9bC46beD33acdB9cb002fe346734CeF8a9480);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xde3892383965FBa6eC434bE6350F85f140098708);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xe2f532c389deb5E42DCe53e78A9762949A885455);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xc70B42930BD8D30A79B55415deC3be60827559f7);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xcc3aab773e2171b2E257Ee17001400eE378aa52B);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](12);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xCd9D4988C0AE61887B075bA77f08cbFAd2b65068);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    
    function importFeePeriod_0() internal {
        // https://etherscan.io/address/0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd;
        FeePool existingFeePool = FeePool(0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd);
        // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec;
        FeePool newFeePool = FeePool(0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec);
        (
                        uint64 feePeriodId_0,
                        uint64 unused_0,
                        uint64 startTime_0,
                        uint feesToDistribute_0,
                        uint feesClaimed_0,
                        uint rewardsToDistribute_0,
                        uint rewardsClaimed_0
                    ) = existingFeePool.recentFeePeriods(0);
        newFeePool.importFeePeriod(
                        0,
                        feePeriodId_0,
                        startTime_0,
                        feesToDistribute_0,
                        feesClaimed_0,
                        rewardsToDistribute_0,
                        rewardsClaimed_0
                    );
    }

    
    function importFeePeriod_1() internal {
        // https://etherscan.io/address/0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd;
        FeePool existingFeePool = FeePool(0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd);
        // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec;
        FeePool newFeePool = FeePool(0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec);
        (
                        uint64 feePeriodId_1,
                        uint64 unused_1,
                        uint64 startTime_1,
                        uint feesToDistribute_1,
                        uint feesClaimed_1,
                        uint rewardsToDistribute_1,
                        uint rewardsClaimed_1
                    ) = existingFeePool.recentFeePeriods(1);
        newFeePool.importFeePeriod(
                        1,
                        feePeriodId_1,
                        startTime_1,
                        feesToDistribute_1,
                        feesClaimed_1,
                        rewardsToDistribute_1,
                        rewardsClaimed_1
                    );
    }

    
    function issuer_addSynths_19() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_19_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_19_0[0] = ISynth(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
        issuer_addSynths_synthsToAdd_19_0[1] = ISynth(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
        issuer_addSynths_synthsToAdd_19_0[2] = ISynth(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
        issuer_addSynths_synthsToAdd_19_0[3] = ISynth(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
        issuer_addSynths_synthsToAdd_19_0[4] = ISynth(0xde3892383965FBa6eC434bE6350F85f140098708);
        issuer_addSynths_synthsToAdd_19_0[5] = ISynth(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
        issuer_addSynths_synthsToAdd_19_0[6] = ISynth(0xe2f532c389deb5E42DCe53e78A9762949A885455);
        issuer_addSynths_synthsToAdd_19_0[7] = ISynth(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
        issuer_addSynths_synthsToAdd_19_0[8] = ISynth(0xc70B42930BD8D30A79B55415deC3be60827559f7);
        issuer_addSynths_synthsToAdd_19_0[9] = ISynth(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
        issuer_addSynths_synthsToAdd_19_0[10] = ISynth(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
        issuer_addSynths_synthsToAdd_19_0[11] = ISynth(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
        issuer_addSynths_synthsToAdd_19_0[12] = ISynth(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
        issuer_addSynths_synthsToAdd_19_0[13] = ISynth(0xcc3aab773e2171b2E257Ee17001400eE378aa52B);
        issuer_addSynths_synthsToAdd_19_0[14] = ISynth(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_19_0);
    }
}

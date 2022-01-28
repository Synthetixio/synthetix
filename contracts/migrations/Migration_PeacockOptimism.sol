
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../FeePool.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_PeacockOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x4a16A42407AA491564643E1dfc1fd50af29794eF
    Proxy public constant proxyfeepool_i = Proxy(0x4a16A42407AA491564643E1dfc1fd50af29794eF);
    // https://explorer.optimism.io/address/0x41140Bf6498a36f2E44eFd49f21dAe3bbb7367c8
    FeePoolEternalStorage public constant feepooleternalstorage_i = FeePoolEternalStorage(0x41140Bf6498a36f2E44eFd49f21dAe3bbb7367c8);
    // https://explorer.optimism.io/address/0x6e0d26cffc3a63d763F1546f749bf62ebC7d72D8
    FeePoolState public constant feepoolstate_i = FeePoolState(0x6e0d26cffc3a63d763F1546f749bf62ebC7d72D8);
    // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52
    FeePool public constant feepool_i = FeePool(0xFDf3Be612c65464AEB4859047350a6220F304F52);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52
        address public constant new_FeePool_contract = 0xFDf3Be612c65464AEB4859047350a6220F304F52;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(proxyfeepool_i);
        contracts[2]= address(feepooleternalstorage_i);
        contracts[3]= address(feepoolstate_i);
        contracts[4]= address(feepool_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool", "Invalid contract supplied for FeePool");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the FeePool contract can write to its State;
        feepoolstate_i.setFeePool(IFeePool(new_FeePool_contract));
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("FeePool");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FeePool_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_names_0_0, addressresolver_importAddresses_destinations_0_1);
    }

    
    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xFe06fbe87E9f705B5D337D82dF8Fd812774974F9);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xA2412e0654CdD40F5677Aaad1a0c572e75dF246C);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x27be2EFAd45DeBd732C1EBf5C9F7b49D498D4a93);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_FeePool_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function importFeePeriod_0() internal {
        // https://explorer.optimism.io/address/0xbc12131c93Da011B2844FA76c373A8cf5b0db4B5;
        FeePool existingFeePool = FeePool(0xbc12131c93Da011B2844FA76c373A8cf5b0db4B5);
        // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52;
        FeePool newFeePool = FeePool(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        (
                        uint64 feePeriodId_0,
                        uint64 startingDebtIndex_0,
                        uint64 startTime_0,
                        uint feesToDistribute_0,
                        uint feesClaimed_0,
                        uint rewardsToDistribute_0,
                        uint rewardsClaimed_0
                    ) = existingFeePool.recentFeePeriods(0);
        newFeePool.importFeePeriod(
                        0,
                        feePeriodId_0,
                        startingDebtIndex_0,
                        startTime_0,
                        feesToDistribute_0,
                        feesClaimed_0,
                        rewardsToDistribute_0,
                        rewardsClaimed_0
                    );
    }

    
    function importFeePeriod_1() internal {
        // https://explorer.optimism.io/address/0xbc12131c93Da011B2844FA76c373A8cf5b0db4B5;
        FeePool existingFeePool = FeePool(0xbc12131c93Da011B2844FA76c373A8cf5b0db4B5);
        // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52;
        FeePool newFeePool = FeePool(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        (
                        uint64 feePeriodId_1,
                        uint64 startingDebtIndex_1,
                        uint64 startTime_1,
                        uint feesToDistribute_1,
                        uint feesClaimed_1,
                        uint rewardsToDistribute_1,
                        uint rewardsClaimed_1
                    ) = existingFeePool.recentFeePeriods(1);
        newFeePool.importFeePeriod(
                        1,
                        feePeriodId_1,
                        startingDebtIndex_1,
                        startTime_1,
                        feesToDistribute_1,
                        feesClaimed_1,
                        rewardsToDistribute_1,
                        rewardsClaimed_1
                    );
    }
}

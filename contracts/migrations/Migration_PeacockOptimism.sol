
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../RewardEscrow.sol";
import "../FeePool.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_PeacockOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599
    Proxy public constant proxyfeepool_i = Proxy(0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599);
    // https://kovan-explorer.optimism.io/address/0x0A1d3bde7751e92971891FB034AcDE4C271de408
    FeePoolEternalStorage public constant feepooleternalstorage_i = FeePoolEternalStorage(0x0A1d3bde7751e92971891FB034AcDE4C271de408);
    // https://kovan-explorer.optimism.io/address/0x2e542fA43A19F3F07230dD125f9f81411141362F
    FeePoolState public constant feepoolstate_i = FeePoolState(0x2e542fA43A19F3F07230dD125f9f81411141362F);
    // https://kovan-explorer.optimism.io/address/0x9952e42fF92149f48b3b7dee3f921A6DD106F79F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x9952e42fF92149f48b3b7dee3f921A6DD106F79F);
    // https://kovan-explorer.optimism.io/address/0x129fd2f3a799bD156e8c00599760AfC2f0f953dA
    FeePool public constant feepool_i = FeePool(0x129fd2f3a799bD156e8c00599760AfC2f0f953dA);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x129fd2f3a799bD156e8c00599760AfC2f0f953dA
        address public constant new_FeePool_contract = 0x129fd2f3a799bD156e8c00599760AfC2f0f953dA;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(proxyfeepool_i);
        contracts[2]= address(feepooleternalstorage_i);
        contracts[3]= address(feepoolstate_i);
        contracts[4]= address(rewardescrow_i);
        contracts[5]= address(feepool_i);
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
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
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
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](13);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x15e7Aa4Cd2C74750b5DCaC9B8B21B9189552BBaD);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x42d9ac3ebebb9479f24360847350b4F7EADECE50);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xb7469A575b7931532F09AEe2882835A0249064a0);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x319D190584248280e3084A4692C6472A8dA5CA26);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_FeePool_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function importFeePeriod_0() internal {
        // https://kovan-explorer.optimism.io/address/0x2F737bf6a32bf3AcBef4d5148DA507569204Fb61;
        FeePool existingFeePool = FeePool(0x2F737bf6a32bf3AcBef4d5148DA507569204Fb61);
        // https://kovan-explorer.optimism.io/address/0x129fd2f3a799bD156e8c00599760AfC2f0f953dA;
        FeePool newFeePool = FeePool(0x129fd2f3a799bD156e8c00599760AfC2f0f953dA);
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
        // https://kovan-explorer.optimism.io/address/0x2F737bf6a32bf3AcBef4d5148DA507569204Fb61;
        FeePool existingFeePool = FeePool(0x2F737bf6a32bf3AcBef4d5148DA507569204Fb61);
        // https://kovan-explorer.optimism.io/address/0x129fd2f3a799bD156e8c00599760AfC2f0f953dA;
        FeePool newFeePool = FeePool(0x129fd2f3a799bD156e8c00599760AfC2f0f953dA);
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

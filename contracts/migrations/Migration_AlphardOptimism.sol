
pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../ProxyERC20.sol";
import "../TokenState.sol";
import "../RewardsDistribution.sol";
import "../FeePool.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlphardOptimism is BaseMigration {
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
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i = RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54
    FeePool public constant feepool_i = FeePool(0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54);
    // https://explorer.optimism.io/address/0xdf1F1f0059bA70C182471467d3017511B1a122E8
    Issuer public constant issuer_i = Issuer(0xdf1F1f0059bA70C182471467d3017511B1a122E8);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79
    address public constant new_SynthetixDebtShare_contract = 0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79;
    // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54
    address public constant new_FeePool_contract = 0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54;
    // https://explorer.optimism.io/address/0x8518f879a2B8138405E947A48326F55FF9D5f3aD
    address public constant new_Synthetix_contract = 0x8518f879a2B8138405E947A48326F55FF9D5f3aD;
    // https://explorer.optimism.io/address/0xdf1F1f0059bA70C182471467d3017511B1a122E8
    address public constant new_Issuer_contract = 0xdf1F1f0059bA70C182471467d3017511B1a122E8;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0]= address(addressresolver_i);
        contracts[1]= address(proxyfeepool_i);
        contracts[2]= address(feepooleternalstorage_i);
        contracts[3]= address(feepoolstate_i);
        contracts[4]= address(proxysynthetix_i);
        contracts[5]= address(tokenstatesynthetix_i);
        contracts[6]= address(rewardsdistribution_i);
        contracts[7]= address(feepool_i);
        contracts[8]= address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(ISynthetixNamedContract(new_SynthetixDebtShare_contract).CONTRACT_NAME() == "SynthetixDebtShare", "Invalid contract supplied for SynthetixDebtShare");
        require(ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool", "Invalid contract supplied for FeePool");
        require(ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer", "Invalid contract supplied for Issuer");

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
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_16();

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
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](19);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_SynthetixDebtShare_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x5a439C235C8BB9F813C5b45Dc194A00EC23CB78E);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x27be2EFAd45DeBd732C1EBf5C9F7b49D498D4a93);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x14E6f8e6Da00a32C069b11b64e48EA1FEF2361D4);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x3f87Ff1de58128eF8FCb4c807eFD776E1aC72E51);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x01f8C5e421172B67cc14B7f5F369cfb10de0acD4);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    
    function importFeePeriod_0() internal {
        // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52;
        FeePool existingFeePool = FeePool(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54;
        FeePool newFeePool = FeePool(0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54);
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
        // https://explorer.optimism.io/address/0xFDf3Be612c65464AEB4859047350a6220F304F52;
        FeePool existingFeePool = FeePool(0xFDf3Be612c65464AEB4859047350a6220F304F52);
        // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54;
        FeePool newFeePool = FeePool(0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54);
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

    
    function issuer_addSynths_16() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_16_0 = new ISynth[](4);
        issuer_addSynths_synthsToAdd_16_0[0] = ISynth(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        issuer_addSynths_synthsToAdd_16_0[1] = ISynth(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        issuer_addSynths_synthsToAdd_16_0[2] = ISynth(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        issuer_addSynths_synthsToAdd_16_0[3] = ISynth(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_16_0);
    }
}

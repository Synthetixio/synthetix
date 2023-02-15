pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../SystemStatus.sol";
import "../FeePool.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_SchedarOptimism is BaseMigration {
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
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x41140Bf6498a36f2E44eFd49f21dAe3bbb7367c8);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B
    FeePool public constant feepool_i = FeePool(0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B);
    // https://explorer.optimism.io/address/0x52c4612DBb84282332300A5cdAbA7acD7661a94B
    Issuer public constant issuer_i = Issuer(0x52c4612DBb84282332300A5cdAbA7acD7661a94B);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B
    address public constant new_FeePool_contract = 0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B;
    // https://explorer.optimism.io/address/0x52c4612DBb84282332300A5cdAbA7acD7661a94B
    address public constant new_Issuer_contract = 0x52c4612DBb84282332300A5cdAbA7acD7661a94B;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(feepool_i);
        contracts[5] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
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
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_10();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](2);
        addressresolver_importAddresses_names_0_0[0] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x24b4b6703a2eE7bA75a4Fc859B606F0bbaeef4EA);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x27be2EFAd45DeBd732C1EBf5C9F7b49D498D4a93);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xeb4b5ABcE7310855319440d936cd3aDd77DFA193);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xdb89f3fc45A707Dd49781495f77f8ae69bF5cA6e);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x49B35BE7D96888C02F342552aB218d859599aCeb);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xB589Af3f2e3377A9a57da74bE1b6598926479505);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x803FD1d99C3a6cbcbABAB79C44e108dC2fb67102);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](3);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function importFeePeriod_0() internal {
        // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc;
        FeePool existingFeePool = FeePool(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        // https://explorer.optimism.io/address/0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B;
        FeePool newFeePool = FeePool(0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B);
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
        // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc;
        FeePool existingFeePool = FeePool(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        // https://explorer.optimism.io/address/0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B;
        FeePool newFeePool = FeePool(0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B);
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

    function issuer_addSynths_10() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_10_0 = new ISynth[](5);
        issuer_addSynths_synthsToAdd_10_0[0] = ISynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        issuer_addSynths_synthsToAdd_10_0[1] = ISynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        issuer_addSynths_synthsToAdd_10_0[2] = ISynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        issuer_addSynths_synthsToAdd_10_0[3] = ISynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        issuer_addSynths_synthsToAdd_10_0[4] = ISynth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_10_0);
    }
}

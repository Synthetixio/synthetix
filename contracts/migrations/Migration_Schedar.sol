pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../SystemStatus.sol";
import "../RewardEscrow.sol";
import "../FeePool.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Schedar is BaseMigration {
    // https://goerli.etherscan.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli.etherscan.io/address/0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB
    AddressResolver public constant addressresolver_i = AddressResolver(0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB);
    // https://goerli.etherscan.io/address/0x4FC6f7C8Ff4f0D535315F1E6e84897c89367b47E
    Proxy public constant proxyfeepool_i = Proxy(0x4FC6f7C8Ff4f0D535315F1E6e84897c89367b47E);
    // https://goerli.etherscan.io/address/0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC);
    // https://goerli.etherscan.io/address/0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3
    SystemStatus public constant systemstatus_i = SystemStatus(0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3);
    // https://goerli.etherscan.io/address/0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d);
    // https://goerli.etherscan.io/address/0x73d7fC96547eECCb3121dA7c0661554BE3e49236
    FeePool public constant feepool_i = FeePool(0x73d7fC96547eECCb3121dA7c0661554BE3e49236);
    // https://goerli.etherscan.io/address/0xA584bCE07004E17C246a7082aB680616853f3890
    Issuer public constant issuer_i = Issuer(0xA584bCE07004E17C246a7082aB680616853f3890);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli.etherscan.io/address/0x73d7fC96547eECCb3121dA7c0661554BE3e49236
    address public constant new_FeePool_contract = 0x73d7fC96547eECCb3121dA7c0661554BE3e49236;
    // https://goerli.etherscan.io/address/0xA584bCE07004E17C246a7082aB680616853f3890
    address public constant new_Issuer_contract = 0xA584bCE07004E17C246a7082aB680616853f3890;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(rewardescrow_i);
        contracts[5] = address(feepool_i);
        contracts[6] = address(issuer_i);
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
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_11();

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
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x4300a068B3826aCEFaE7062b411aF467a34Bf3A6);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x6Ce575c870ce744e245Ef8400b6d89412C35c328);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x1427Bc44755d9Aa317535B1feE38922760Aa4e65);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xa69768003543eBe5DD91E787278D99FfF9aD6095);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x4556b9761b2aC071D1665FAe01faA255a53d1307);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x7D2bEB18a21468808E16fD1fbe9637eFa98D0777);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x0376Bdaf9C97E2e454C83e728154eC621df23958);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x6d20C286D94a603A1cdE80D1f8e5f44Bc22550C0);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xFC0E6442fC16e1caf52baa31f8043D8BE78AEb0D);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x671C874C43B571878D6a90C5AA27288096eEac21);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xc656c18721594f9E98B0C805AB9c21Bda5B44f4C);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x601A1Cf1a34d9cF0020dCCD361c155Fe54CE24fB);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xc30BECA82f1f60DC0e4d3490428525985eef4D74);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x183B4A053CbA70a420E581918008Ef8e65d95E05);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xf1D0Ee19af243bcbC140A2259290B490E4df92A9);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](2);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x32A0BAA5Acec418a85Fd032f0292893B8E4f743B);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x86bfC5Be44f5DE1673824c0d0d1CCEA1306cD40e);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function importFeePeriod_0() internal {
        // https://goerli.etherscan.io/address/0x9D9aAf3ED4E4A708834F148f9b9d0d12Ba0a8034;
        FeePool existingFeePool = FeePool(0x9D9aAf3ED4E4A708834F148f9b9d0d12Ba0a8034);
        // https://goerli.etherscan.io/address/0x73d7fC96547eECCb3121dA7c0661554BE3e49236;
        FeePool newFeePool = FeePool(0x73d7fC96547eECCb3121dA7c0661554BE3e49236);
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
        // https://goerli.etherscan.io/address/0x9D9aAf3ED4E4A708834F148f9b9d0d12Ba0a8034;
        FeePool existingFeePool = FeePool(0x9D9aAf3ED4E4A708834F148f9b9d0d12Ba0a8034);
        // https://goerli.etherscan.io/address/0x73d7fC96547eECCb3121dA7c0661554BE3e49236;
        FeePool newFeePool = FeePool(0x73d7fC96547eECCb3121dA7c0661554BE3e49236);
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

    function issuer_addSynths_11() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_11_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_11_0[0] = ISynth(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        issuer_addSynths_synthsToAdd_11_0[1] = ISynth(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        issuer_addSynths_synthsToAdd_11_0[2] = ISynth(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_11_0);
    }
}

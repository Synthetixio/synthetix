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
    // https://goerli-explorer.optimism.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli-explorer.optimism.io/address/0x1d551351613a28d676BaC1Af157799e201279198
    AddressResolver public constant addressresolver_i = AddressResolver(0x1d551351613a28d676BaC1Af157799e201279198);
    // https://goerli-explorer.optimism.io/address/0x4Fa8252a6C60C891BE35Db51F1F4F5973b88dF98
    Proxy public constant proxyfeepool_i = Proxy(0x4Fa8252a6C60C891BE35Db51F1F4F5973b88dF98);
    // https://goerli-explorer.optimism.io/address/0xd01075abdD086006c85840de62544506d7Ab3C79
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0xd01075abdD086006c85840de62544506d7Ab3C79);
    // https://goerli-explorer.optimism.io/address/0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916
    SystemStatus public constant systemstatus_i = SystemStatus(0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916);
    // https://goerli-explorer.optimism.io/address/0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0
    FeePool public constant feepool_i = FeePool(0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0);
    // https://goerli-explorer.optimism.io/address/0x7D1a0954CB643A506465b338A2DD414A10ABaBF3
    Issuer public constant issuer_i = Issuer(0x7D1a0954CB643A506465b338A2DD414A10ABaBF3);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli-explorer.optimism.io/address/0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0
    address public constant new_FeePool_contract = 0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0;
    // https://goerli-explorer.optimism.io/address/0x7D1a0954CB643A506465b338A2DD414A10ABaBF3
    address public constant new_Issuer_contract = 0x7D1a0954CB643A506465b338A2DD414A10ABaBF3;

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
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xF6C92Ad11fa67b7b685aDb435FbE932c049B670c);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x164724726608622b6e5Fa1aF8932b45A7Bd1a94D);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xD2b3F0Ea40dB68088415412b0043F37B3088836D);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x507cbddCF4e01396981190F0Ced8Ea37ca25b452);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x35725C94f3B1aB6BbD533c0B6Df525537d422c5F);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x1a471C12f7efd7adB0065E3c7e457a0c36c13490);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xc429dd84c9a9a7c786764c7dcaF31e30bd35BcdF);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x8cF677281A8Ad57e0db4A8e6B57aE17211f97689);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x3c710172e7f95aCAaDeD243982a90F8F235fF9f1);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x5e042334B5Bb0434aB2512d16FfcD4Db61F94f18);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x1c6C0a89064206e397E75b11Bcd370E8A8A007B4);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x216EaF79575563A5e13227ad075850cDeb004083);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xFdb50671276DbC9D24D68b272B54dE4a87aaCc6c);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x2A8338199D802620B4516a557195a498595d7Eb6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](1);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x0440f82444C825a0842f50e1c25cb68676d736e3);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function importFeePeriod_0() internal {
        // https://goerli-explorer.optimism.io/address/0x216B2767C7E28f26878e668a6a06d3C364dE0725;
        FeePool existingFeePool = FeePool(0x216B2767C7E28f26878e668a6a06d3C364dE0725);
        // https://goerli-explorer.optimism.io/address/0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0;
        FeePool newFeePool = FeePool(0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0);
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
        // https://goerli-explorer.optimism.io/address/0x216B2767C7E28f26878e668a6a06d3C364dE0725;
        FeePool existingFeePool = FeePool(0x216B2767C7E28f26878e668a6a06d3C364dE0725);
        // https://goerli-explorer.optimism.io/address/0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0;
        FeePool newFeePool = FeePool(0x41B88d77A1C0Ea3cdcf44D69365399F4dCBab5B0);
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
        ISynth[] memory issuer_addSynths_synthsToAdd_10_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_10_0[0] = ISynth(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        issuer_addSynths_synthsToAdd_10_0[1] = ISynth(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        issuer_addSynths_synthsToAdd_10_0[2] = ISynth(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_10_0);
    }
}

pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../RewardsDistribution.sol";
import "../MintableSynthetix.sol";
import "../RewardEscrowV2Storage.sol";
import "../BaseRewardEscrowV2.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AspidiskeOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0xF149ABD352f4AB50ca3c161f4F5d0c85AeFA8A9d
    MintableSynthetix public constant synthetix_i = MintableSynthetix(0xF149ABD352f4AB50ca3c161f4F5d0c85AeFA8A9d);
    // https://explorer.optimism.io/address/0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6
    RewardEscrowV2Storage public constant rewardescrowv2storage_i =
        RewardEscrowV2Storage(0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6);
    // https://explorer.optimism.io/address/0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0
    BaseRewardEscrowV2 public constant rewardescrowv2frozen_i =
        BaseRewardEscrowV2(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
    // https://explorer.optimism.io/address/0x12120AcBE7d6402104b68a2e86C071Fcdd1034Fe
    Issuer public constant issuer_i = Issuer(0x12120AcBE7d6402104b68a2e86C071Fcdd1034Fe);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xF149ABD352f4AB50ca3c161f4F5d0c85AeFA8A9d
    address public constant new_Synthetix_contract = 0xF149ABD352f4AB50ca3c161f4F5d0c85AeFA8A9d;
    // https://explorer.optimism.io/address/0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6
    address public constant new_RewardEscrowV2Storage_contract = 0x0c2ED9B23BAF9C5f486e175D406728d3bE46d2A6;
    // https://explorer.optimism.io/address/0x61C7BC9b335e083c30C8a81b93575c361cdE93E2
    address public constant new_Liquidator_contract = 0x61C7BC9b335e083c30C8a81b93575c361cdE93E2;
    // https://explorer.optimism.io/address/0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e
    address public constant new_RewardEscrowV2_contract = 0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e;
    // https://explorer.optimism.io/address/0x12120AcBE7d6402104b68a2e86C071Fcdd1034Fe
    address public constant new_Issuer_contract = 0x12120AcBE7d6402104b68a2e86C071Fcdd1034Fe;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(synthetix_i);
        contracts[6] = address(rewardescrowv2storage_i);
        contracts[7] = address(issuer_i);
        contracts[8] = address(rewardescrowv2frozen_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_RewardEscrowV2Storage_contract).CONTRACT_NAME() == "RewardEscrowV2Storage",
            "Invalid contract supplied for RewardEscrowV2Storage"
        );
        require(
            ISynthetixNamedContract(new_Liquidator_contract).CONTRACT_NAME() == "Liquidator",
            "Invalid contract supplied for Liquidator"
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
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure that RewardEscrowV2Frozen account merging is closed;
        rewardescrowv2frozen_i.setAccountMergingDuration(0);
        // Ensure that RewardEscrowV2Frozen is in the address resolver;
        addressresolver_importAddresses_12();
        // Ensure that old escrow SNX balance is migrated to new contract;
        synthetix_i.migrateEscrowContractBalance();
        // Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage;
        rewardescrowv2storage_i.setAssociatedContract(new_RewardEscrowV2_contract);
        // Ensure that RewardEscrowV2Storage contract is initialized with address of RewardEscrowV2Frozen;
        rewardescrowv2storage_i.setFallbackRewardEscrow(IRewardEscrowV2Frozen(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0));
        // Ensure the RewardsDistribution can read the RewardEscrowV2 address;
        rewardsdistribution_i.setRewardEscrow(new_RewardEscrowV2_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_17();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](5);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("RewardEscrowV2Storage");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[3] = bytes32("RewardEscrowV2");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](5);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_RewardEscrowV2Storage_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_RewardEscrowV2_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_RewardEscrowV2_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xC37c47C55d894443493c1e2E615f4F9f4b8fDEa4);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x803FD1d99C3a6cbcbABAB79C44e108dC2fb67102);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](6);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x34783A738DdC355cD7c737D4101b20622681332a);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_importAddresses_12() internal {
        bytes32[] memory addressresolver_importAddresses_names_12_0 = new bytes32[](1);
        addressresolver_importAddresses_names_12_0[0] = bytes32("RewardEscrowV2Frozen");
        address[] memory addressresolver_importAddresses_destinations_12_1 = new address[](1);
        addressresolver_importAddresses_destinations_12_1[0] = address(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_12_0,
            addressresolver_importAddresses_destinations_12_1
        );
    }

    function issuer_addSynths_17() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_17_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_17_0[0] = ISynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        issuer_addSynths_synthsToAdd_17_0[1] = ISynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        issuer_addSynths_synthsToAdd_17_0[2] = ISynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        issuer_addSynths_synthsToAdd_17_0[3] = ISynth(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        issuer_addSynths_synthsToAdd_17_0[4] = ISynth(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        issuer_addSynths_synthsToAdd_17_0[5] = ISynth(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        issuer_addSynths_synthsToAdd_17_0[6] = ISynth(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        issuer_addSynths_synthsToAdd_17_0[7] = ISynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        issuer_addSynths_synthsToAdd_17_0[8] = ISynth(0x34783A738DdC355cD7c737D4101b20622681332a);
        issuer_addSynths_synthsToAdd_17_0[9] = ISynth(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        issuer_addSynths_synthsToAdd_17_0[10] = ISynth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_17_0);
    }
}

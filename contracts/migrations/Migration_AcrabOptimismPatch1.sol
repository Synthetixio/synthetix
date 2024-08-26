pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../TokenState.sol";
import "../RewardsDistribution.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AcrabOptimismPatch1 is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x3f2A1F997Ef089798d19473D96be484Aeb3E4ECf
    address public constant new_Synthetix_contract = 0x3f2A1F997Ef089798d19473D96be484Aeb3E4ECf;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardsdistribution_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_2();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_importAddresses_1() internal {
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](1);
        addressresolver_importAddresses_names_1_0[0] = bytes32("Synthetix");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](1);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_Synthetix_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](9);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xB589Af3f2e3377A9a57da74bE1b6598926479505);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x24b4b6703a2eE7bA75a4Fc859B606F0bbaeef4EA);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xb4E0FA941376e101C29A9FA5A9C6a95489aA34cD);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xA6bc30d854c2647574921c4AF442008DB7d32ad5);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}

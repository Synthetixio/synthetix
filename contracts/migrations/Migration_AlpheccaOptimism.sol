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
contract Migration_AlpheccaOptimism is BaseMigration {
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

    // https://explorer.optimism.io/address/0x49B35BE7D96888C02F342552aB218d859599aCeb
    address public constant new_Synthetix_contract = 0x49B35BE7D96888C02F342552aB218d859599aCeb;
    // https://explorer.optimism.io/address/0xB589Af3f2e3377A9a57da74bE1b6598926479505
    address public constant new_Liquidator_contract = 0xB589Af3f2e3377A9a57da74bE1b6598926479505;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardsdistribution_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_Liquidator_contract).CONTRACT_NAME() == "Liquidator",
            "Invalid contract supplied for Liquidator"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](2);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Liquidator");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Liquidator_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](8);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x6330D5F08f51057F36F46d6751eCDc0c65Ef7E9e);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x24b4b6703a2eE7bA75a4Fc859B606F0bbaeef4EA);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x59B01789bF268C7C77451D02758621990bB50BBF);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_RasalhagueOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x0064A673267696049938AA47595dD0B3C2e705A1
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x0064A673267696049938AA47595dD0B3C2e705A1);
    // https://kovan-explorer.optimism.io/address/0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C
    TokenState public constant tokenstatesynthetix_i = TokenState(0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C);
    // https://kovan-explorer.optimism.io/address/0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x28CAb2c065bC0aAE84f6763e621B0b814C77922B
    address public constant new_Synthetix_contract = 0x28CAb2c065bC0aAE84f6763e621B0b814C77922B;

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](1);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](8);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xE50124A0C087EC06a273D0B9886902273B02d4D8);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xE45A27fd3ad929866CEFc6786d8360fF6665c660);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xfff685537fdbD9CA07BD863Ac0b422863BF3114f);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x638CCdbB9A014a73FA9b112962A754673582C7e7);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x5b643DFC67f9701929A0b55f23e0Af61df50E75D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

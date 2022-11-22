pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alphecca is BaseMigration {
    // https://goerli.etherscan.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli.etherscan.io/address/0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB
    AddressResolver public constant addressresolver_i = AddressResolver(0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB);
    // https://goerli.etherscan.io/address/0x51f44ca59b867E005e48FA573Cb8df83FC7f7597
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x51f44ca59b867E005e48FA573Cb8df83FC7f7597);
    // https://goerli.etherscan.io/address/0xe842C91A5D2BCE122d89497f171d81067255Ad0d
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0xe842C91A5D2BCE122d89497f171d81067255Ad0d);
    // https://goerli.etherscan.io/address/0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d);
    // https://goerli.etherscan.io/address/0x882eaF70e172b8543145811c5fE169d03740ba9a
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x882eaF70e172b8543145811c5fE169d03740ba9a);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli.etherscan.io/address/0xFC0E6442fC16e1caf52baa31f8043D8BE78AEb0D
    address public constant new_Synthetix_contract = 0xFC0E6442fC16e1caf52baa31f8043D8BE78AEb0D;
    // https://goerli.etherscan.io/address/0xc656c18721594f9E98B0C805AB9c21Bda5B44f4C
    address public constant new_Liquidator_contract = 0xc656c18721594f9E98B0C805AB9c21Bda5B44f4C;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardescrow_i);
        contracts[4] = address(rewardsdistribution_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix",
            "Invalid contract supplied for Synthetix"
        );
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
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
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
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](9);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x4300a068B3826aCEFaE7062b411aF467a34Bf3A6);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x601A1Cf1a34d9cF0020dCCD361c155Fe54CE24fB);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x6Ce575c870ce744e245Ef8400b6d89412C35c328);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x35a3F27736955394ee27Ce5348854670CE8D31DF);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x6eab29a0904d0fd964AdE1F6c3ab1584E36602aE);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x1427Bc44755d9Aa317535B1feE38922760Aa4e65);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x9B79D6dFe4650d70f35dbb80f7d1EC0Cf7f823Fd);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardsDistribution.sol";
import "../ExchangeRates.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlpheccaOptimism is BaseMigration {
    // https://goerli-explorer.optimism.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli-explorer.optimism.io/address/0x1d551351613a28d676BaC1Af157799e201279198
    AddressResolver public constant addressresolver_i = AddressResolver(0x1d551351613a28d676BaC1Af157799e201279198);
    // https://goerli-explorer.optimism.io/address/0x2E5ED97596a8368EB9E44B1f3F25B2E813845303
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x2E5ED97596a8368EB9E44B1f3F25B2E813845303);
    // https://goerli-explorer.optimism.io/address/0xB9525040A5B6a2d9e013240397079Fd1320559C4
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0xB9525040A5B6a2d9e013240397079Fd1320559C4);
    // https://goerli-explorer.optimism.io/address/0xb12704F8BddA7CF3eBa5F9A463404D4ba5d0e282
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xb12704F8BddA7CF3eBa5F9A463404D4ba5d0e282);
    // https://goerli-explorer.optimism.io/address/0x061B75475035c20ef2e35E1002Beb90C3c1f24cC
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x061B75475035c20ef2e35E1002Beb90C3c1f24cC);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli-explorer.optimism.io/address/0x8cF677281A8Ad57e0db4A8e6B57aE17211f97689
    address public constant new_Synthetix_contract = 0x8cF677281A8Ad57e0db4A8e6B57aE17211f97689;
    // https://goerli-explorer.optimism.io/address/0x5e042334B5Bb0434aB2512d16FfcD4Db61F94f18
    address public constant new_Liquidator_contract = 0x5e042334B5Bb0434aB2512d16FfcD4Db61F94f18;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(tokenstatesynthetix_i);
        contracts[3] = address(rewardsdistribution_i);
        contracts[4] = address(exchangerates_i);
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
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x69C5297001f38cCBE30a81359da06E5256bd28B9);

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
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xF6C92Ad11fa67b7b685aDb435FbE932c049B670c);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x1c6C0a89064206e397E75b11Bcd370E8A8A007B4);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x164724726608622b6e5Fa1aF8932b45A7Bd1a94D);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x59bd355dd9A853b345434474341178DbC27dC7a6);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x08fb827Ee5A00232aDe347964225Ba4344665eD5);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xD2b3F0Ea40dB68088415412b0043F37B3088836D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

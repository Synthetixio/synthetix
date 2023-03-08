pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Naos is BaseMigration {
    // https://goerli.etherscan.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli.etherscan.io/address/0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB
    AddressResolver public constant addressresolver_i = AddressResolver(0x0C80ff30d1e09135ec60cfe52B2c2EaE1B2f42AB);
    // https://goerli.etherscan.io/address/0x51f44ca59b867E005e48FA573Cb8df83FC7f7597
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x51f44ca59b867E005e48FA573Cb8df83FC7f7597);
    // https://goerli.etherscan.io/address/0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3
    SystemStatus public constant systemstatus_i = SystemStatus(0x31541f35F6Bd061f4A894fB7eEE565f81EE50df3);
    // https://goerli.etherscan.io/address/0xe842C91A5D2BCE122d89497f171d81067255Ad0d
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0xe842C91A5D2BCE122d89497f171d81067255Ad0d);
    // https://goerli.etherscan.io/address/0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x249BCCbFD33FA6653Db02aE2349444EF25E9B41d);
    // https://goerli.etherscan.io/address/0x882eaF70e172b8543145811c5fE169d03740ba9a
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x882eaF70e172b8543145811c5fE169d03740ba9a);
    // https://goerli.etherscan.io/address/0x91112d49095Febf1616af25be7f32Cf580DBC7A3
    Issuer public constant issuer_i = Issuer(0x91112d49095Febf1616af25be7f32Cf580DBC7A3);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli.etherscan.io/address/0x391683f29453E86ABd9FBA3Ab0a883EF77F5ACbC
    address public constant new_Synthetix_contract = 0x391683f29453E86ABd9FBA3Ab0a883EF77F5ACbC;
    // https://goerli.etherscan.io/address/0x91112d49095Febf1616af25be7f32Cf580DBC7A3
    address public constant new_Issuer_contract = 0x91112d49095Febf1616af25be7f32Cf580DBC7A3;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardescrow_i);
        contracts[5] = address(rewardsdistribution_i);
        contracts[6] = address(issuer_i);
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
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_9();

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
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](2);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x4300a068B3826aCEFaE7062b411aF467a34Bf3A6);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xc656c18721594f9E98B0C805AB9c21Bda5B44f4C);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x601A1Cf1a34d9cF0020dCCD361c155Fe54CE24fB);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x6Ce575c870ce744e245Ef8400b6d89412C35c328);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x6eab29a0904d0fd964AdE1F6c3ab1584E36602aE);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x1427Bc44755d9Aa317535B1feE38922760Aa4e65);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x9B79D6dFe4650d70f35dbb80f7d1EC0Cf7f823Fd);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x671C874C43B571878D6a90C5AA27288096eEac21);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x73d7fC96547eECCb3121dA7c0661554BE3e49236);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xc30BECA82f1f60DC0e4d3490428525985eef4D74);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x183B4A053CbA70a420E581918008Ef8e65d95E05);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xf1D0Ee19af243bcbC140A2259290B490E4df92A9);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x32A0BAA5Acec418a85Fd032f0292893B8E4f743B);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x4556b9761b2aC071D1665FAe01faA255a53d1307);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x86bfC5Be44f5DE1673824c0d0d1CCEA1306cD40e);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function issuer_addSynths_9() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_9_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_9_0[0] = ISynth(0x8f01E7815583C5Be70e4608Fde3DdE7DcC29592f);
        issuer_addSynths_synthsToAdd_9_0[1] = ISynth(0xB7774b79f83191eFF5F159889d1e7A5A242e2244);
        issuer_addSynths_synthsToAdd_9_0[2] = ISynth(0xD511a29AFF50503cCaF476EF9ebdd18Cbab1422c);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_9_0);
    }
}

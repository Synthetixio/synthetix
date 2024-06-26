pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../DebtCache.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AcrabOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x96bDD51Cd421CD84123577Fe5Ea44A45Dacf01BA
    DebtCache public constant debtcache_i = DebtCache(0x96bDD51Cd421CD84123577Fe5Ea44A45Dacf01BA);
    // https://explorer.optimism.io/address/0xb4E0FA941376e101C29A9FA5A9C6a95489aA34cD
    Issuer public constant issuer_i = Issuer(0xb4E0FA941376e101C29A9FA5A9C6a95489aA34cD);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x96bDD51Cd421CD84123577Fe5Ea44A45Dacf01BA
    address public constant new_DebtCache_contract = 0x96bDD51Cd421CD84123577Fe5Ea44A45Dacf01BA;
    // https://explorer.optimism.io/address/0xb4E0FA941376e101C29A9FA5A9C6a95489aA34cD
    address public constant new_Issuer_contract = 0xb4E0FA941376e101C29A9FA5A9C6a95489aA34cD;
    // https://explorer.optimism.io/address/0x64EA298C622c628C8b4C596c1e4403eb5AFcFff7
    address public constant new_DynamicSynthRedeemer_contract = 0x64EA298C622c628C8b4C596c1e4403eb5AFcFff7;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(debtcache_i);
        contracts[3] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_2();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_3();
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Import excluded-debt records from existing DebtCache;
        debtcache_i.importExcludedIssuedDebts(
            IDebtCache(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B),
            IIssuer(0xEb66Fc1BFdF3284Cb0CA1dE57149dcf3cEFa5453)
        );
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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](3);
        addressresolver_importAddresses_names_0_0[0] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[2] = bytes32("DynamicSynthRedeemer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_DynamicSynthRedeemer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x24b4b6703a2eE7bA75a4Fc859B606F0bbaeef4EA);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x5A41F634958dB9183e9d0d1Cd8Dee439B6ABb3BF);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x5Fc9B8d2B7766f061bD84a41255fD1A76Fd1FAa2);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xB589Af3f2e3377A9a57da74bE1b6598926479505);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xf9FE3607e6d19D8dC690DD976061a91D4A0db30B);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x803FD1d99C3a6cbcbABAB79C44e108dC2fb67102);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xA6bc30d854c2647574921c4AF442008DB7d32ad5);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(new_DynamicSynthRedeemer_contract);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](3);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function issuer_addSynths_9() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_9_0 = new ISynth[](4);
        issuer_addSynths_synthsToAdd_9_0[0] = ISynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        issuer_addSynths_synthsToAdd_9_0[1] = ISynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        issuer_addSynths_synthsToAdd_9_0[2] = ISynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        issuer_addSynths_synthsToAdd_9_0[3] = ISynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_9_0);
    }
}

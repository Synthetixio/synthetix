pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRates.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_SuhailOptimism is BaseMigration {
    // https://goerli-explorer.optimism.io/address/0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;
    address public constant OWNER = 0x48914229deDd5A9922f44441ffCCfC2Cb7856Ee9;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://goerli-explorer.optimism.io/address/0x1d551351613a28d676BaC1Af157799e201279198
    AddressResolver public constant addressresolver_i = AddressResolver(0x1d551351613a28d676BaC1Af157799e201279198);
    // https://goerli-explorer.optimism.io/address/0xeD5D12c5A772F32dE608CF84F671C123e132FA80
    ExchangeState public constant exchangestate_i = ExchangeState(0xeD5D12c5A772F32dE608CF84F671C123e132FA80);
    // https://goerli-explorer.optimism.io/address/0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916
    SystemStatus public constant systemstatus_i = SystemStatus(0x9D89fF8C6f3CC22F4BbB859D0F85FB3a4e1FA916);
    // https://goerli-explorer.optimism.io/address/0x061B75475035c20ef2e35E1002Beb90C3c1f24cC
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x061B75475035c20ef2e35E1002Beb90C3c1f24cC);
    // https://goerli-explorer.optimism.io/address/0x59bd355dd9A853b345434474341178DbC27dC7a6
    Issuer public constant issuer_i = Issuer(0x59bd355dd9A853b345434474341178DbC27dC7a6);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://goerli-explorer.optimism.io/address/0x418B1025f74E8BB889D35e9F37205d587743Ec9b
    address public constant new_SystemSettings_contract = 0x418B1025f74E8BB889D35e9F37205d587743Ec9b;
    // https://goerli-explorer.optimism.io/address/0x061B75475035c20ef2e35E1002Beb90C3c1f24cC
    address public constant new_ExchangeRates_contract = 0x061B75475035c20ef2e35E1002Beb90C3c1f24cC;
    // https://goerli-explorer.optimism.io/address/0x164724726608622b6e5Fa1aF8932b45A7Bd1a94D
    address public constant new_Exchanger_contract = 0x164724726608622b6e5Fa1aF8932b45A7Bd1a94D;
    // https://goerli-explorer.optimism.io/address/0x59bd355dd9A853b345434474341178DbC27dC7a6
    address public constant new_Issuer_contract = 0x59bd355dd9A853b345434474341178DbC27dC7a6;
    // https://goerli-explorer.optimism.io/address/0xbDC73F42943bAce3A4eEE280650e80531Cc6a38C
    address public constant new_DirectIntegrationManager_contract = 0xbDC73F42943bAce3A4eEE280650e80531Cc6a38C;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangestate_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(exchangerates_i);
        contracts[4] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_3();
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x89A7630f46B8c35A7fBBC4f6e4783f1E2DC715c6);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x57241A37733983F97C4Ab06448F244A1E0Ca0ba8);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xC16679B963CeB52089aD2d95312A5b85E318e9d2);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x69C5297001f38cCBE30a81359da06E5256bd28B9);
        // Ensure the ExchangeRates contract has the standalone feed for SOL;
        exchangerates_i.addAggregator("SOL", 0x5756666B2991F7C9c05Fbb71daC703Cf58F293BF);
        // Ensure the ExchangeRates contract has the standalone feed for AVAX;
        exchangerates_i.addAggregator("AVAX", 0xE9512B064104593083e39630a8f874cfa6B1C0A5);
        // Ensure the ExchangeRates contract has the standalone feed for MATIC;
        exchangerates_i.addAggregator("MATIC", 0x11C944427B9ebeb1417Dd44645Ad04edBF33b95e);
        // Ensure the ExchangeRates contract has the standalone feed for EUR;
        exchangerates_i.addAggregator("EUR", 0x619AeaaF08dF3645e138C611bddCaE465312Ef6B);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0xe634FfeDcA25B6D5D4610D2025C4894cCd5a5587);
        // Ensure the ExchangeRates contract has the standalone feed for UNI;
        exchangerates_i.addAggregator("UNI", 0x0A024aa48E09e151090637d2b68162b1Caf7BdbA);
        // Ensure the ExchangeRates contract has the standalone feed for XAU;
        exchangerates_i.addAggregator("XAU", 0xA8828D339CEFEBf99934e5fdd938d1B4B9730bc3);
        // Ensure the ExchangeRates contract has the standalone feed for XAG;
        exchangerates_i.addAggregator("XAG", 0xE68AF7b40A0Cc9C5E9E2B2a36b85442Ab9C3E4Cd);
        // Ensure the ExchangeRates contract has the standalone feed for APE;
        exchangerates_i.addAggregator("APE", 0xE882831E58eec48B7f304482771F67e6b846733D);
        // Ensure the ExchangeRates contract has the standalone feed for DYDX;
        exchangerates_i.addAggregator("DYDX", 0x6CcbE5aDBf519C2C916ADB4390A3dbD72fFcA7F2);
        // Ensure the ExchangeRates contract has the standalone feed for BNB;
        exchangerates_i.addAggregator("BNB", 0x99fc60321a196794725E6D0c572143eb2F881edB);
        // Ensure the ExchangeRates contract has the standalone feed for XMR;
        exchangerates_i.addAggregator("XMR", 0xaA4D946f4b081Cc6c2F30b4e343E15c8455DDfFB);
        // Ensure the ExchangeRates contract has the standalone feed for DOGE;
        exchangerates_i.addAggregator("DOGE", 0xd3277B9Db5008116cd8727Fc00E704F2Db2e578F);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x57241A37733983F97C4Ab06448F244A1E0Ca0ba8);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xC16679B963CeB52089aD2d95312A5b85E318e9d2);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_30();

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[4] = bytes32("DirectIntegrationManager");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](5);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_DirectIntegrationManager_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x3F3f0fb2b35cFAc95EDd08403633f29687E32f0D);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x216EaF79575563A5e13227ad075850cDeb004083);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x5cB8210159f486dFE8Dc779357ee5A15B8f233bC);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xFdb50671276DbC9D24D68b272B54dE4a87aaCc6c);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xD2b3F0Ea40dB68088415412b0043F37B3088836D);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x4BbDe1e5f91e6E8928CdCBF800aC990015387EbA);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x0440f82444C825a0842f50e1c25cb68676d736e3);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x35725C94f3B1aB6BbD533c0B6Df525537d422c5F);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x1a471C12f7efd7adB0065E3c7e457a0c36c13490);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x11c6e5D94b91D87EF392109f28474ABfC09DddCb);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x216B2767C7E28f26878e668a6a06d3C364dE0725);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x08fb827Ee5A00232aDe347964225Ba4344665eD5);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x95d6B120862986Fb605B0ccD1f0E8a71f5f4fB2c);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x2f421752B7C07268DEA60A1B39D67927a5abA2F6);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x0D10c032ad006C98C33A95e59ab3BA2b0849bD59);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x071171c2289b2Aef8F83eC50650f8eb91DbE44d2);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xc6fD6AD47e393a44283Eb2f7a058807C64853aA1);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xc6af1F51b262616BC7DBc3F000Df154709AEe1Bd);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x1E246e2bc7dc1e2baDa90dC824c71deAaBa65eE2);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xE89f6f10Dd2e200440198a6b773E16e3c9B1478C);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x2f1e8B79E9032b9f43A40d61fa4F446c3eFCf165);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x89F36593eeD8807C43e81Ce7d633e15365274eeF);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xAd4d525C8B6eAE32c3BFE8de5c7f87791690CdB3);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xA7C788d7f5B177AfB3c7B3Af815C678F6181a163);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x122c1a5E0140bA0E3c7a44418bd83E9e5b049295);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x3F66f483b8A66EcBbF3385E5Df6C581c2378d8B7);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x0Ee2c2E01072c5Fa866BB3372Fe81698FB3165bA);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xc006bd42B2ca95Cd640D314dA3DF4c59436C7739);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0xF6C92Ad11fa67b7b685aDb435FbE932c049B670c);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x3c710172e7f95aCAaDeD243982a90F8F235fF9f1);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x1c6C0a89064206e397E75b11Bcd370E8A8A007B4);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0x2A8338199D802620B4516a557195a498595d7Eb6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](1);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(new_DirectIntegrationManager_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function issuer_addSynths_30() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_30_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_30_0[0] = ISynth(0xfDa54191F3C0999dbf4c193dEF1B83EDD3e3Ba39);
        issuer_addSynths_synthsToAdd_30_0[1] = ISynth(0x7D442107e2AD048C02F06332C918b1F81bd6850d);
        issuer_addSynths_synthsToAdd_30_0[2] = ISynth(0xFdB84151Bfc76857398BC3efd8d1b32A32c571f2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_30_0);
    }
}

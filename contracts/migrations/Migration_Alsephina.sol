pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alsephina is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);
    // https://etherscan.io/address/0xF68ECd50de7733015318361295547D8E939F93E6
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0xF68ECd50de7733015318361295547D8E939F93E6);
    // https://etherscan.io/address/0x80d65Bb7b9436A86c1928F93D6E7cc186987Ac54
    SystemSettings public constant systemsettings_i = SystemSettings(0x80d65Bb7b9436A86c1928F93D6E7cc186987Ac54);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xa62F71D599Ec6179B4f6569adD69ffC7E1A7a1c5
    address public constant new_SystemSettingsLib_contract = 0xa62F71D599Ec6179B4f6569adD69ffC7E1A7a1c5;
    // https://etherscan.io/address/0x80d65Bb7b9436A86c1928F93D6E7cc186987Ac54
    address public constant new_SystemSettings_contract = 0x80d65Bb7b9436A86c1928F93D6E7cc186987Ac54;
    // https://etherscan.io/address/0xF68ECd50de7733015318361295547D8E939F93E6
    address public constant new_ExchangeRates_contract = 0xF68ECd50de7733015318361295547D8E939F93E6;
    // https://etherscan.io/address/0x3e343E89F4fF8057806F54F2208940B1Cd5C40ca
    address public constant new_Exchanger_contract = 0x3e343E89F4fF8057806F54F2208940B1Cd5C40ca;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](5);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangestate_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(exchangerates_i);
        contracts[4] = address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyOwner {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
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
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Exchanger contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_Exchanger_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x01435677FB11763550905594A16B645847C1d0F3);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the ExchangeRates contract has the feed for sADA;
        exchangerates_i.addAggregator("sADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the ExchangeRates contract has the feed for sDOT;
        exchangerates_i.addAggregator("sDOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the ExchangeRates contract has the feed for sETHBTC;
        exchangerates_i.addAggregator("sETHBTC", 0xAc559F25B1619171CbC396a50854A3240b6A4e99);
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0xa8E875F94138B0C5b51d1e1d5dE35bbDdd28EA87);
        // Set exchange dynamic fee threshold (SIP-184);
        systemsettings_i.setExchangeDynamicFeeThreshold(4000000000000000);
        // Set exchange dynamic fee weight decay (SIP-184);
        systemsettings_i.setExchangeDynamicFeeWeightDecay(900000000000000000);
        // Set exchange dynamic fee rounds (SIP-184);
        systemsettings_i.setExchangeDynamicFeeRounds(0);
        // Set exchange max dynamic fee (SIP-184);
        systemsettings_i.setExchangeMaxDynamicFee(50000000000000000);
        // SIP-120 Set the DEX price aggregator (uniswap TWAP oracle reader);
        exchangerates_i.setDexPriceAggregator(IDexPriceAggregator(0xf120F029Ac143633d1942e48aE2Dfa2036C5786c));

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xF66d34426C10CE91cDBcd86F8e9594AfB83049bd);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xDC01020857afbaE65224CfCeDb265d1216064c59);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xde3892383965FBa6eC434bE6350F85f140098708);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](10);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xe2f532c389deb5E42DCe53e78A9762949A885455);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xc70B42930BD8D30A79B55415deC3be60827559f7);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xcc3aab773e2171b2E257Ee17001400eE378aa52B);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}

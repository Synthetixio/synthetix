pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Muhlifain is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632);
    // https://etherscan.io/address/0x8D1201b074EeF198D5e6957F4574e2e4FC5Ba9Cf
    Issuer public constant issuer_i = Issuer(0x8D1201b074EeF198D5e6957F4574e2e4FC5Ba9Cf);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632
    address public constant new_ExchangeRates_contract = 0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632;
    // https://etherscan.io/address/0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558
    address public constant new_Exchanger_contract = 0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558;
    // https://etherscan.io/address/0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf
    address public constant new_CircuitBreaker_contract = 0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf;
    // https://etherscan.io/address/0x8D1201b074EeF198D5e6957F4574e2e4FC5Ba9Cf
    address public constant new_Issuer_contract = 0x8D1201b074EeF198D5e6957F4574e2e4FC5Ba9Cf;

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
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
        );
        require(
            ISynthetixNamedContract(new_CircuitBreaker_contract).CONTRACT_NAME() == "CircuitBreaker",
            "Invalid contract supplied for CircuitBreaker"
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
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the ExchangeRates contract has the standalone feed for DOT;
        exchangerates_i.addAggregator("DOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the ExchangeRates contract has the standalone feed for ADA;
        exchangerates_i.addAggregator("ADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the ExchangeRates contract has the standalone feed for ETHBTC;
        exchangerates_i.addAggregator("ETHBTC", 0xAc559F25B1619171CbC396a50854A3240b6A4e99);
        // Ensure the ExchangeRates contract has the standalone feed for EUR;
        exchangerates_i.addAggregator("EUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the ExchangeRates contract has the standalone feed for JPY;
        exchangerates_i.addAggregator("JPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the ExchangeRates contract has the standalone feed for AUD;
        exchangerates_i.addAggregator("AUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the ExchangeRates contract has the standalone feed for GBP;
        exchangerates_i.addAggregator("GBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the ExchangeRates contract has the standalone feed for CHF;
        exchangerates_i.addAggregator("CHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the ExchangeRates contract has the standalone feed for KRW;
        exchangerates_i.addAggregator("KRW", 0x01435677FB11763550905594A16B645847C1d0F3);
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_36();
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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](4);
        addressresolver_importAddresses_names_0_0[0] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[2] = bytes32("CircuitBreaker");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](4);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_CircuitBreaker_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x0e5fe1b05612581576e9A3dB048416d0B1E3C425);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_CircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xCea392596F1AB7f1d6f8F241967094cA519E6129);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x08F30Ecf2C15A783083ab9D5b9211c22388d0564);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0xf79603a71144e415730C1A6f57F366E4Ea962C00);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_36() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_36_0 = new ISynth[](14);
        issuer_addSynths_synthsToAdd_36_0[0] = ISynth(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        issuer_addSynths_synthsToAdd_36_0[1] = ISynth(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        issuer_addSynths_synthsToAdd_36_0[2] = ISynth(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        issuer_addSynths_synthsToAdd_36_0[3] = ISynth(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        issuer_addSynths_synthsToAdd_36_0[4] = ISynth(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        issuer_addSynths_synthsToAdd_36_0[5] = ISynth(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        issuer_addSynths_synthsToAdd_36_0[6] = ISynth(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        issuer_addSynths_synthsToAdd_36_0[7] = ISynth(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        issuer_addSynths_synthsToAdd_36_0[8] = ISynth(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        issuer_addSynths_synthsToAdd_36_0[9] = ISynth(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        issuer_addSynths_synthsToAdd_36_0[10] = ISynth(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        issuer_addSynths_synthsToAdd_36_0[11] = ISynth(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        issuer_addSynths_synthsToAdd_36_0[12] = ISynth(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        issuer_addSynths_synthsToAdd_36_0[13] = ISynth(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_36_0);
    }
}

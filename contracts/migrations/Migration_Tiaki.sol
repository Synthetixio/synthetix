pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeRatesWithDexPricing.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Tiaki is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0x9729415A58b210b2b8f69cFa5d6C3A7D68c9D217
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x9729415A58b210b2b8f69cFa5d6C3A7D68c9D217);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x9729415A58b210b2b8f69cFa5d6C3A7D68c9D217
    address public constant new_ExchangeRates_contract = 0x9729415A58b210b2b8f69cFa5d6C3A7D68c9D217;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](2);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangerates_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](1);
        addressresolver_importAddresses_names_0_0[0] = bytes32("ExchangeRates");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](1);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ExchangeRates_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](14);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x0e5fe1b05612581576e9A3dB048416d0B1E3C425);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xD64D83829D92B5bdA881f6f61A4e4E27Fc185387);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xc9380E4A1570cce7b99eeD107aC42C754c4CE3Bf);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xCea392596F1AB7f1d6f8F241967094cA519E6129);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }
}

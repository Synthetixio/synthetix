pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../ExchangeRates.sol";
import "../Issuer.sol";
import "../FuturesMarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MuhlifainOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8
    ExchangeState public constant exchangestate_i = ExchangeState(0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0x0cA3985f973f044978d2381AFEd9c4D85a762d11
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x0cA3985f973f044978d2381AFEd9c4D85a762d11);
    // https://explorer.optimism.io/address/0x01da457Aa57abc0dBa3fc26d6C350899F04E8417
    Issuer public constant issuer_i = Issuer(0x01da457Aa57abc0dBa3fc26d6C350899F04E8417);
    // https://explorer.optimism.io/address/0xaE55F163337A2A46733AA66dA9F35299f9A46e9e
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xaE55F163337A2A46733AA66dA9F35299f9A46e9e);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x0cA3985f973f044978d2381AFEd9c4D85a762d11
    address public constant new_ExchangeRates_contract = 0x0cA3985f973f044978d2381AFEd9c4D85a762d11;
    // https://explorer.optimism.io/address/0x803FD1d99C3a6cbcbABAB79C44e108dC2fb67102
    address public constant new_CircuitBreaker_contract = 0x803FD1d99C3a6cbcbABAB79C44e108dC2fb67102;
    // https://explorer.optimism.io/address/0x01da457Aa57abc0dBa3fc26d6C350899F04E8417
    address public constant new_Issuer_contract = 0x01da457Aa57abc0dBa3fc26d6C350899F04E8417;
    // https://explorer.optimism.io/address/0xC37c47C55d894443493c1e2E615f4F9f4b8fDEa4
    address public constant new_Exchanger_contract = 0xC37c47C55d894443493c1e2E615f4F9f4b8fDEa4;
    // https://explorer.optimism.io/address/0xd325B17d5C9C3f2B6853A760afCF81945b0184d3
    address public constant new_FuturesMarketDebtRatio_contract = 0xd325B17d5C9C3f2B6853A760afCF81945b0184d3;
    // https://explorer.optimism.io/address/0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558
    address public constant new_FuturesMarketXMR_contract = 0x3Ed04CEfF4c91872F19b1da35740C0Be9CA21558;
    // https://explorer.optimism.io/address/0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632
    address public constant new_FuturesMarketOP_contract = 0x9F1C2f0071Bc3b31447AEda9fA3A68d651eB4632;
    // https://explorer.optimism.io/address/0x4Aa0dabd22BC0894975324Bec293443c8538bD08
    address public constant new_FuturesMarketBNB_contract = 0x4Aa0dabd22BC0894975324Bec293443c8538bD08;
    // https://explorer.optimism.io/address/0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf
    address public constant new_FuturesMarketDOGE_contract = 0x9f231dBE53D460f359B2B8CC47574493caA5B7Bf;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(exchangerates_i);
        contracts[5] = address(issuer_i);
        contracts[6] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_CircuitBreaker_contract).CONTRACT_NAME() == "CircuitBreaker",
            "Invalid contract supplied for CircuitBreaker"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        futuresmarketmanager_addMarkets_0();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_2();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_3();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_4();
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x2FCF37343e916eAEd1f1DdaaF84458a359b53877);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x13e3Ee699D1909E989722E753853AE30b17e08c5);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0xCc232dcFAAE6354cE191Bd574108c1aD03f86450);
        // Ensure the ExchangeRates contract has the standalone feed for SOL;
        exchangerates_i.addAggregator("SOL", 0xC663315f7aF904fbbB0F785c32046dFA03e85270);
        // Ensure the ExchangeRates contract has the standalone feed for AVAX;
        exchangerates_i.addAggregator("AVAX", 0x5087Dc69Fd3907a016BD42B38022F7f024140727);
        // Ensure the ExchangeRates contract has the standalone feed for MATIC;
        exchangerates_i.addAggregator("MATIC", 0x0ded608AFc23724f614B76955bbd9dFe7dDdc828);
        // Ensure the ExchangeRates contract has the standalone feed for EUR;
        exchangerates_i.addAggregator("EUR", 0x3626369857A10CcC6cc3A6e4f5C2f5984a519F20);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0x338ed6787f463394D24813b297401B9F05a8C9d1);
        // Ensure the ExchangeRates contract has the standalone feed for UNI;
        exchangerates_i.addAggregator("UNI", 0x11429eE838cC01071402f21C219870cbAc0a59A0);
        // Ensure the ExchangeRates contract has the standalone feed for XAU;
        exchangerates_i.addAggregator("XAU", 0x8F7bFb42Bf7421c2b34AAD619be4654bFa7B3B8B);
        // Ensure the ExchangeRates contract has the standalone feed for XAG;
        exchangerates_i.addAggregator("XAG", 0x290dd71254874f0d4356443607cb8234958DEe49);
        // Ensure the ExchangeRates contract has the standalone feed for INR;
        exchangerates_i.addAggregator("INR", 0x5535e67d8f99c8ebe961E1Fc1F6DDAE96FEC82C9);
        // Ensure the ExchangeRates contract has the standalone feed for APE;
        exchangerates_i.addAggregator("APE", 0x89178957E9bD07934d7792fFc0CF39f11c8C2B1F);
        // Ensure the ExchangeRates contract has the standalone feed for DYDX;
        exchangerates_i.addAggregator("DYDX", 0xee35A95c9a064491531493D8b380bC40A4CCd0Da);
        // Ensure the ExchangeRates contract has the standalone feed for DebtRatio;
        exchangerates_i.addAggregator("DebtRatio", 0x94A178f2c480D14F8CdDa908D173d7a73F779cb7);
        // Ensure the ExchangeRates contract has the standalone feed for BNB;
        exchangerates_i.addAggregator("BNB", 0xD38579f7cBD14c22cF1997575eA8eF7bfe62ca2c);
        // Ensure the ExchangeRates contract has the standalone feed for OP;
        exchangerates_i.addAggregator("OP", 0x0D276FC14719f9292D5C1eA2198673d1f4269246);
        // Ensure the ExchangeRates contract has the standalone feed for XMR;
        exchangerates_i.addAggregator("XMR", 0x2a8D91686A048E98e6CCF1A89E82f40D14312672);
        // Ensure the ExchangeRates contract has the standalone feed for DOGE;
        exchangerates_i.addAggregator("DOGE", 0xC6066533917f034Cf610c08e1fe5e9c7eADe0f54);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x13e3Ee699D1909E989722E753853AE30b17e08c5);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0xCc232dcFAAE6354cE191Bd574108c1aD03f86450);
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xC663315f7aF904fbbB0F785c32046dFA03e85270);
        // Ensure the ExchangeRates contract has the feed for sAVAX;
        exchangerates_i.addAggregator("sAVAX", 0x5087Dc69Fd3907a016BD42B38022F7f024140727);
        // Ensure the ExchangeRates contract has the feed for sMATIC;
        exchangerates_i.addAggregator("sMATIC", 0x0ded608AFc23724f614B76955bbd9dFe7dDdc828);
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0x3626369857A10CcC6cc3A6e4f5C2f5984a519F20);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x338ed6787f463394D24813b297401B9F05a8C9d1);
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0x11429eE838cC01071402f21C219870cbAc0a59A0);
        // Ensure the ExchangeRates contract has the feed for sXAU;
        exchangerates_i.addAggregator("sXAU", 0x8F7bFb42Bf7421c2b34AAD619be4654bFa7B3B8B);
        // Ensure the ExchangeRates contract has the feed for sXAG;
        exchangerates_i.addAggregator("sXAG", 0x290dd71254874f0d4356443607cb8234958DEe49);
        // Ensure the ExchangeRates contract has the feed for sINR;
        exchangerates_i.addAggregator("sINR", 0x5535e67d8f99c8ebe961E1Fc1F6DDAE96FEC82C9);
        // Ensure the ExchangeRates contract has the feed for sAPE;
        exchangerates_i.addAggregator("sAPE", 0x89178957E9bD07934d7792fFc0CF39f11c8C2B1F);
        // Ensure the ExchangeRates contract has the feed for sDYDX;
        exchangerates_i.addAggregator("sDYDX", 0xee35A95c9a064491531493D8b380bC40A4CCd0Da);
        // Ensure the ExchangeRates contract has the feed for sDebtRatio;
        exchangerates_i.addAggregator("sDebtRatio", 0x94A178f2c480D14F8CdDa908D173d7a73F779cb7);
        // Ensure the ExchangeRates contract has the feed for sBNB;
        exchangerates_i.addAggregator("sBNB", 0xD38579f7cBD14c22cF1997575eA8eF7bfe62ca2c);
        // Ensure the ExchangeRates contract has the feed for sOP;
        exchangerates_i.addAggregator("sOP", 0x0D276FC14719f9292D5C1eA2198673d1f4269246);
        // Ensure the ExchangeRates contract has the feed for sXMR;
        exchangerates_i.addAggregator("sXMR", 0x2a8D91686A048E98e6CCF1A89E82f40D14312672);
        // Ensure the ExchangeRates contract has the feed for sDOGE;
        exchangerates_i.addAggregator("sDOGE", 0xC6066533917f034Cf610c08e1fe5e9c7eADe0f54);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_46();
        futuresmarketsettings_i.setTakerFee("sDebtRatio", 6000000000000000);
        futuresmarketsettings_i.setMakerFee("sDebtRatio", 6000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sDebtRatio", 1500000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sDebtRatio", 1500000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sDebtRatio", 2);
        futuresmarketsettings_i.setMaxLeverage("sDebtRatio", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sDebtRatio", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sDebtRatio", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sDebtRatio", 5000000000000000000000000);

        futuresmarketsettings_i.setTakerFee("sBNB", 4000000000000000);
        futuresmarketsettings_i.setMakerFee("sBNB", 3500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sBNB", 3000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sBNB", 3000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sBNB", 2);
        futuresmarketsettings_i.setMaxLeverage("sBNB", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sBNB", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sBNB", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sBNB", 50000000000000000000000000);

        futuresmarketsettings_i.setTakerFee("sOP", 4000000000000000);
        futuresmarketsettings_i.setMakerFee("sOP", 3500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sOP", 3000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sOP", 3000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sOP", 2);
        futuresmarketsettings_i.setMaxLeverage("sOP", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sOP", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sOP", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sOP", 50000000000000000000000000);

        futuresmarketsettings_i.setTakerFee("sXMR", 4000000000000000);
        futuresmarketsettings_i.setMakerFee("sXMR", 3500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sXMR", 3000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sXMR", 3000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sXMR", 2);
        futuresmarketsettings_i.setMaxLeverage("sXMR", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sXMR", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sXMR", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sXMR", 50000000000000000000000000);

        futuresmarketsettings_i.setTakerFee("sDOGE", 4000000000000000);
        futuresmarketsettings_i.setMakerFee("sDOGE", 3500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sDOGE", 3000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sDOGE", 3000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sDOGE", 2);
        futuresmarketsettings_i.setMaxLeverage("sDOGE", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sDOGE", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sDOGE", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sDOGE", 50000000000000000000000000);

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

    function futuresmarketmanager_addMarkets_0() internal {
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_0_0 = new address[](5);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[0] = address(new_FuturesMarketDebtRatio_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[1] = address(new_FuturesMarketBNB_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[2] = address(new_FuturesMarketOP_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[3] = address(new_FuturesMarketXMR_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[4] = address(new_FuturesMarketDOGE_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_0_0);
    }

    function addressresolver_importAddresses_1() internal {
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](9);
        addressresolver_importAddresses_names_1_0[0] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_1_0[1] = bytes32("CircuitBreaker");
        addressresolver_importAddresses_names_1_0[2] = bytes32("Issuer");
        addressresolver_importAddresses_names_1_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_1_0[4] = bytes32("FuturesMarketDebtRatio");
        addressresolver_importAddresses_names_1_0[5] = bytes32("FuturesMarketXMR");
        addressresolver_importAddresses_names_1_0[6] = bytes32("FuturesMarketOP");
        addressresolver_importAddresses_names_1_0[7] = bytes32("FuturesMarketBNB");
        addressresolver_importAddresses_names_1_0[8] = bytes32("FuturesMarketDOGE");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](9);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_CircuitBreaker_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_FuturesMarketDebtRatio_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_FuturesMarketXMR_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_FuturesMarketOP_contract);
        addressresolver_importAddresses_destinations_1_1[7] = address(new_FuturesMarketBNB_contract);
        addressresolver_importAddresses_destinations_1_1[8] = address(new_FuturesMarketDOGE_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_CircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xD21969A86Ce5c41aAb2D492a0F802AA3e015cd9A);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xeb4b5ABcE7310855319440d936cd3aDd77DFA193);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xFE8E48Bf36ccC3254081eC8C65965D1c8b2E744D);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0x34783A738DdC355cD7c737D4101b20622681332a);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(0xf86048DFf23cF130107dfB4e6386f574231a5C65);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A);
        addressresolver_rebuildCaches_destinations_3_0[17] = MixinResolver(0xcF853f7f8F78B2B801095b66F8ba9c5f04dB1640);
        addressresolver_rebuildCaches_destinations_3_0[18] = MixinResolver(0x4ff54624D5FB61C34c634c3314Ed3BfE4dBB665a);
        addressresolver_rebuildCaches_destinations_3_0[19] = MixinResolver(0x001b7876F567f0b3A639332Ed1e363839c6d85e2);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function addressresolver_rebuildCaches_4() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_4_0 = new MixinResolver[](12);
        addressresolver_rebuildCaches_destinations_4_0[0] = MixinResolver(0x5Af0072617F7f2AEB0e314e2faD1DE0231Ba97cD);
        addressresolver_rebuildCaches_destinations_4_0[1] = MixinResolver(0xbCB2D435045E16B059b2130b28BE70b5cA47bFE5);
        addressresolver_rebuildCaches_destinations_4_0[2] = MixinResolver(0x4434f56ddBdE28fab08C4AE71970a06B300F8881);
        addressresolver_rebuildCaches_destinations_4_0[3] = MixinResolver(0xb147C69BEe211F57290a6cde9d1BAbfD0DCF3Ea3);
        addressresolver_rebuildCaches_destinations_4_0[4] = MixinResolver(0xad44873632840144fFC97b2D1de716f6E2cF0366);
        addressresolver_rebuildCaches_destinations_4_0[5] = MixinResolver(0xFe00395ec846240dc693e92AB2Dd720F94765Aa3);
        addressresolver_rebuildCaches_destinations_4_0[6] = MixinResolver(0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf);
        addressresolver_rebuildCaches_destinations_4_0[7] = MixinResolver(new_FuturesMarketDebtRatio_contract);
        addressresolver_rebuildCaches_destinations_4_0[8] = MixinResolver(new_FuturesMarketBNB_contract);
        addressresolver_rebuildCaches_destinations_4_0[9] = MixinResolver(new_FuturesMarketOP_contract);
        addressresolver_rebuildCaches_destinations_4_0[10] = MixinResolver(new_FuturesMarketXMR_contract);
        addressresolver_rebuildCaches_destinations_4_0[11] = MixinResolver(new_FuturesMarketDOGE_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_4_0);
    }

    function issuer_addSynths_46() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_46_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_46_0[0] = ISynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        issuer_addSynths_synthsToAdd_46_0[1] = ISynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        issuer_addSynths_synthsToAdd_46_0[2] = ISynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        issuer_addSynths_synthsToAdd_46_0[3] = ISynth(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        issuer_addSynths_synthsToAdd_46_0[4] = ISynth(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        issuer_addSynths_synthsToAdd_46_0[5] = ISynth(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        issuer_addSynths_synthsToAdd_46_0[6] = ISynth(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        issuer_addSynths_synthsToAdd_46_0[7] = ISynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        issuer_addSynths_synthsToAdd_46_0[8] = ISynth(0x34783A738DdC355cD7c737D4101b20622681332a);
        issuer_addSynths_synthsToAdd_46_0[9] = ISynth(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        issuer_addSynths_synthsToAdd_46_0[10] = ISynth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_46_0);
    }
}

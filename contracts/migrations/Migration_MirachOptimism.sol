pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeRates.sol";
import "../ExchangeState.sol";
import "../FuturesMarketManager.sol";
import "../FuturesMarketSettings.sol";
import "../Issuer.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MirachOptimism is BaseMigration {
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
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8
    ExchangeState public constant exchangestate_i = ExchangeState(0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0x22602469d704BfFb0936c7A7cfcD18f7aA269375
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x22602469d704BfFb0936c7A7cfcD18f7aA269375);
    // https://explorer.optimism.io/address/0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6
    TokenState public constant tokenstatesinr_i = TokenState(0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6);
    // https://explorer.optimism.io/address/0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF
    ProxyERC20 public constant proxysinr_i = ProxyERC20(0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF);
    // https://explorer.optimism.io/address/0xfBa85D793FF7fAa973c1bEd1C698cEE692a4c306
    Issuer public constant issuer_i = Issuer(0xfBa85D793FF7fAa973c1bEd1C698cEE692a4c306);
    // https://explorer.optimism.io/address/0x1c7A2E680849bC9C6ab8b437A28885C028739B82
    SystemSettings public constant systemsettings_i = SystemSettings(0x1c7A2E680849bC9C6ab8b437A28885C028739B82);
    // https://explorer.optimism.io/address/0xaE55F163337A2A46733AA66dA9F35299f9A46e9e
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xaE55F163337A2A46733AA66dA9F35299f9A46e9e);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0x22602469d704BfFb0936c7A7cfcD18f7aA269375
    address public constant new_ExchangeRates_contract = 0x22602469d704BfFb0936c7A7cfcD18f7aA269375;
    // https://explorer.optimism.io/address/0x1c7A2E680849bC9C6ab8b437A28885C028739B82
    address public constant new_SystemSettings_contract = 0x1c7A2E680849bC9C6ab8b437A28885C028739B82;
    // https://explorer.optimism.io/address/0x2369D37ae9B30451D859C11CAbAc70df1CE48F78
    address public constant new_Synthetix_contract = 0x2369D37ae9B30451D859C11CAbAc70df1CE48F78;
    // https://explorer.optimism.io/address/0x0a1059c33ce5cd3345BBca557b8e44F4088FC359
    address public constant new_Exchanger_contract = 0x0a1059c33ce5cd3345BBca557b8e44F4088FC359;
    // https://explorer.optimism.io/address/0xfBa85D793FF7fAa973c1bEd1C698cEE692a4c306
    address public constant new_Issuer_contract = 0xfBa85D793FF7fAa973c1bEd1C698cEE692a4c306;
    // https://explorer.optimism.io/address/0x136b1EC699c62b0606854056f02dC7Bb80482d63
    address public constant new_SynthetixBridgeToBase_contract = 0x136b1EC699c62b0606854056f02dC7Bb80482d63;
    // https://explorer.optimism.io/address/0xc66499aCe3B6c6a30c784bE5511E8d338d543913
    address public constant new_SynthsINR_contract = 0xc66499aCe3B6c6a30c784bE5511E8d338d543913;
    // https://explorer.optimism.io/address/0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF
    address public constant new_ProxysINR_contract = 0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF;
    // https://explorer.optimism.io/address/0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6
    address public constant new_TokenStatesINR_contract = 0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6;
    // https://explorer.optimism.io/address/0xFe00395ec846240dc693e92AB2Dd720F94765Aa3
    address public constant new_FuturesMarketAPE_contract = 0xFe00395ec846240dc693e92AB2Dd720F94765Aa3;
    // https://explorer.optimism.io/address/0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf
    address public constant new_FuturesMarketDYDX_contract = 0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](13);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(proxysynthetix_i);
        contracts[3] = address(exchangestate_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(tokenstatesynthetix_i);
        contracts[6] = address(rewardsdistribution_i);
        contracts[7] = address(exchangerates_i);
        contracts[8] = address(tokenstatesinr_i);
        contracts[9] = address(proxysinr_i);
        contracts[10] = address(issuer_i);
        contracts[11] = address(systemsettings_i);
        contracts[12] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
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
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
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
        // Ensure the sINR synth can write to its TokenState;
        tokenstatesinr_i.setAssociatedContract(new_SynthsINR_contract);
        // Ensure the sINR synth Proxy is correctly connected to the Synth;
        proxysinr_i.setTarget(Proxyable(new_SynthsINR_contract));
        // Ensure the ExchangeRates contract has the feed for sINR;
        exchangerates_i.addAggregator("sINR", 0x5535e67d8f99c8ebe961E1Fc1F6DDAE96FEC82C9);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_46();
        // Set the exchange rates for various synths;
        systemsettings_setExchangeFeeRateForSynths_47();
        futuresmarketsettings_i.setTakerFee("sAPE", 9500000000000000);
        futuresmarketsettings_i.setMakerFee("sAPE", 8500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sAPE", 7500000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sAPE", 7500000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sAPE", 2);
        futuresmarketsettings_i.setMaxLeverage("sAPE", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sAPE", 0);
        futuresmarketsettings_i.setMaxFundingRate("sAPE", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sAPE", 10000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sDYDX", 6500000000000000);
        futuresmarketsettings_i.setMakerFee("sDYDX", 5500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sDYDX", 4500000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sDYDX", 4500000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sDYDX", 2);
        futuresmarketsettings_i.setMaxLeverage("sDYDX", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sDYDX", 0);
        futuresmarketsettings_i.setMaxFundingRate("sDYDX", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sDYDX", 10000000000000000000000000);

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
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_0_0 = new address[](2);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[0] = address(new_FuturesMarketAPE_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[1] = address(new_FuturesMarketDYDX_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_0_0);
    }

    function addressresolver_importAddresses_1() internal {
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](11);
        addressresolver_importAddresses_names_1_0[0] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_1_0[1] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_1_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_1_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_1_0[4] = bytes32("Issuer");
        addressresolver_importAddresses_names_1_0[5] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_1_0[6] = bytes32("SynthsINR");
        addressresolver_importAddresses_names_1_0[7] = bytes32("ProxysINR");
        addressresolver_importAddresses_names_1_0[8] = bytes32("TokenStatesINR");
        addressresolver_importAddresses_names_1_0[9] = bytes32("FuturesMarketAPE");
        addressresolver_importAddresses_names_1_0[10] = bytes32("FuturesMarketDYDX");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](11);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_SynthsINR_contract);
        addressresolver_importAddresses_destinations_1_1[7] = address(new_ProxysINR_contract);
        addressresolver_importAddresses_destinations_1_1[8] = address(new_TokenStatesINR_contract);
        addressresolver_importAddresses_destinations_1_1[9] = address(new_FuturesMarketAPE_contract);
        addressresolver_importAddresses_destinations_1_1[10] = address(new_FuturesMarketDYDX_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x14E6f8e6Da00a32C069b11b64e48EA1FEF2361D4);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xD21969A86Ce5c41aAb2D492a0F802AA3e015cd9A);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x0681883084b5De1564FE2706C87affD77F1677D5);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(new_SynthsINR_contract);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(0xf86048DFf23cF130107dfB4e6386f574231a5C65);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0xcF853f7f8F78B2B801095b66F8ba9c5f04dB1640);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(0x4ff54624D5FB61C34c634c3314Ed3BfE4dBB665a);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0x001b7876F567f0b3A639332Ed1e363839c6d85e2);
        addressresolver_rebuildCaches_destinations_3_0[17] = MixinResolver(0x5Af0072617F7f2AEB0e314e2faD1DE0231Ba97cD);
        addressresolver_rebuildCaches_destinations_3_0[18] = MixinResolver(0xbCB2D435045E16B059b2130b28BE70b5cA47bFE5);
        addressresolver_rebuildCaches_destinations_3_0[19] = MixinResolver(0x4434f56ddBdE28fab08C4AE71970a06B300F8881);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function addressresolver_rebuildCaches_4() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_4_0 = new MixinResolver[](6);
        addressresolver_rebuildCaches_destinations_4_0[0] = MixinResolver(0xb147C69BEe211F57290a6cde9d1BAbfD0DCF3Ea3);
        addressresolver_rebuildCaches_destinations_4_0[1] = MixinResolver(0xad44873632840144fFC97b2D1de716f6E2cF0366);
        addressresolver_rebuildCaches_destinations_4_0[2] = MixinResolver(new_FuturesMarketAPE_contract);
        addressresolver_rebuildCaches_destinations_4_0[3] = MixinResolver(new_FuturesMarketDYDX_contract);
        addressresolver_rebuildCaches_destinations_4_0[4] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_4_0[5] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_4_0);
    }

    function issuer_addSynths_46() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_46_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_46_0[0] = ISynth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        issuer_addSynths_synthsToAdd_46_0[1] = ISynth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        issuer_addSynths_synthsToAdd_46_0[2] = ISynth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        issuer_addSynths_synthsToAdd_46_0[3] = ISynth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        issuer_addSynths_synthsToAdd_46_0[4] = ISynth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        issuer_addSynths_synthsToAdd_46_0[5] = ISynth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        issuer_addSynths_synthsToAdd_46_0[6] = ISynth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        issuer_addSynths_synthsToAdd_46_0[7] = ISynth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        issuer_addSynths_synthsToAdd_46_0[8] = ISynth(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        issuer_addSynths_synthsToAdd_46_0[9] = ISynth(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        issuer_addSynths_synthsToAdd_46_0[10] = ISynth(new_SynthsINR_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_46_0);
    }

    function systemsettings_setExchangeFeeRateForSynths_47() internal {
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_47_0 = new bytes32[](1);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_47_0[0] = bytes32("sINR");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_47_1 = new uint256[](1);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_47_1[0] = uint256(500000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(
            systemsettings_setExchangeFeeRateForSynths_synthKeys_47_0,
            systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_47_1
        );
    }
}

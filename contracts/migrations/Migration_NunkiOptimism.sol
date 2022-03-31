pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../ExchangeRates.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";
import "../FuturesMarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_NunkiOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x9FFB4aA93612c9681203118941F983Bb1bB59d20
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x9FFB4aA93612c9681203118941F983Bb1bB59d20);
    // https://kovan-explorer.optimism.io/address/0x412c870daAb642aA87715e2EA860d20E48E73267
    TokenState public constant tokenstateswti_i = TokenState(0x412c870daAb642aA87715e2EA860d20E48E73267);
    // https://kovan-explorer.optimism.io/address/0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA
    ProxyERC20 public constant proxyswti_i = ProxyERC20(0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA);
    // https://kovan-explorer.optimism.io/address/0x2a764Dd011E0142629183ef9Fec89dd5064Ec52A
    Issuer public constant issuer_i = Issuer(0x2a764Dd011E0142629183ef9Fec89dd5064Ec52A);
    // https://kovan-explorer.optimism.io/address/0x5565fcd9739182cA5e474409b2685b4C0A4829E3
    SystemSettings public constant systemsettings_i = SystemSettings(0x5565fcd9739182cA5e474409b2685b4C0A4829E3);
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA
    address public constant new_ProxysWTI_contract = 0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA;
    // https://kovan-explorer.optimism.io/address/0x412c870daAb642aA87715e2EA860d20E48E73267
    address public constant new_TokenStatesWTI_contract = 0x412c870daAb642aA87715e2EA860d20E48E73267;
    // https://kovan-explorer.optimism.io/address/0x8e08BF90B979698AdB6d722E9e27263f36366414
    address public constant new_SynthsWTI_contract = 0x8e08BF90B979698AdB6d722E9e27263f36366414;
    // https://kovan-explorer.optimism.io/address/0x1991bEA1eB08a78701F3330934B2301Fc6520AbA
    address public constant new_FuturesMarketSOL_contract = 0x1991bEA1eB08a78701F3330934B2301Fc6520AbA;
    // https://kovan-explorer.optimism.io/address/0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee
    address public constant new_FuturesMarketAVAX_contract = 0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee;
    // https://kovan-explorer.optimism.io/address/0x8e0df45f66E620F85dF1D0490Cd2b19E57a4232A
    address public constant new_FuturesMarketMATIC_contract = 0x8e0df45f66E620F85dF1D0490Cd2b19E57a4232A;
    // https://kovan-explorer.optimism.io/address/0x929d8EC9A885cdCfdF28EA31B4A356532757DE5E
    address public constant new_FuturesMarketWTI_contract = 0x929d8EC9A885cdCfdF28EA31B4A356532757DE5E;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(exchangerates_i);
        contracts[3] = address(tokenstateswti_i);
        contracts[4] = address(proxyswti_i);
        contracts[5] = address(issuer_i);
        contracts[6] = address(systemsettings_i);
        contracts[7] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
        // require(
        //     ISynthetixNamedContract(new_TokenStatesWTI_contract).CONTRACT_NAME() == "TokenState",
        //     "Invalid contract supplied for TokenStatesWTI"
        // );
        require(
            ISynthetixNamedContract(new_SynthsWTI_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsWTI"
        );
        // require(ISynthetixNamedContract(new_FuturesMarketSOL_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketSOL");
        // require(ISynthetixNamedContract(new_FuturesMarketAVAX_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketAVAX");
        // require(ISynthetixNamedContract(new_FuturesMarketMATIC_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketMATIC");
        // require(ISynthetixNamedContract(new_FuturesMarketWTI_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketWTI");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        futuresmarketmanager_addMarkets_0();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_2();
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the ExchangeRates contract has the standalone feed for UNI;
        exchangerates_i.addAggregator("UNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the standalone feed for SOL;
        exchangerates_i.addAggregator("SOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Ensure the ExchangeRates contract has the standalone feed for AVAX;
        exchangerates_i.addAggregator("AVAX", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the standalone feed for MATIC;
        exchangerates_i.addAggregator("MATIC", 0x62FD93Fc58D94eE253542ECD5C23467F65dCdB73);
        // Ensure the ExchangeRates contract has the standalone feed for WTI;
        exchangerates_i.addAggregator("WTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);
        // Ensure the sWTI synth can write to its TokenState;
        tokenstateswti_i.setAssociatedContract(new_SynthsWTI_contract);
        // Ensure the sWTI synth Proxy is correctly connected to the Synth;
        proxyswti_i.setTarget(Proxyable(new_SynthsWTI_contract));
        // Ensure the ExchangeRates contract has the feed for sWTI;
        exchangerates_i.addAggregator("sWTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_19();
        // Set the exchange rates for various synths;
        systemsettings_setExchangeFeeRateForSynths_20();
        futuresmarketsettings_i.setTakerFee("sLINK", 4000000000000000);
        futuresmarketsettings_i.setMakerFee("sLINK", 3500000000000000);
        futuresmarketsettings_i.setTakerFee("sSOL", 5000000000000000);
        futuresmarketsettings_i.setMakerFee("sSOL", 4000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sSOL", 1000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sSOL", 2);
        futuresmarketsettings_i.setMaxLeverage("sSOL", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sSOL", 2000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sSOL", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sSOL", 300000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sAVAX", 5000000000000000);
        futuresmarketsettings_i.setMakerFee("sAVAX", 4000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sAVAX", 1000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sAVAX", 2);
        futuresmarketsettings_i.setMaxLeverage("sAVAX", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sAVAX", 2000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sAVAX", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sAVAX", 300000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sMATIC", 5000000000000000);
        futuresmarketsettings_i.setMakerFee("sMATIC", 4000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sMATIC", 1000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sMATIC", 2);
        futuresmarketsettings_i.setMaxLeverage("sMATIC", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sMATIC", 2000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sMATIC", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sMATIC", 300000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sWTI", 2500000000000000);
        futuresmarketsettings_i.setMakerFee("sWTI", 2000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sWTI", 1000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sWTI", 2);
        futuresmarketsettings_i.setMaxLeverage("sWTI", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sWTI", 2000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sWTI", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sWTI", 300000000000000000000000000);

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
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_0_0 = new address[](4);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[0] = address(new_FuturesMarketSOL_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[1] = address(new_FuturesMarketAVAX_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[2] = address(new_FuturesMarketMATIC_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[3] = address(new_FuturesMarketWTI_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_0_0);
    }

    function addressresolver_importAddresses_1() internal {
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](7);
        addressresolver_importAddresses_names_1_0[0] = bytes32("ProxysWTI");
        addressresolver_importAddresses_names_1_0[1] = bytes32("TokenStatesWTI");
        addressresolver_importAddresses_names_1_0[2] = bytes32("SynthsWTI");
        addressresolver_importAddresses_names_1_0[3] = bytes32("FuturesMarketSOL");
        addressresolver_importAddresses_names_1_0[4] = bytes32("FuturesMarketAVAX");
        addressresolver_importAddresses_names_1_0[5] = bytes32("FuturesMarketMATIC");
        addressresolver_importAddresses_names_1_0[6] = bytes32("FuturesMarketWTI");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](7);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_ProxysWTI_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_TokenStatesWTI_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_SynthsWTI_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_FuturesMarketSOL_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_FuturesMarketAVAX_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_FuturesMarketMATIC_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_FuturesMarketWTI_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](5);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_SynthsWTI_contract);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_FuturesMarketSOL_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_FuturesMarketAVAX_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_FuturesMarketMATIC_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_FuturesMarketWTI_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_19() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_19_0 = new ISynth[](1);
        issuer_addSynths_synthsToAdd_19_0[0] = ISynth(new_SynthsWTI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_19_0);
    }

    function systemsettings_setExchangeFeeRateForSynths_20() internal {
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_20_0 = new bytes32[](1);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_20_0[0] = bytes32("sWTI");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_20_1 = new uint256[](1);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_20_1[0] = uint256(3000000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(
            systemsettings_setExchangeFeeRateForSynths_synthKeys_20_0,
            systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_20_1
        );
    }
}

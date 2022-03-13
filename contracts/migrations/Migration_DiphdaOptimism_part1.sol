pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../DebtCache.sol";
import "../ExchangeRates.sol";
import "../TokenState.sol";
import "../MultiCollateralSynth.sol";
import "../Issuer.sol";
import "../ProxyERC20.sol";
import "../FuturesMarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_DiphdaOptimism_part1 is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0x579E2F05309e77d50D3017f2b31A7B8390f6351f
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0x579E2F05309e77d50D3017f2b31A7B8390f6351f);
    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8
    SystemStatus public constant systemstatus_i = SystemStatus(0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8);
    // https://kovan-explorer.optimism.io/address/0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599
    Proxy public constant proxyfeepool_i = Proxy(0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599);
    // https://kovan-explorer.optimism.io/address/0x0A1d3bde7751e92971891FB034AcDE4C271de408
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x0A1d3bde7751e92971891FB034AcDE4C271de408);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C
    FeePool public constant feepool_i = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
    // https://kovan-explorer.optimism.io/address/0xe8A28CbD4A1ED50C3Fb955cb5DE0cEf0538540dd
    DebtCache public constant debtcache_i = DebtCache(0xe8A28CbD4A1ED50C3Fb955cb5DE0cEf0538540dd);
    // https://kovan-explorer.optimism.io/address/0x0820dfBcbA966f2CE26a86A04b352E2f3655FB62
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x0820dfBcbA966f2CE26a86A04b352E2f3655FB62);
    // https://kovan-explorer.optimism.io/address/0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
    // https://kovan-explorer.optimism.io/address/0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f
    TokenState public constant tokenstatesusd_i = TokenState(0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f);
    // https://kovan-explorer.optimism.io/address/0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57);
    // https://kovan-explorer.optimism.io/address/0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57
    ProxyERC20 public constant proxyerc20susd_i = ProxyERC20(0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57);
    // https://kovan-explorer.optimism.io/address/0xE73EB48B9E725E563775fF38cb67Ae09bF34c791
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
    // https://kovan-explorer.optimism.io/address/0x319D190584248280e3084A4692C6472A8dA5CA26
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0x319D190584248280e3084A4692C6472A8dA5CA26);
    // https://kovan-explorer.optimism.io/address/0x46bC784B852D738BFa5ce34765dd34702D9dEEFb
    Issuer public constant issuer_i = Issuer(0x46bC784B852D738BFa5ce34765dd34702D9dEEFb);
    // https://kovan-explorer.optimism.io/address/0xd8011A4fA51d059CCb2cE1173778c53958AD36A7
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xd8011A4fA51d059CCb2cE1173778c53958AD36A7);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8
    address public constant new_SystemStatus_contract = 0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8;
    // https://kovan-explorer.optimism.io/address/0xEb8bCa9AE662313a8A1f74c5BB4A7D1d67473543
    address public constant new_ext_AggregatorIssuedSynths_contract = 0xEb8bCa9AE662313a8A1f74c5BB4A7D1d67473543;
    // https://kovan-explorer.optimism.io/address/0x0820dfBcbA966f2CE26a86A04b352E2f3655FB62
    address public constant new_ExchangeRates_contract = 0x0820dfBcbA966f2CE26a86A04b352E2f3655FB62;
    // https://kovan-explorer.optimism.io/address/0x8e2Ed2F16238952f84DB07439073406213214799
    address public constant new_ext_AggregatorDebtRatio_contract = 0x8e2Ed2F16238952f84DB07439073406213214799;
    // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C
    address public constant new_FeePool_contract = 0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C;
    // https://kovan-explorer.optimism.io/address/0x46bC784B852D738BFa5ce34765dd34702D9dEEFb
    address public constant new_Issuer_contract = 0x46bC784B852D738BFa5ce34765dd34702D9dEEFb;
    // https://kovan-explorer.optimism.io/address/0x71736002ca4fD4FE5E139815915520AE9Ea3428c
    address public constant new_ExchangeCircuitBreaker_contract = 0x71736002ca4fD4FE5E139815915520AE9Ea3428c;
    // https://kovan-explorer.optimism.io/address/0xe8A28CbD4A1ED50C3Fb955cb5DE0cEf0538540dd
    address public constant new_DebtCache_contract = 0xe8A28CbD4A1ED50C3Fb955cb5DE0cEf0538540dd;
    // https://kovan-explorer.optimism.io/address/0xe2D65eD9dcE9581113B5dc3faA451d2D3b51ed85
    address public constant new_Exchanger_contract = 0xe2D65eD9dcE9581113B5dc3faA451d2D3b51ed85;
    // https://kovan-explorer.optimism.io/address/0xf5F37379CfDff7CCc0DBB2CeBB496BC70a0A71D7
    address public constant new_SynthetixBridgeToBase_contract = 0xf5F37379CfDff7CCc0DBB2CeBB496BC70a0A71D7;
    // https://kovan-explorer.optimism.io/address/0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9
    address public constant new_SynthsUSD_contract = 0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9;
    // https://kovan-explorer.optimism.io/address/0x579E2F05309e77d50D3017f2b31A7B8390f6351f
    address public constant new_FuturesMarketManager_contract = 0x579E2F05309e77d50D3017f2b31A7B8390f6351f;
    // https://kovan-explorer.optimism.io/address/0xd8011A4fA51d059CCb2cE1173778c53958AD36A7
    address public constant new_FuturesMarketSettings_contract = 0xd8011A4fA51d059CCb2cE1173778c53958AD36A7;
    // https://kovan-explorer.optimism.io/address/0x9F86e37Ae14009a94Ece5cfcb5cc0e8129cC1C04
    address public constant new_FuturesMarketLINK_contract = 0x9F86e37Ae14009a94Ece5cfcb5cc0e8129cC1C04;
    // https://kovan-explorer.optimism.io/address/0xab8f7f772E86c0f79b39b19feD29E573186BA9Bb
    address public constant new_FuturesMarketBTC_contract = 0xab8f7f772E86c0f79b39b19feD29E573186BA9Bb;
    // https://kovan-explorer.optimism.io/address/0x240922DDB83C2533C61110bf4EEC4B910649259a
    address public constant new_FuturesMarketData_contract = 0x240922DDB83C2533C61110bf4EEC4B910649259a;
    // https://kovan-explorer.optimism.io/address/0x229B66319AFf2Cd9eE6A2E1dc834201906e77B0D
    address public constant new_FuturesMarketETH_contract = 0x229B66319AFf2Cd9eE6A2E1dc834201906e77B0D;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](16);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(proxyfeepool_i);
        contracts[4] = address(feepooleternalstorage_i);
        contracts[5] = address(exchangestate_i);
        contracts[6] = address(feepool_i);
        contracts[7] = address(debtcache_i);
        contracts[8] = address(exchangerates_i);
        contracts[9] = address(synthsusd_i);
        contracts[10] = address(tokenstatesusd_i);
        contracts[11] = address(proxysusd_i);
        contracts[12] = address(synthslink_i);
        contracts[13] = address(synthsuni_i);
        contracts[14] = address(issuer_i);
        contracts[15] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
        // require(ISynthetixNamedContract(new_SystemStatus_contract).CONTRACT_NAME() == "SystemStatus", "Invalid contract supplied for SystemStatus");
        // require(ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates", "Invalid contract supplied for ExchangeRates");
        // require(ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool", "Invalid contract supplied for FeePool");
        // require(ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer", "Invalid contract supplied for Issuer");
        // require(ISynthetixNamedContract(new_ExchangeCircuitBreaker_contract).CONTRACT_NAME() == "ExchangeCircuitBreaker", "Invalid contract supplied for ExchangeCircuitBreaker");
        // require(ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache", "Invalid contract supplied for DebtCache");
        // require(ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger", "Invalid contract supplied for Exchanger");
        // require(ISynthetixNamedContract(new_SynthetixBridgeToBase_contract).CONTRACT_NAME() == "SynthetixBridgeToBase", "Invalid contract supplied for SynthetixBridgeToBase");
        // require(ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth", "Invalid contract supplied for SynthsUSD");
        // require(ISynthetixNamedContract(new_FuturesMarketManager_contract).CONTRACT_NAME() == "FuturesMarketManager", "Invalid contract supplied for FuturesMarketManager");
        // require(ISynthetixNamedContract(new_FuturesMarketSettings_contract).CONTRACT_NAME() == "FuturesMarketSettings", "Invalid contract supplied for FuturesMarketSettings");
        // require(ISynthetixNamedContract(new_FuturesMarketLINK_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketLINK");
        // require(ISynthetixNamedContract(new_FuturesMarketBTC_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketBTC");
        // require(ISynthetixNamedContract(new_FuturesMarketData_contract).CONTRACT_NAME() == "FuturesMarketData", "Invalid contract supplied for FuturesMarketData");
        // require(ISynthetixNamedContract(new_FuturesMarketETH_contract).CONTRACT_NAME() == "FuturesMarket", "Invalid contract supplied for FuturesMarketETH");

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
        // Ensure the owner can suspend and resume the protocol;
        systemstatus_updateAccessControls_17();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the ExchangeCircuitBreaker contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_ExchangeCircuitBreaker_contract, true, false);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Import excluded-debt records from existing DebtCache;
        debtcache_i.importExcludedIssuedDebts(
            IDebtCache(0xFC6D35EB364951953FD86bb8A1a5b0ba8Cbb6Eb2),
            IIssuer(0x1Fdd3949B995950C2D247F688aAD6a78471d7C77)
        );
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x38D2f492B4Ef886E71D111c592c9338374e1bd8d);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the special ERC20 proxy for sUSD has its target set to the Synth;
        proxyerc20susd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUNI();
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_40();
        // Set the minimum margin to open a futures position (SIP-80);
        futuresmarketsettings_i.setMinInitialMargin(100000000000000000000);
        // Set the reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setLiquidationFeeRatio(3500000000000000);
        // Set the reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setLiquidationBufferRatio(2500000000000000);
        // Set the minimum reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setMinKeeperFee(20000000000000000000);
        futuresmarketsettings_i.setTakerFee("sBTC", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sBTC", 1000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sBTC", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sBTC", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sBTC", 2);
        futuresmarketsettings_i.setMaxLeverage("sBTC", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sBTC", 1000000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sBTC", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sBTC", 50000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sETH", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sETH", 1000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sETH", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sETH", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sETH", 2);
        futuresmarketsettings_i.setMaxLeverage("sETH", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sETH", 1000000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sETH", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sETH", 50000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sLINK", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sLINK", 1000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sLINK", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sLINK", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sLINK", 2);
        futuresmarketsettings_i.setMaxLeverage("sLINK", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sLINK", 1000000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sLINK", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sLINK", 50000000000000000000000000);

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
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_0_0 = new address[](3);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[0] = address(new_FuturesMarketBTC_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[1] = address(new_FuturesMarketETH_contract);
        futuresmarketmanager_addMarkets_marketsToAdd_0_0[2] = address(new_FuturesMarketLINK_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_0_0);
    }

    function addressresolver_importAddresses_1() internal {
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](17);
        addressresolver_importAddresses_names_1_0[0] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_1_0[1] = bytes32("ext:AggregatorIssuedSynths");
        addressresolver_importAddresses_names_1_0[2] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_1_0[3] = bytes32("ext:AggregatorDebtRatio");
        addressresolver_importAddresses_names_1_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_1_0[5] = bytes32("Issuer");
        addressresolver_importAddresses_names_1_0[6] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_1_0[7] = bytes32("DebtCache");
        addressresolver_importAddresses_names_1_0[8] = bytes32("Exchanger");
        addressresolver_importAddresses_names_1_0[9] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_1_0[10] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_1_0[11] = bytes32("FuturesMarketManager");
        addressresolver_importAddresses_names_1_0[12] = bytes32("FuturesMarketSettings");
        addressresolver_importAddresses_names_1_0[13] = bytes32("FuturesMarketLINK");
        addressresolver_importAddresses_names_1_0[14] = bytes32("FuturesMarketBTC");
        addressresolver_importAddresses_names_1_0[15] = bytes32("FuturesMarketData");
        addressresolver_importAddresses_names_1_0[16] = bytes32("FuturesMarketETH");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](17);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_ext_AggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_ext_AggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_1_1[7] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_1_1[8] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_1_1[9] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_1_1[10] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_1_1[11] = address(new_FuturesMarketManager_contract);
        addressresolver_importAddresses_destinations_1_1[12] = address(new_FuturesMarketSettings_contract);
        addressresolver_importAddresses_destinations_1_1[13] = address(new_FuturesMarketLINK_contract);
        addressresolver_importAddresses_destinations_1_1[14] = address(new_FuturesMarketBTC_contract);
        addressresolver_importAddresses_destinations_1_1[15] = address(new_FuturesMarketData_contract);
        addressresolver_importAddresses_destinations_1_1[16] = address(new_FuturesMarketETH_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xc7d4AF2B7c32ea13ea64911c672C89254251c652);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_ExchangeCircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x319D190584248280e3084A4692C6472A8dA5CA26);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(new_FuturesMarketBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(new_FuturesMarketETH_contract);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(new_FuturesMarketLINK_contract);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x5c9AD159E8fC9DC2dD081872dA56961e0B43d6AD);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xb7469A575b7931532F09AEe2882835A0249064a0);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(new_FuturesMarketManager_contract);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(new_FuturesMarketSettings_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function systemstatus_updateAccessControls_17() internal {
        bytes32[] memory systemstatus_updateAccessControls_sections_17_0 = new bytes32[](6);
        systemstatus_updateAccessControls_sections_17_0[0] = bytes32("System");
        systemstatus_updateAccessControls_sections_17_0[1] = bytes32("Issuance");
        systemstatus_updateAccessControls_sections_17_0[2] = bytes32("Exchange");
        systemstatus_updateAccessControls_sections_17_0[3] = bytes32("SynthExchange");
        systemstatus_updateAccessControls_sections_17_0[4] = bytes32("Synth");
        systemstatus_updateAccessControls_sections_17_0[5] = bytes32("Futures");
        address[] memory systemstatus_updateAccessControls_accounts_17_1 = new address[](6);
        systemstatus_updateAccessControls_accounts_17_1[0] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_17_1[1] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_17_1[2] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_17_1[3] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_17_1[4] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_17_1[5] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        bool[] memory systemstatus_updateAccessControls_canSuspends_17_2 = new bool[](6);
        systemstatus_updateAccessControls_canSuspends_17_2[0] = bool(true);
        systemstatus_updateAccessControls_canSuspends_17_2[1] = bool(true);
        systemstatus_updateAccessControls_canSuspends_17_2[2] = bool(true);
        systemstatus_updateAccessControls_canSuspends_17_2[3] = bool(true);
        systemstatus_updateAccessControls_canSuspends_17_2[4] = bool(true);
        systemstatus_updateAccessControls_canSuspends_17_2[5] = bool(true);
        bool[] memory systemstatus_updateAccessControls_canResumes_17_3 = new bool[](6);
        systemstatus_updateAccessControls_canResumes_17_3[0] = bool(true);
        systemstatus_updateAccessControls_canResumes_17_3[1] = bool(true);
        systemstatus_updateAccessControls_canResumes_17_3[2] = bool(true);
        systemstatus_updateAccessControls_canResumes_17_3[3] = bool(true);
        systemstatus_updateAccessControls_canResumes_17_3[4] = bool(true);
        systemstatus_updateAccessControls_canResumes_17_3[5] = bool(true);
        systemstatus_i.updateAccessControls(
            systemstatus_updateAccessControls_sections_17_0,
            systemstatus_updateAccessControls_accounts_17_1,
            systemstatus_updateAccessControls_canSuspends_17_2,
            systemstatus_updateAccessControls_canResumes_17_3
        );
    }

    function importFeePeriod_0() internal {
        // https://kovan-explorer.optimism.io/address/0xAe35A8BC0e190D4544579a331229e809B2f7ca7b;
        FeePool existingFeePool = FeePool(0xAe35A8BC0e190D4544579a331229e809B2f7ca7b);
        // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C;
        FeePool newFeePool = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
        (
            uint64 feePeriodId_0,
            uint64 unused_0,
            uint64 startTime_0,
            uint feesToDistribute_0,
            uint feesClaimed_0,
            uint rewardsToDistribute_0,
            uint rewardsClaimed_0
        ) = existingFeePool.recentFeePeriods(0);
        newFeePool.importFeePeriod(
            0,
            feePeriodId_0,
            startTime_0,
            feesToDistribute_0,
            feesClaimed_0,
            rewardsToDistribute_0,
            rewardsClaimed_0
        );
    }

    function importFeePeriod_1() internal {
        // https://kovan-explorer.optimism.io/address/0xAe35A8BC0e190D4544579a331229e809B2f7ca7b;
        FeePool existingFeePool = FeePool(0xAe35A8BC0e190D4544579a331229e809B2f7ca7b);
        // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C;
        FeePool newFeePool = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
        (
            uint64 feePeriodId_1,
            uint64 unused_1,
            uint64 startTime_1,
            uint feesToDistribute_1,
            uint feesClaimed_1,
            uint rewardsToDistribute_1,
            uint rewardsClaimed_1
        ) = existingFeePool.recentFeePeriods(1);
        newFeePool.importFeePeriod(
            1,
            feePeriodId_1,
            startTime_1,
            feesToDistribute_1,
            feesClaimed_1,
            rewardsToDistribute_1,
            rewardsClaimed_1
        );
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://kovan-explorer.optimism.io/address/0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10;
        Synth existingSynth = Synth(0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10);
        // https://kovan-explorer.optimism.io/address/0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9;
        Synth newSynth = Synth(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan-explorer.optimism.io/address/0xe5671C038739F8D71b11A5F78888e520356BFCD5;
        Synth existingSynth = Synth(0xe5671C038739F8D71b11A5F78888e520356BFCD5);
        // https://kovan-explorer.optimism.io/address/0xE73EB48B9E725E563775fF38cb67Ae09bF34c791;
        Synth newSynth = Synth(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://kovan-explorer.optimism.io/address/0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b;
        Synth existingSynth = Synth(0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b);
        // https://kovan-explorer.optimism.io/address/0x319D190584248280e3084A4692C6472A8dA5CA26;
        Synth newSynth = Synth(0x319D190584248280e3084A4692C6472A8dA5CA26);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_40() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_40_0 = new ISynth[](7);
        issuer_addSynths_synthsToAdd_40_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_40_0[1] = ISynth(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        issuer_addSynths_synthsToAdd_40_0[2] = ISynth(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        issuer_addSynths_synthsToAdd_40_0[3] = ISynth(0xE73EB48B9E725E563775fF38cb67Ae09bF34c791);
        issuer_addSynths_synthsToAdd_40_0[4] = ISynth(0x319D190584248280e3084A4692C6472A8dA5CA26);
        issuer_addSynths_synthsToAdd_40_0[5] = ISynth(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        issuer_addSynths_synthsToAdd_40_0[6] = ISynth(0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_40_0);
    }
}

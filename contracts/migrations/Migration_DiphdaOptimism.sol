pragma solidity ^0.5.16;

import "./MigrationLib_DiphdaOptimism.sol";

// solhint-disable contract-name-camelcase
contract Migration_DiphdaOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address private constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599
    Proxy public constant proxyfeepool_i = Proxy(0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599);
    // https://kovan-explorer.optimism.io/address/0x0A1d3bde7751e92971891FB034AcDE4C271de408
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x0A1d3bde7751e92971891FB034AcDE4C271de408);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456
    FeePool public constant feepool_i = FeePool(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
    // https://kovan-explorer.optimism.io/address/0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121
    DebtCache public constant debtcache_i = DebtCache(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
    // https://kovan-explorer.optimism.io/address/0x9FFB4aA93612c9681203118941F983Bb1bB59d20
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x9FFB4aA93612c9681203118941F983Bb1bB59d20);
    // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
    // https://kovan-explorer.optimism.io/address/0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f
    TokenState public constant tokenstatesusd_i = TokenState(0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f);
    // https://kovan-explorer.optimism.io/address/0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57);
    // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
    // https://kovan-explorer.optimism.io/address/0x8E6734A7653175b3FDa62516A646709F547C8342
    TokenState public constant tokenstateseth_i = TokenState(0x8E6734A7653175b3FDa62516A646709F547C8342);
    // https://kovan-explorer.optimism.io/address/0x94B41091eB29b36003aC1C6f0E55a5225633c884
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x94B41091eB29b36003aC1C6f0E55a5225633c884);
    // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
    // https://kovan-explorer.optimism.io/address/0x0F73cf03DFD5595e862aa27E98914E70554eCf6d
    TokenState public constant tokenstatesbtc_i = TokenState(0x0F73cf03DFD5595e862aa27E98914E70554eCf6d);
    // https://kovan-explorer.optimism.io/address/0x23F608ACc41bd7BCC617a01a9202214EE305439a
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x23F608ACc41bd7BCC617a01a9202214EE305439a);
    // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
    // https://kovan-explorer.optimism.io/address/0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE
    TokenState public constant tokenstateslink_i = TokenState(0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE);
    // https://kovan-explorer.optimism.io/address/0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E);
    // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
    // https://kovan-explorer.optimism.io/address/0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26
    TokenState public constant tokenstatesuni_i = TokenState(0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26);
    // https://kovan-explorer.optimism.io/address/0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57);
    // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
    // https://kovan-explorer.optimism.io/address/0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33
    TokenState public constant tokenstatesaave_i = TokenState(0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33);
    // https://kovan-explorer.optimism.io/address/0x503e91fc2b9Ad7453700130d0825E661565E4c3b
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x503e91fc2b9Ad7453700130d0825E661565E4c3b);
    // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
    // https://kovan-explorer.optimism.io/address/0x49460030a1801D38797D35F7ac4205a6212861aD
    TokenState public constant tokenstatessol_i = TokenState(0x49460030a1801D38797D35F7ac4205a6212861aD);
    // https://kovan-explorer.optimism.io/address/0x64Df80373eCD553CD48534A0542307178fF344DD
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x64Df80373eCD553CD48534A0542307178fF344DD);
    // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49
    MultiCollateralSynth public constant synthsavax_i = MultiCollateralSynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
    // https://kovan-explorer.optimism.io/address/0x8338011e46Db45f5cA0f06C4174a85280772dC85
    TokenState public constant tokenstatesavax_i = TokenState(0x8338011e46Db45f5cA0f06C4174a85280772dC85);
    // https://kovan-explorer.optimism.io/address/0x61760432A363399de4dDDFfD5925A4046c112594
    ProxyERC20 public constant proxysavax_i = ProxyERC20(0x61760432A363399de4dDDFfD5925A4046c112594);
    // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65
    MultiCollateralSynth public constant synthsmatic_i = MultiCollateralSynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
    // https://kovan-explorer.optimism.io/address/0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6
    TokenState public constant tokenstatesmatic_i = TokenState(0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6);
    // https://kovan-explorer.optimism.io/address/0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6
    ProxyERC20 public constant proxysmatic_i = ProxyERC20(0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6);
    // https://kovan-explorer.optimism.io/address/0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a
    Issuer public constant issuer_i = Issuer(0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a);
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0xD2Ed2062047f915A5a442f04DE1C9f0AAE30f8b9
    address private constant new_OneNetAggregatorIssuedSynths_contract = 0xD2Ed2062047f915A5a442f04DE1C9f0AAE30f8b9;
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    address private constant new_SystemStatus_contract = 0xE90F90DCe5010F615bEC29c5db2D9df798D48183;
    // https://kovan-explorer.optimism.io/address/0x9FFB4aA93612c9681203118941F983Bb1bB59d20
    address private constant new_ExchangeRates_contract = 0x9FFB4aA93612c9681203118941F983Bb1bB59d20;
    // https://kovan-explorer.optimism.io/address/0xE52A3aFe564427d206Ab776aC79F97b5C8E67d3C
    address private constant new_OneNetAggregatorDebtRatio_contract = 0xE52A3aFe564427d206Ab776aC79F97b5C8E67d3C;
    // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456
    address private constant new_FeePool_contract = 0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456;
    // https://kovan-explorer.optimism.io/address/0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121
    address private constant new_DebtCache_contract = 0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121;
    // https://kovan-explorer.optimism.io/address/0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8
    address private constant new_ExchangeCircuitBreaker_contract = 0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8;
    // https://kovan-explorer.optimism.io/address/0x0D521f5320D754f0B844f88c0cA7c377a448edaf
    address private constant new_Exchanger_contract = 0x0D521f5320D754f0B844f88c0cA7c377a448edaf;
    // https://kovan-explorer.optimism.io/address/0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a
    address private constant new_Issuer_contract = 0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a;
    // https://kovan-explorer.optimism.io/address/0xED4f0C6DfE3235e9A93B808a60994C8697cC2236
    address private constant new_SynthetixBridgeToBase_contract = 0xED4f0C6DfE3235e9A93B808a60994C8697cC2236;
    // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA
    address private constant new_SynthsUSD_contract = 0x360bc0503362130aBE0b3393aC078B03d73a9EcA;
    // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2
    address private constant new_SynthsETH_contract = 0x9745E33Fa3151065568385f915C48d9E538B42a2;
    // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34
    address private constant new_SynthsBTC_contract = 0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34;
    // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723
    address private constant new_SynthsLINK_contract = 0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723;
    // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa
    address private constant new_SynthsAAVE_contract = 0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa;
    // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f
    address private constant new_SynthsSOL_contract = 0xBA097Fa1ABF647995154c8e9D77CEd04123b593f;
    // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877
    address private constant new_SynthsUNI_contract = 0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877;
    // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65
    address private constant new_SynthsMATIC_contract = 0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65;
    // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49
    address private constant new_SynthsAVAX_contract = 0xdA730bF21BA6360af34cF065B042978017f2bf49;
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    address private constant new_FuturesMarketSettings_contract = 0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB;
    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    address private constant new_FuturesMarketManager_contract = 0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9;
    // https://kovan-explorer.optimism.io/address/0x92CA72696B15b0F0C239E838148495016950af51
    address private constant new_FuturesMarketData_contract = 0x92CA72696B15b0F0C239E838148495016950af51;
    // https://kovan-explorer.optimism.io/address/0x698E403AaC625345C6E5fC2D0042274350bEDf78
    address private constant new_FuturesMarketETH_contract = 0x698E403AaC625345C6E5fC2D0042274350bEDf78;
    // https://kovan-explorer.optimism.io/address/0x1e28378F64bC04E872a9D01Eb261926717346F98
    address private constant new_FuturesMarketLINK_contract = 0x1e28378F64bC04E872a9D01Eb261926717346F98;
    // https://kovan-explorer.optimism.io/address/0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C
    address private constant new_FuturesMarketBTC_contract = 0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](38);
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
        contracts[12] = address(synthseth_i);
        contracts[13] = address(tokenstateseth_i);
        contracts[14] = address(proxyseth_i);
        contracts[15] = address(synthsbtc_i);
        contracts[16] = address(tokenstatesbtc_i);
        contracts[17] = address(proxysbtc_i);
        contracts[18] = address(synthslink_i);
        contracts[19] = address(tokenstateslink_i);
        contracts[20] = address(proxyslink_i);
        contracts[21] = address(synthsuni_i);
        contracts[22] = address(tokenstatesuni_i);
        contracts[23] = address(proxysuni_i);
        contracts[24] = address(synthsaave_i);
        contracts[25] = address(tokenstatesaave_i);
        contracts[26] = address(proxysaave_i);
        contracts[27] = address(synthssol_i);
        contracts[28] = address(tokenstatessol_i);
        contracts[29] = address(proxyssol_i);
        contracts[30] = address(synthsavax_i);
        contracts[31] = address(tokenstatesavax_i);
        contracts[32] = address(proxysavax_i);
        contracts[33] = address(synthsmatic_i);
        contracts[34] = address(tokenstatesmatic_i);
        contracts[35] = address(proxysmatic_i);
        contracts[36] = address(issuer_i);
        contracts[37] = address(futuresmarketsettings_i);
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
        // Ensure the owner can suspend and resume the protocol;
        systemstatus_updateAccessControls_25();
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

        MigrationLib_DiphdaOptimism.migration_split();

        // Set the minimum margin to open a futures position (SIP-80);
        futuresmarketsettings_i.setMinInitialMargin(100000000000000000000);
        // Set the reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setLiquidationFeeRatio(3500000000000000);
        // Set the reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setLiquidationBufferRatio(2500000000000000);
        // Set the minimum reward for liquidating a futures position (SIP-80);
        futuresmarketsettings_i.setMinKeeperFee(20000000000000000000);
        futuresmarketsettings_i.setTakerFee("sBTC", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sBTC", 2000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sBTC", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sBTC", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sBTC", 2);
        futuresmarketsettings_i.setMaxLeverage("sBTC", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sBTC", 20000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sBTC", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sBTC", 300000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sETH", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sETH", 2000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sETH", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sETH", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sETH", 2);
        futuresmarketsettings_i.setMaxLeverage("sETH", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sETH", 20000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sETH", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sETH", 300000000000000000000000000);
        futuresmarketsettings_i.setTakerFee("sLINK", 3000000000000000);
        futuresmarketsettings_i.setMakerFee("sLINK", 2000000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sLINK", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sLINK", 0);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sLINK", 2);
        futuresmarketsettings_i.setMaxLeverage("sLINK", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sLINK", 2000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sLINK", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sLINK", 300000000000000000000000000);

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
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](25);
        addressresolver_importAddresses_names_1_0[0] = bytes32("OneNetAggregatorIssuedSynths");
        addressresolver_importAddresses_names_1_0[1] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_1_0[2] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_1_0[3] = bytes32("OneNetAggregatorDebtRatio");
        addressresolver_importAddresses_names_1_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_1_0[5] = bytes32("DebtCache");
        addressresolver_importAddresses_names_1_0[6] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_1_0[7] = bytes32("Exchanger");
        addressresolver_importAddresses_names_1_0[8] = bytes32("Issuer");
        addressresolver_importAddresses_names_1_0[9] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_1_0[10] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_1_0[11] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_1_0[12] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_1_0[13] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_1_0[14] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_1_0[15] = bytes32("SynthsSOL");
        addressresolver_importAddresses_names_1_0[16] = bytes32("SynthsUNI");
        addressresolver_importAddresses_names_1_0[17] = bytes32("SynthsMATIC");
        addressresolver_importAddresses_names_1_0[18] = bytes32("SynthsAVAX");
        addressresolver_importAddresses_names_1_0[19] = bytes32("FuturesMarketSettings");
        addressresolver_importAddresses_names_1_0[20] = bytes32("FuturesMarketManager");
        addressresolver_importAddresses_names_1_0[21] = bytes32("FuturesMarketData");
        addressresolver_importAddresses_names_1_0[22] = bytes32("FuturesMarketETH");
        addressresolver_importAddresses_names_1_0[23] = bytes32("FuturesMarketLINK");
        addressresolver_importAddresses_names_1_0[24] = bytes32("FuturesMarketBTC");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](25);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_1_1[7] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_1_1[8] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_1_1[9] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_1_1[10] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_1_1[11] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_1_1[12] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_1_1[13] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_1_1[14] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_1_1[15] = address(new_SynthsSOL_contract);
        addressresolver_importAddresses_destinations_1_1[16] = address(new_SynthsUNI_contract);
        addressresolver_importAddresses_destinations_1_1[17] = address(new_SynthsMATIC_contract);
        addressresolver_importAddresses_destinations_1_1[18] = address(new_SynthsAVAX_contract);
        addressresolver_importAddresses_destinations_1_1[19] = address(new_FuturesMarketSettings_contract);
        addressresolver_importAddresses_destinations_1_1[20] = address(new_FuturesMarketManager_contract);
        addressresolver_importAddresses_destinations_1_1[21] = address(new_FuturesMarketData_contract);
        addressresolver_importAddresses_destinations_1_1[22] = address(new_FuturesMarketETH_contract);
        addressresolver_importAddresses_destinations_1_1[23] = address(new_FuturesMarketLINK_contract);
        addressresolver_importAddresses_destinations_1_1[24] = address(new_FuturesMarketBTC_contract);
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
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(new_SynthsUNI_contract);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(new_SynthsSOL_contract);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(new_SynthsAVAX_contract);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(new_SynthsMATIC_contract);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(new_FuturesMarketBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(new_FuturesMarketETH_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](13);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(new_FuturesMarketLINK_contract);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0x5c9AD159E8fC9DC2dD081872dA56961e0B43d6AD);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0xb7469A575b7931532F09AEe2882835A0249064a0);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(new_FuturesMarketManager_contract);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(new_FuturesMarketSettings_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function systemstatus_updateAccessControls_25() internal {
        bytes32[] memory systemstatus_updateAccessControls_sections_25_0 = new bytes32[](6);
        systemstatus_updateAccessControls_sections_25_0[0] = bytes32("System");
        systemstatus_updateAccessControls_sections_25_0[1] = bytes32("Issuance");
        systemstatus_updateAccessControls_sections_25_0[2] = bytes32("Exchange");
        systemstatus_updateAccessControls_sections_25_0[3] = bytes32("SynthExchange");
        systemstatus_updateAccessControls_sections_25_0[4] = bytes32("Synth");
        systemstatus_updateAccessControls_sections_25_0[5] = bytes32("Futures");
        address[] memory systemstatus_updateAccessControls_accounts_25_1 = new address[](6);
        systemstatus_updateAccessControls_accounts_25_1[0] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_25_1[1] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_25_1[2] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_25_1[3] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_25_1[4] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_25_1[5] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        bool[] memory systemstatus_updateAccessControls_canSuspends_25_2 = new bool[](6);
        systemstatus_updateAccessControls_canSuspends_25_2[0] = bool(true);
        systemstatus_updateAccessControls_canSuspends_25_2[1] = bool(true);
        systemstatus_updateAccessControls_canSuspends_25_2[2] = bool(true);
        systemstatus_updateAccessControls_canSuspends_25_2[3] = bool(true);
        systemstatus_updateAccessControls_canSuspends_25_2[4] = bool(true);
        systemstatus_updateAccessControls_canSuspends_25_2[5] = bool(true);
        bool[] memory systemstatus_updateAccessControls_canResumes_25_3 = new bool[](6);
        systemstatus_updateAccessControls_canResumes_25_3[0] = bool(true);
        systemstatus_updateAccessControls_canResumes_25_3[1] = bool(true);
        systemstatus_updateAccessControls_canResumes_25_3[2] = bool(true);
        systemstatus_updateAccessControls_canResumes_25_3[3] = bool(true);
        systemstatus_updateAccessControls_canResumes_25_3[4] = bool(true);
        systemstatus_updateAccessControls_canResumes_25_3[5] = bool(true);
        systemstatus_i.updateAccessControls(
            systemstatus_updateAccessControls_sections_25_0,
            systemstatus_updateAccessControls_accounts_25_1,
            systemstatus_updateAccessControls_canSuspends_25_2,
            systemstatus_updateAccessControls_canResumes_25_3
        );
    }

    function importFeePeriod_0() internal {
        // https://kovan-explorer.optimism.io/address/0xAe35A8BC0e190D4544579a331229e809B2f7ca7b;
        FeePool existingFeePool = FeePool(0xAe35A8BC0e190D4544579a331229e809B2f7ca7b);
        // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456;
        FeePool newFeePool = FeePool(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
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
        // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456;
        FeePool newFeePool = FeePool(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
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
}

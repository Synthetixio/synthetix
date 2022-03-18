pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../DebtCache.sol";
import "../ExchangeRates.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../FeePoolEternalStorage.sol";
import "../FuturesMarketManager.sol";
import "../FuturesMarketSettings.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
library MigrationLib_DiphdaOptimism {
    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x4a16A42407AA491564643E1dfc1fd50af29794eF
    Proxy public constant proxyfeepool_i = Proxy(0x4a16A42407AA491564643E1dfc1fd50af29794eF);
    // https://explorer.optimism.io/address/0x41140Bf6498a36f2E44eFd49f21dAe3bbb7367c8
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x41140Bf6498a36f2E44eFd49f21dAe3bbb7367c8);
    // https://explorer.optimism.io/address/0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8
    ExchangeState public constant exchangestate_i = ExchangeState(0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc
    FeePool public constant feepool_i = FeePool(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
    // https://explorer.optimism.io/address/0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B
    DebtCache public constant debtcache_i = DebtCache(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
    // https://explorer.optimism.io/address/0x1B9d6cD65dDC981410cb93Af91B097667E0Bc7eE
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x1B9d6cD65dDC981410cb93Af91B097667E0Bc7eE);
    // https://explorer.optimism.io/address/0xD1599E478cC818AFa42A4839a6C665D9279C3E50
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
    // https://explorer.optimism.io/address/0x92bAc115d89cA17fd02Ed9357CEcA32842ACB4c2
    TokenState public constant tokenstatesusd_i = TokenState(0x92bAc115d89cA17fd02Ed9357CEcA32842ACB4c2);
    // https://explorer.optimism.io/address/0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9);
    // https://explorer.optimism.io/address/0x0681883084b5De1564FE2706C87affD77F1677D5
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x0681883084b5De1564FE2706C87affD77F1677D5);
    // https://explorer.optimism.io/address/0xEc3665F7e696b0Ad0D04Ae5161b18782D48cd1fd
    TokenState public constant tokenstateseth_i = TokenState(0xEc3665F7e696b0Ad0D04Ae5161b18782D48cd1fd);
    // https://explorer.optimism.io/address/0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49);
    // https://explorer.optimism.io/address/0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
    // https://explorer.optimism.io/address/0xA9E630952522E3F110322711F424528Af894e307
    TokenState public constant tokenstatesbtc_i = TokenState(0xA9E630952522E3F110322711F424528Af894e307);
    // https://explorer.optimism.io/address/0x298B9B95708152ff6968aafd889c6586e9169f1D
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x298B9B95708152ff6968aafd889c6586e9169f1D);
    // https://explorer.optimism.io/address/0x2302D7F7783e2712C48aA684451b9d706e74F299
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
    // https://explorer.optimism.io/address/0x08a008eEA07d3cC7ca1913EEC3468C10F8F79e6A
    TokenState public constant tokenstateslink_i = TokenState(0x08a008eEA07d3cC7ca1913EEC3468C10F8F79e6A);
    // https://explorer.optimism.io/address/0xc5Db22719A06418028A40A9B5E9A7c02959D0d08
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xc5Db22719A06418028A40A9B5E9A7c02959D0d08);
    // https://explorer.optimism.io/address/0x91DBC6f587D043FEfbaAD050AB48696B30F13d89
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
    // https://explorer.optimism.io/address/0x6825Dd6B5b83FBbFF1049A44dc808A10fe9a6719
    TokenState public constant tokenstatessol_i = TokenState(0x6825Dd6B5b83FBbFF1049A44dc808A10fe9a6719);
    // https://explorer.optimism.io/address/0x8b2F7Ae8cA8EE8428B6D76dE88326bB413db2766
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x8b2F7Ae8cA8EE8428B6D76dE88326bB413db2766);
    // https://explorer.optimism.io/address/0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D
    MultiCollateralSynth public constant synthsavax_i = MultiCollateralSynth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
    // https://explorer.optimism.io/address/0x2114d1C571CB541f3416a65f8BccFf9BB9E55Dc5
    TokenState public constant tokenstatesavax_i = TokenState(0x2114d1C571CB541f3416a65f8BccFf9BB9E55Dc5);
    // https://explorer.optimism.io/address/0xB2b42B231C68cbb0b4bF2FFEbf57782Fd97D3dA4
    ProxyERC20 public constant proxysavax_i = ProxyERC20(0xB2b42B231C68cbb0b4bF2FFEbf57782Fd97D3dA4);
    // https://explorer.optimism.io/address/0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e
    MultiCollateralSynth public constant synthsmatic_i = MultiCollateralSynth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
    // https://explorer.optimism.io/address/0x937C9E1d18bEB4F8E1BCB0Dd7a612ca6012517a3
    TokenState public constant tokenstatesmatic_i = TokenState(0x937C9E1d18bEB4F8E1BCB0Dd7a612ca6012517a3);
    // https://explorer.optimism.io/address/0x81DDfAc111913d3d5218DEA999216323B7CD6356
    ProxyERC20 public constant proxysmatic_i = ProxyERC20(0x81DDfAc111913d3d5218DEA999216323B7CD6356);
    // https://explorer.optimism.io/address/0xB16ef128b11e457afA07B09FCE52A01f5B05a937
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
    // https://explorer.optimism.io/address/0x7afF10fc89B162c7aBf77974d190E7959cb456f5
    TokenState public constant tokenstateseur_i = TokenState(0x7afF10fc89B162c7aBf77974d190E7959cb456f5);
    // https://explorer.optimism.io/address/0xFBc4198702E81aE77c06D58f81b629BDf36f0a71
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xFBc4198702E81aE77c06D58f81b629BDf36f0a71);
    // https://explorer.optimism.io/address/0xAf918f4a72BC34E59dFaF65866feC87947F1f590
    TokenState public constant tokenstatesaave_i = TokenState(0xAf918f4a72BC34E59dFaF65866feC87947F1f590);
    // https://explorer.optimism.io/address/0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9);
    // https://explorer.optimism.io/address/0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff
    TokenState public constant tokenstatesuni_i = TokenState(0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff);
    // https://explorer.optimism.io/address/0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03);
    // https://explorer.optimism.io/address/0xadaD43Be81E2206f6D1aF4299cA2a029e16af7AB
    Issuer public constant issuer_i = Issuer(0xadaD43Be81E2206f6D1aF4299cA2a029e16af7AB);
    // https://explorer.optimism.io/address/0x28224ef515d01709916F5ac4D8a72664A7b56e98
    SystemSettings public constant systemsettings_i = SystemSettings(0x28224ef515d01709916F5ac4D8a72664A7b56e98);
    // https://explorer.optimism.io/address/0xaE55F163337A2A46733AA66dA9F35299f9A46e9e
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xaE55F163337A2A46733AA66dA9F35299f9A46e9e);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xA408d8e01C8E084B67559226C5B55D6F0B7074e2
    address public constant new_OneNetAggregatorDebtRatio_contract = 0xA408d8e01C8E084B67559226C5B55D6F0B7074e2;
    // https://explorer.optimism.io/address/0xe152A2DbcE62E6c0bd387fFd1bb8086F44c5Fd04
    address public constant new_OneNetAggregatorIssuedSynths_contract = 0xe152A2DbcE62E6c0bd387fFd1bb8086F44c5Fd04;
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    address public constant new_SystemStatus_contract = 0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD;
    // https://explorer.optimism.io/address/0x1B9d6cD65dDC981410cb93Af91B097667E0Bc7eE
    address public constant new_ExchangeRates_contract = 0x1B9d6cD65dDC981410cb93Af91B097667E0Bc7eE;
    // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc
    address public constant new_FeePool_contract = 0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc;
    // https://explorer.optimism.io/address/0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4
    address public constant new_ExchangeCircuitBreaker_contract = 0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4;
    // https://explorer.optimism.io/address/0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B
    address public constant new_DebtCache_contract = 0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B;
    // https://explorer.optimism.io/address/0x059681217E9186E007864AA16893b65A0589718B
    address public constant new_Exchanger_contract = 0x059681217E9186E007864AA16893b65A0589718B;
    // https://explorer.optimism.io/address/0xadaD43Be81E2206f6D1aF4299cA2a029e16af7AB
    address public constant new_Issuer_contract = 0xadaD43Be81E2206f6D1aF4299cA2a029e16af7AB;
    // https://explorer.optimism.io/address/0x8F7b21BF5f8490FAa63386f6f6434C6Ae8D8A120
    address public constant new_SynthetixBridgeToBase_contract = 0x8F7b21BF5f8490FAa63386f6f6434C6Ae8D8A120;
    // https://explorer.optimism.io/address/0xD1599E478cC818AFa42A4839a6C665D9279C3E50
    address public constant new_SynthsUSD_contract = 0xD1599E478cC818AFa42A4839a6C665D9279C3E50;
    // https://explorer.optimism.io/address/0x0681883084b5De1564FE2706C87affD77F1677D5
    address public constant new_SynthsETH_contract = 0x0681883084b5De1564FE2706C87affD77F1677D5;
    // https://explorer.optimism.io/address/0x2302D7F7783e2712C48aA684451b9d706e74F299
    address public constant new_SynthsLINK_contract = 0x2302D7F7783e2712C48aA684451b9d706e74F299;
    // https://explorer.optimism.io/address/0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2
    address public constant new_SynthsBTC_contract = 0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2;
    // https://explorer.optimism.io/address/0x91DBC6f587D043FEfbaAD050AB48696B30F13d89
    address public constant new_SynthsSOL_contract = 0x91DBC6f587D043FEfbaAD050AB48696B30F13d89;
    // https://explorer.optimism.io/address/0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e
    address public constant new_SynthsMATIC_contract = 0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e;
    // https://explorer.optimism.io/address/0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D
    address public constant new_SynthsAVAX_contract = 0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D;
    // https://explorer.optimism.io/address/0xB16ef128b11e457afA07B09FCE52A01f5B05a937
    address public constant new_SynthsEUR_contract = 0xB16ef128b11e457afA07B09FCE52A01f5B05a937;
    // https://explorer.optimism.io/address/0xAf918f4a72BC34E59dFaF65866feC87947F1f590
    address public constant new_TokenStatesAAVE_contract = 0xAf918f4a72BC34E59dFaF65866feC87947F1f590;
    // https://explorer.optimism.io/address/0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9
    address public constant new_ProxysAAVE_contract = 0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9;
    // https://explorer.optimism.io/address/0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3
    address public constant new_SynthsAAVE_contract = 0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3;
    // https://explorer.optimism.io/address/0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff
    address public constant new_TokenStatesUNI_contract = 0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff;
    // https://explorer.optimism.io/address/0xC19d27d1dA572d582723C1745650E51AC4Fc877F
    address public constant new_SynthsUNI_contract = 0xC19d27d1dA572d582723C1745650E51AC4Fc877F;
    // https://explorer.optimism.io/address/0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03
    address public constant new_ProxysUNI_contract = 0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03;
    // https://explorer.optimism.io/address/0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B
    address public constant new_FuturesMarketManager_contract = 0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B;
    // https://explorer.optimism.io/address/0xf86048DFf23cF130107dfB4e6386f574231a5C65
    address public constant new_FuturesMarketETH_contract = 0xf86048DFf23cF130107dfB4e6386f574231a5C65;
    // https://explorer.optimism.io/address/0xC51aeDBEC3aCD26650a7E85B6909E8AEc4d0F19e
    address public constant new_FuturesMarketData_contract = 0xC51aeDBEC3aCD26650a7E85B6909E8AEc4d0F19e;
    // https://explorer.optimism.io/address/0xaE55F163337A2A46733AA66dA9F35299f9A46e9e
    address public constant new_FuturesMarketSettings_contract = 0xaE55F163337A2A46733AA66dA9F35299f9A46e9e;
    // https://explorer.optimism.io/address/0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95
    address public constant new_FuturesMarketBTC_contract = 0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95;
    // https://explorer.optimism.io/address/0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A
    address public constant new_FuturesMarketLINK_contract = 0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A;

    function migrate2() external {
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x13e3Ee699D1909E989722E753853AE30b17e08c5);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0xCc232dcFAAE6354cE191Bd574108c1aD03f86450);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sSOL();
        // Ensure the sSOL synth can write to its TokenState;
        tokenstatessol_i.setAssociatedContract(new_SynthsSOL_contract);
        // Ensure the sSOL synth Proxy is correctly connected to the Synth;
        proxyssol_i.setTarget(Proxyable(new_SynthsSOL_contract));
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xC663315f7aF904fbbB0F785c32046dFA03e85270);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAVAX();
        // Ensure the sAVAX synth can write to its TokenState;
        tokenstatesavax_i.setAssociatedContract(new_SynthsAVAX_contract);
        // Ensure the sAVAX synth Proxy is correctly connected to the Synth;
        proxysavax_i.setTarget(Proxyable(new_SynthsAVAX_contract));
        // Ensure the ExchangeRates contract has the feed for sAVAX;
        exchangerates_i.addAggregator("sAVAX", 0x5087Dc69Fd3907a016BD42B38022F7f024140727);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sMATIC();
        // Ensure the sMATIC synth can write to its TokenState;
        tokenstatesmatic_i.setAssociatedContract(new_SynthsMATIC_contract);
        // Ensure the sMATIC synth Proxy is correctly connected to the Synth;
        proxysmatic_i.setTarget(Proxyable(new_SynthsMATIC_contract));
        // Ensure the ExchangeRates contract has the feed for sMATIC;
        exchangerates_i.addAggregator("sMATIC", 0x0ded608AFc23724f614B76955bbd9dFe7dDdc828);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0x3626369857A10CcC6cc3A6e4f5C2f5984a519F20);
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x338ed6787f463394D24813b297401B9F05a8C9d1);
        // Ensure the sUNI synth can write to its TokenState;
        tokenstatesuni_i.setAssociatedContract(new_SynthsUNI_contract);
        // Ensure the sUNI synth Proxy is correctly connected to the Synth;
        proxysuni_i.setTarget(Proxyable(new_SynthsUNI_contract));
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0x11429eE838cC01071402f21C219870cbAc0a59A0);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_74();
        // Set the exchange rates for various synths;
        systemsettings_setExchangeFeeRateForSynths_75();
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
    }

    function issuer_addSynths_74() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_74_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_74_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_74_0[1] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_74_0[2] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_74_0[3] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_74_0[4] = ISynth(new_SynthsSOL_contract);
        issuer_addSynths_synthsToAdd_74_0[5] = ISynth(new_SynthsAVAX_contract);
        issuer_addSynths_synthsToAdd_74_0[6] = ISynth(new_SynthsMATIC_contract);
        issuer_addSynths_synthsToAdd_74_0[7] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_74_0[8] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_74_0[9] = ISynth(new_SynthsUNI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_74_0);
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://explorer.optimism.io/address/0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da;
        Synth existingSynth = Synth(0x78aAA3fb165deCAA729DFE3cf0E97Ab6FCF484da);
        // https://explorer.optimism.io/address/0xD1599E478cC818AFa42A4839a6C665D9279C3E50;
        Synth newSynth = Synth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://explorer.optimism.io/address/0xBD2657CF89F930F27eE1854EF4B389773DF43b29;
        Synth existingSynth = Synth(0xBD2657CF89F930F27eE1854EF4B389773DF43b29);
        // https://explorer.optimism.io/address/0x0681883084b5De1564FE2706C87affD77F1677D5;
        Synth newSynth = Synth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://explorer.optimism.io/address/0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2;
        Synth existingSynth = Synth(0x8Ce809a955DB85b41e7A378D7659e348e0C6AdD2);
        // https://explorer.optimism.io/address/0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2;
        Synth newSynth = Synth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://explorer.optimism.io/address/0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6;
        Synth existingSynth = Synth(0xF33e7B48538C9D0480a48f3b5eEf79026e2a28f6);
        // https://explorer.optimism.io/address/0x2302D7F7783e2712C48aA684451b9d706e74F299;
        Synth newSynth = Synth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sSOL() internal {
        // https://explorer.optimism.io/address/0x8ab13Ca3b6591554a086B7Ad2A012d25C3efD704;
        Synth existingSynth = Synth(0x8ab13Ca3b6591554a086B7Ad2A012d25C3efD704);
        // https://explorer.optimism.io/address/0x91DBC6f587D043FEfbaAD050AB48696B30F13d89;
        Synth newSynth = Synth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAVAX() internal {
        // https://explorer.optimism.io/address/0x5C2B0fdB3C828f087FDdA19Cf7F6fF7c51022aFb;
        Synth existingSynth = Synth(0x5C2B0fdB3C828f087FDdA19Cf7F6fF7c51022aFb);
        // https://explorer.optimism.io/address/0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D;
        Synth newSynth = Synth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sMATIC() internal {
        // https://explorer.optimism.io/address/0x6E3FfC4161931793B7FD084E761C0D12126FD376;
        Synth existingSynth = Synth(0x6E3FfC4161931793B7FD084E761C0D12126FD376);
        // https://explorer.optimism.io/address/0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e;
        Synth newSynth = Synth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://explorer.optimism.io/address/0x824dA469B59eC0E6E6BB5D611888aBF440970414;
        Synth existingSynth = Synth(0x824dA469B59eC0E6E6BB5D611888aBF440970414);
        // https://explorer.optimism.io/address/0xB16ef128b11e457afA07B09FCE52A01f5B05a937;
        Synth newSynth = Synth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function systemsettings_setExchangeFeeRateForSynths_75() internal {
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_75_0 = new bytes32[](2);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_75_0[0] = bytes32("sAAVE");
        systemsettings_setExchangeFeeRateForSynths_synthKeys_75_0[1] = bytes32("sUNI");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_75_1 = new uint256[](2);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_75_1[0] = uint256(2500000000000000);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_75_1[1] = uint256(2500000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(
            systemsettings_setExchangeFeeRateForSynths_synthKeys_75_0,
            systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_75_1
        );
    }
}

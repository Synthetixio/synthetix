pragma solidity ^0.5.16;

import "./MigrationLib_DiphdaOptimism.sol";

// solhint-disable contract-name-camelcase
contract Migration_DiphdaOptimism is BaseMigration {
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

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](40);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(proxyfeepool_i);
        contracts[3] = address(feepooleternalstorage_i);
        contracts[4] = address(exchangestate_i);
        contracts[5] = address(systemstatus_i);
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
        contracts[21] = address(synthssol_i);
        contracts[22] = address(tokenstatessol_i);
        contracts[23] = address(proxyssol_i);
        contracts[24] = address(synthsavax_i);
        contracts[25] = address(tokenstatesavax_i);
        contracts[26] = address(proxysavax_i);
        contracts[27] = address(synthsmatic_i);
        contracts[28] = address(tokenstatesmatic_i);
        contracts[29] = address(proxysmatic_i);
        contracts[30] = address(synthseur_i);
        contracts[31] = address(tokenstateseur_i);
        contracts[32] = address(proxyseur_i);
        contracts[33] = address(tokenstatesaave_i);
        contracts[34] = address(proxysaave_i);
        contracts[35] = address(tokenstatesuni_i);
        contracts[36] = address(proxysuni_i);
        contracts[37] = address(issuer_i);
        contracts[38] = address(systemsettings_i);
        contracts[39] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_OneNetAggregatorDebtRatio_contract).CONTRACT_NAME() == "OneNetAggregatorDebtRatio",
            "Invalid contract supplied for OneNetAggregatorDebtRatio"
        );
        require(
            ISynthetixNamedContract(new_OneNetAggregatorIssuedSynths_contract).CONTRACT_NAME() ==
                "OneNetAggregatorIssuedSynths",
            "Invalid contract supplied for OneNetAggregatorIssuedSynths"
        );
        require(
            ISynthetixNamedContract(new_SystemStatus_contract).CONTRACT_NAME() == "SystemStatus",
            "Invalid contract supplied for SystemStatus"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_ExchangeCircuitBreaker_contract).CONTRACT_NAME() == "ExchangeCircuitBreaker",
            "Invalid contract supplied for ExchangeCircuitBreaker"
        );
        require(
            ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache",
            "Invalid contract supplied for DebtCache"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        require(
            ISynthetixNamedContract(new_SynthetixBridgeToBase_contract).CONTRACT_NAME() == "SynthetixBridgeToBase",
            "Invalid contract supplied for SynthetixBridgeToBase"
        );
        require(
            ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUSD"
        );
        require(
            ISynthetixNamedContract(new_SynthsETH_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsETH"
        );
        require(
            ISynthetixNamedContract(new_SynthsLINK_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsLINK"
        );
        require(
            ISynthetixNamedContract(new_SynthsBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsBTC"
        );
        require(
            ISynthetixNamedContract(new_SynthsSOL_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsSOL"
        );
        require(
            ISynthetixNamedContract(new_SynthsMATIC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsMATIC"
        );
        require(
            ISynthetixNamedContract(new_SynthsAVAX_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAVAX"
        );
        require(
            ISynthetixNamedContract(new_SynthsEUR_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsEUR"
        );
        require(
            ISynthetixNamedContract(new_SynthsAAVE_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAAVE"
        );
        require(
            ISynthetixNamedContract(new_SynthsUNI_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUNI"
        );
        require(
            ISynthetixNamedContract(new_FuturesMarketManager_contract).CONTRACT_NAME() == "FuturesMarketManager",
            "Invalid contract supplied for FuturesMarketManager"
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
            IDebtCache(0x01f8C5e421172B67cc14B7f5F369cfb10de0acD4),
            IIssuer(0xdf1F1f0059bA70C182471467d3017511B1a122E8)
        );
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x2FCF37343e916eAEd1f1DdaaF84458a359b53877);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x13e3Ee699D1909E989722E753853AE30b17e08c5);

        MigrationLib_DiphdaOptimism.migrate2();

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
        bytes32[] memory addressresolver_importAddresses_names_1_0 = new bytes32[](32);
        addressresolver_importAddresses_names_1_0[0] = bytes32("OneNetAggregatorDebtRatio");
        addressresolver_importAddresses_names_1_0[1] = bytes32("OneNetAggregatorIssuedSynths");
        addressresolver_importAddresses_names_1_0[2] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_1_0[3] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_1_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_1_0[5] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_1_0[6] = bytes32("DebtCache");
        addressresolver_importAddresses_names_1_0[7] = bytes32("Exchanger");
        addressresolver_importAddresses_names_1_0[8] = bytes32("Issuer");
        addressresolver_importAddresses_names_1_0[9] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_1_0[10] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_1_0[11] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_1_0[12] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_1_0[13] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_1_0[14] = bytes32("SynthsSOL");
        addressresolver_importAddresses_names_1_0[15] = bytes32("SynthsMATIC");
        addressresolver_importAddresses_names_1_0[16] = bytes32("SynthsAVAX");
        addressresolver_importAddresses_names_1_0[17] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_1_0[18] = bytes32("TokenStatesAAVE");
        addressresolver_importAddresses_names_1_0[19] = bytes32("ProxysAAVE");
        addressresolver_importAddresses_names_1_0[20] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_1_0[21] = bytes32("TokenStatesUNI");
        addressresolver_importAddresses_names_1_0[22] = bytes32("SynthsUNI");
        addressresolver_importAddresses_names_1_0[23] = bytes32("ProxysUNI");
        addressresolver_importAddresses_names_1_0[24] = bytes32("FuturesMarketManager");
        addressresolver_importAddresses_names_1_0[25] = bytes32("FuturesMarketETH");
        addressresolver_importAddresses_names_1_0[26] = bytes32("FuturesMarketData");
        addressresolver_importAddresses_names_1_0[27] = bytes32("FuturesMarketSettings");
        addressresolver_importAddresses_names_1_0[28] = bytes32("FuturesMarketBTC");
        addressresolver_importAddresses_names_1_0[29] = bytes32("FuturesMarketLINK");
        addressresolver_importAddresses_names_1_0[30] = bytes32("ext:AggregatorIssuedSynths");
        addressresolver_importAddresses_names_1_0[31] = bytes32("ext:AggregatorDebtRatio");
        address[] memory addressresolver_importAddresses_destinations_1_1 = new address[](32);
        addressresolver_importAddresses_destinations_1_1[0] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_1_1[1] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_1_1[2] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_1_1[3] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_1_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_1_1[5] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_1_1[6] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_1_1[7] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_1_1[8] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_1_1[9] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_1_1[10] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_1_1[11] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_1_1[12] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_1_1[13] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_1_1[14] = address(new_SynthsSOL_contract);
        addressresolver_importAddresses_destinations_1_1[15] = address(new_SynthsMATIC_contract);
        addressresolver_importAddresses_destinations_1_1[16] = address(new_SynthsAVAX_contract);
        addressresolver_importAddresses_destinations_1_1[17] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_1_1[18] = address(new_TokenStatesAAVE_contract);
        addressresolver_importAddresses_destinations_1_1[19] = address(new_ProxysAAVE_contract);
        addressresolver_importAddresses_destinations_1_1[20] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_1_1[21] = address(new_TokenStatesUNI_contract);
        addressresolver_importAddresses_destinations_1_1[22] = address(new_SynthsUNI_contract);
        addressresolver_importAddresses_destinations_1_1[23] = address(new_ProxysUNI_contract);
        addressresolver_importAddresses_destinations_1_1[24] = address(new_FuturesMarketManager_contract);
        addressresolver_importAddresses_destinations_1_1[25] = address(new_FuturesMarketETH_contract);
        addressresolver_importAddresses_destinations_1_1[26] = address(new_FuturesMarketData_contract);
        addressresolver_importAddresses_destinations_1_1[27] = address(new_FuturesMarketSettings_contract);
        addressresolver_importAddresses_destinations_1_1[28] = address(new_FuturesMarketBTC_contract);
        addressresolver_importAddresses_destinations_1_1[29] = address(new_FuturesMarketLINK_contract);
        addressresolver_importAddresses_destinations_1_1[30] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_1_1[31] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_1_0,
            addressresolver_importAddresses_destinations_1_1
        );
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x14E6f8e6Da00a32C069b11b64e48EA1FEF2361D4);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x8518f879a2B8138405E947A48326F55FF9D5f3aD);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_ExchangeCircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(new_SynthsSOL_contract);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(new_SynthsAVAX_contract);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(new_SynthsMATIC_contract);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(new_SynthsUNI_contract);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(new_FuturesMarketBTC_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(new_FuturesMarketETH_contract);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(new_FuturesMarketLINK_contract);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xD21969A86Ce5c41aAb2D492a0F802AA3e015cd9A);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0x27be2EFAd45DeBd732C1EBf5C9F7b49D498D4a93);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(new_FuturesMarketManager_contract);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(new_FuturesMarketSettings_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function importFeePeriod_0() internal {
        // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54;
        FeePool existingFeePool = FeePool(0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54);
        // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc;
        FeePool newFeePool = FeePool(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
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
        // https://explorer.optimism.io/address/0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54;
        FeePool existingFeePool = FeePool(0xcFDcCFf3835Eb002eF0360F9514A66E6717fCC54);
        // https://explorer.optimism.io/address/0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc;
        FeePool newFeePool = FeePool(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
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

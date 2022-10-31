pragma solidity ^0.5.16;

import "./MigrationLib_Diphda.sol";

// solhint-disable contract-name-camelcase
contract Migration_Diphda is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xb440DD674e1243644791a4AdfE3A2AbB0A92d309
    Proxy public constant proxyfeepool_i = Proxy(0xb440DD674e1243644791a4AdfE3A2AbB0A92d309);
    // https://etherscan.io/address/0xC9DFff5fA5605fd94F8B7927b892F2B57391e8bB
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0xC9DFff5fA5605fd94F8B7927b892F2B57391e8bB);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x3B2f389AeE480238A49E3A9985cd6815370712eB
    FeePool public constant feepool_i = FeePool(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
    // https://etherscan.io/address/0x1620Aa736939597891C1940CF0d28b82566F9390
    DebtCache public constant debtcache_i = DebtCache(0x1620Aa736939597891C1940CF0d28b82566F9390);
    // https://etherscan.io/address/0x6fA9E5923CBFDD39F0B625Bf1350Ffb50D5006b9
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x6fA9E5923CBFDD39F0B625Bf1350Ffb50D5006b9);
    // https://etherscan.io/address/0x7df9b3f8f1C011D8BD707430e97E747479DD532a
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
    // https://etherscan.io/address/0x05a9CBe762B36632b3594DA4F082340E0e5343e8
    TokenState public constant tokenstatesusd_i = TokenState(0x05a9CBe762B36632b3594DA4F082340E0e5343e8);
    // https://etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    Proxy public constant proxysusd_i = Proxy(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://etherscan.io/address/0x1b06a00Df0B27E7871E753720D4917a7D1aac68b
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
    // https://etherscan.io/address/0x6568D9e750fC44AF00f857885Dfb8281c00529c4
    TokenState public constant tokenstateseur_i = TokenState(0x6568D9e750fC44AF00f857885Dfb8281c00529c4);
    // https://etherscan.io/address/0xD71eCFF9342A5Ced620049e616c5035F1dB98620
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xD71eCFF9342A5Ced620049e616c5035F1dB98620);
    // https://etherscan.io/address/0xB82f11f3168Ece7D56fe6a5679567948090de7C5
    MultiCollateralSynth public constant synthsjpy_i = MultiCollateralSynth(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
    // https://etherscan.io/address/0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed
    TokenState public constant tokenstatesjpy_i = TokenState(0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed);
    // https://etherscan.io/address/0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d
    ProxyERC20 public constant proxysjpy_i = ProxyERC20(0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d);
    // https://etherscan.io/address/0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C
    MultiCollateralSynth public constant synthsaud_i = MultiCollateralSynth(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
    // https://etherscan.io/address/0xCb29D2cf2C65d3Be1d00F07f3441390432D55203
    TokenState public constant tokenstatesaud_i = TokenState(0xCb29D2cf2C65d3Be1d00F07f3441390432D55203);
    // https://etherscan.io/address/0xF48e200EAF9906362BB1442fca31e0835773b8B4
    ProxyERC20 public constant proxysaud_i = ProxyERC20(0xF48e200EAF9906362BB1442fca31e0835773b8B4);
    // https://etherscan.io/address/0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf
    MultiCollateralSynth public constant synthsgbp_i = MultiCollateralSynth(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
    // https://etherscan.io/address/0x7e88D19A79b291cfE5696d496055f7e57F537A75
    TokenState public constant tokenstatesgbp_i = TokenState(0x7e88D19A79b291cfE5696d496055f7e57F537A75);
    // https://etherscan.io/address/0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F
    ProxyERC20 public constant proxysgbp_i = ProxyERC20(0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F);
    // https://etherscan.io/address/0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d
    MultiCollateralSynth public constant synthschf_i = MultiCollateralSynth(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
    // https://etherscan.io/address/0x52496fE8a4feaEFe14d9433E00D48E6929c13deC
    TokenState public constant tokenstateschf_i = TokenState(0x52496fE8a4feaEFe14d9433E00D48E6929c13deC);
    // https://etherscan.io/address/0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d
    ProxyERC20 public constant proxyschf_i = ProxyERC20(0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d);
    // https://etherscan.io/address/0x527637bE27640d6C3e751d24DC67129A6d13E11C
    MultiCollateralSynth public constant synthskrw_i = MultiCollateralSynth(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
    // https://etherscan.io/address/0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730
    TokenState public constant tokenstateskrw_i = TokenState(0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730);
    // https://etherscan.io/address/0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B
    ProxyERC20 public constant proxyskrw_i = ProxyERC20(0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B);
    // https://etherscan.io/address/0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
    // https://etherscan.io/address/0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67
    TokenState public constant tokenstatesbtc_i = TokenState(0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67);
    // https://etherscan.io/address/0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6);
    // https://etherscan.io/address/0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
    // https://etherscan.io/address/0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c
    TokenState public constant tokenstateseth_i = TokenState(0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c);
    // https://etherscan.io/address/0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);
    // https://etherscan.io/address/0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
    // https://etherscan.io/address/0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0
    TokenState public constant tokenstateslink_i = TokenState(0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0);
    // https://etherscan.io/address/0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6);
    // https://etherscan.io/address/0xB34F4d7c207D8979D05EDb0F63f174764Bd67825
    MultiCollateralSynth public constant synthsada_i = MultiCollateralSynth(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
    // https://etherscan.io/address/0x9956c5019a24fbd5B506AD070b771577bAc5c343
    TokenState public constant tokenstatesada_i = TokenState(0x9956c5019a24fbd5B506AD070b771577bAc5c343);
    // https://etherscan.io/address/0xe36E2D3c7c34281FA3bC737950a68571736880A1
    ProxyERC20 public constant proxysada_i = ProxyERC20(0xe36E2D3c7c34281FA3bC737950a68571736880A1);
    // https://etherscan.io/address/0x95aE43E5E96314E4afffcf19D9419111cd11169e
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
    // https://etherscan.io/address/0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0
    TokenState public constant tokenstatesaave_i = TokenState(0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0);
    // https://etherscan.io/address/0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076);
    // https://etherscan.io/address/0x27b45A4208b87A899009f45888139882477Acea5
    MultiCollateralSynth public constant synthsdot_i = MultiCollateralSynth(0x27b45A4208b87A899009f45888139882477Acea5);
    // https://etherscan.io/address/0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077
    TokenState public constant tokenstatesdot_i = TokenState(0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077);
    // https://etherscan.io/address/0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6
    ProxyERC20 public constant proxysdot_i = ProxyERC20(0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6);
    // https://etherscan.io/address/0x6DF798ec713b33BE823b917F27820f2aA0cf7662
    MultiCollateralSynth public constant synthsethbtc_i = MultiCollateralSynth(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
    // https://etherscan.io/address/0x042A7A0022A7695454ac5Be77a4860e50c9683fC
    TokenState public constant tokenstatesethbtc_i = TokenState(0x042A7A0022A7695454ac5Be77a4860e50c9683fC);
    // https://etherscan.io/address/0x104eDF1da359506548BFc7c25bA1E28C16a70235
    ProxyERC20 public constant proxysethbtc_i = ProxyERC20(0x104eDF1da359506548BFc7c25bA1E28C16a70235);
    // https://etherscan.io/address/0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124
    MultiCollateralSynth public constant synthsdefi_i = MultiCollateralSynth(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
    // https://etherscan.io/address/0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB
    TokenState public constant tokenstatesdefi_i = TokenState(0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB);
    // https://etherscan.io/address/0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B
    ProxyERC20 public constant proxysdefi_i = ProxyERC20(0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B);
    // https://etherscan.io/address/0xE60E71E47Ca405946CF147CA9d7589a851DBcddC
    Issuer public constant issuer_i = Issuer(0xE60E71E47Ca405946CF147CA9d7589a851DBcddC);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x977d0DD7eA212E9ca1dcD4Ec15cd7Ceb135fa68D
    address public constant new_OneNetAggregatorDebtRatio_contract = 0x977d0DD7eA212E9ca1dcD4Ec15cd7Ceb135fa68D;
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    address public constant new_SystemStatus_contract = 0x696c905F8F8c006cA46e9808fE7e00049507798F;
    // https://etherscan.io/address/0x6fA9E5923CBFDD39F0B625Bf1350Ffb50D5006b9
    address public constant new_ExchangeRates_contract = 0x6fA9E5923CBFDD39F0B625Bf1350Ffb50D5006b9;
    // https://etherscan.io/address/0xcf1405b18dBCEA2893Abe635c88359C75878B9e1
    address public constant new_OneNetAggregatorIssuedSynths_contract = 0xcf1405b18dBCEA2893Abe635c88359C75878B9e1;
    // https://etherscan.io/address/0x3B2f389AeE480238A49E3A9985cd6815370712eB
    address public constant new_FeePool_contract = 0x3B2f389AeE480238A49E3A9985cd6815370712eB;
    // https://etherscan.io/address/0x74E9a032B04D9732E826eECFC5c7A1C183602FB1
    address public constant new_Exchanger_contract = 0x74E9a032B04D9732E826eECFC5c7A1C183602FB1;
    // https://etherscan.io/address/0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437
    address public constant new_ExchangeCircuitBreaker_contract = 0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437;
    // https://etherscan.io/address/0x1620Aa736939597891C1940CF0d28b82566F9390
    address public constant new_DebtCache_contract = 0x1620Aa736939597891C1940CF0d28b82566F9390;
    // https://etherscan.io/address/0xc51f137e19F1ae6944887388FD12b2b6dFD12594
    address public constant new_SynthetixBridgeToOptimism_contract = 0xc51f137e19F1ae6944887388FD12b2b6dFD12594;
    // https://etherscan.io/address/0xE60E71E47Ca405946CF147CA9d7589a851DBcddC
    address public constant new_Issuer_contract = 0xE60E71E47Ca405946CF147CA9d7589a851DBcddC;
    // https://etherscan.io/address/0x7df9b3f8f1C011D8BD707430e97E747479DD532a
    address public constant new_SynthsUSD_contract = 0x7df9b3f8f1C011D8BD707430e97E747479DD532a;
    // https://etherscan.io/address/0x1b06a00Df0B27E7871E753720D4917a7D1aac68b
    address public constant new_SynthsEUR_contract = 0x1b06a00Df0B27E7871E753720D4917a7D1aac68b;
    // https://etherscan.io/address/0xB82f11f3168Ece7D56fe6a5679567948090de7C5
    address public constant new_SynthsJPY_contract = 0xB82f11f3168Ece7D56fe6a5679567948090de7C5;
    // https://etherscan.io/address/0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C
    address public constant new_SynthsAUD_contract = 0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C;
    // https://etherscan.io/address/0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf
    address public constant new_SynthsGBP_contract = 0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf;
    // https://etherscan.io/address/0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d
    address public constant new_SynthsCHF_contract = 0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d;
    // https://etherscan.io/address/0x527637bE27640d6C3e751d24DC67129A6d13E11C
    address public constant new_SynthsKRW_contract = 0x527637bE27640d6C3e751d24DC67129A6d13E11C;
    // https://etherscan.io/address/0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6
    address public constant new_SynthsETH_contract = 0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6;
    // https://etherscan.io/address/0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6
    address public constant new_SynthsBTC_contract = 0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6;
    // https://etherscan.io/address/0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6
    address public constant new_SynthsLINK_contract = 0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6;
    // https://etherscan.io/address/0xB34F4d7c207D8979D05EDb0F63f174764Bd67825
    address public constant new_SynthsADA_contract = 0xB34F4d7c207D8979D05EDb0F63f174764Bd67825;
    // https://etherscan.io/address/0x95aE43E5E96314E4afffcf19D9419111cd11169e
    address public constant new_SynthsAAVE_contract = 0x95aE43E5E96314E4afffcf19D9419111cd11169e;
    // https://etherscan.io/address/0x27b45A4208b87A899009f45888139882477Acea5
    address public constant new_SynthsDOT_contract = 0x27b45A4208b87A899009f45888139882477Acea5;
    // https://etherscan.io/address/0x6DF798ec713b33BE823b917F27820f2aA0cf7662
    address public constant new_SynthsETHBTC_contract = 0x6DF798ec713b33BE823b917F27820f2aA0cf7662;
    // https://etherscan.io/address/0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124
    address public constant new_SynthsDEFI_contract = 0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124;
    // https://etherscan.io/address/0x834Ef6c82D431Ac9A7A6B66325F185b2430780D7
    address public constant new_FuturesMarketManager_contract = 0x834Ef6c82D431Ac9A7A6B66325F185b2430780D7;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](55);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(exchangestate_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(rewardescrow_i);
        contracts[6] = address(feepool_i);
        contracts[7] = address(debtcache_i);
        contracts[8] = address(exchangerates_i);
        contracts[9] = address(synthsusd_i);
        contracts[10] = address(tokenstatesusd_i);
        contracts[11] = address(proxysusd_i);
        contracts[12] = address(synthseur_i);
        contracts[13] = address(tokenstateseur_i);
        contracts[14] = address(proxyseur_i);
        contracts[15] = address(synthsjpy_i);
        contracts[16] = address(tokenstatesjpy_i);
        contracts[17] = address(proxysjpy_i);
        contracts[18] = address(synthsaud_i);
        contracts[19] = address(tokenstatesaud_i);
        contracts[20] = address(proxysaud_i);
        contracts[21] = address(synthsgbp_i);
        contracts[22] = address(tokenstatesgbp_i);
        contracts[23] = address(proxysgbp_i);
        contracts[24] = address(synthschf_i);
        contracts[25] = address(tokenstateschf_i);
        contracts[26] = address(proxyschf_i);
        contracts[27] = address(synthskrw_i);
        contracts[28] = address(tokenstateskrw_i);
        contracts[29] = address(proxyskrw_i);
        contracts[30] = address(synthsbtc_i);
        contracts[31] = address(tokenstatesbtc_i);
        contracts[32] = address(proxysbtc_i);
        contracts[33] = address(synthseth_i);
        contracts[34] = address(tokenstateseth_i);
        contracts[35] = address(proxyseth_i);
        contracts[36] = address(synthslink_i);
        contracts[37] = address(tokenstateslink_i);
        contracts[38] = address(proxyslink_i);
        contracts[39] = address(synthsada_i);
        contracts[40] = address(tokenstatesada_i);
        contracts[41] = address(proxysada_i);
        contracts[42] = address(synthsaave_i);
        contracts[43] = address(tokenstatesaave_i);
        contracts[44] = address(proxysaave_i);
        contracts[45] = address(synthsdot_i);
        contracts[46] = address(tokenstatesdot_i);
        contracts[47] = address(proxysdot_i);
        contracts[48] = address(synthsethbtc_i);
        contracts[49] = address(tokenstatesethbtc_i);
        contracts[50] = address(proxysethbtc_i);
        contracts[51] = address(synthsdefi_i);
        contracts[52] = address(tokenstatesdefi_i);
        contracts[53] = address(proxysdefi_i);
        contracts[54] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_OneNetAggregatorDebtRatio_contract).CONTRACT_NAME() == "OneNetAggregatorDebtRatio",
            "Invalid contract supplied for OneNetAggregatorDebtRatio"
        );
        require(
            ISynthetixNamedContract(new_SystemStatus_contract).CONTRACT_NAME() == "SystemStatus",
            "Invalid contract supplied for SystemStatus"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_OneNetAggregatorIssuedSynths_contract).CONTRACT_NAME() ==
                "OneNetAggregatorIssuedSynths",
            "Invalid contract supplied for OneNetAggregatorIssuedSynths"
        );
        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
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
            ISynthetixNamedContract(new_SynthetixBridgeToOptimism_contract).CONTRACT_NAME() == "SynthetixBridgeToOptimism",
            "Invalid contract supplied for SynthetixBridgeToOptimism"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        require(
            ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUSD"
        );
        require(
            ISynthetixNamedContract(new_SynthsEUR_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsEUR"
        );
        require(
            ISynthetixNamedContract(new_SynthsJPY_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsJPY"
        );
        require(
            ISynthetixNamedContract(new_SynthsAUD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAUD"
        );
        require(
            ISynthetixNamedContract(new_SynthsGBP_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsGBP"
        );
        require(
            ISynthetixNamedContract(new_SynthsCHF_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsCHF"
        );
        require(
            ISynthetixNamedContract(new_SynthsKRW_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsKRW"
        );
        require(
            ISynthetixNamedContract(new_SynthsETH_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsETH"
        );
        require(
            ISynthetixNamedContract(new_SynthsBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsBTC"
        );
        require(
            ISynthetixNamedContract(new_SynthsLINK_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsLINK"
        );
        require(
            ISynthetixNamedContract(new_SynthsADA_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsADA"
        );
        require(
            ISynthetixNamedContract(new_SynthsAAVE_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAAVE"
        );
        require(
            ISynthetixNamedContract(new_SynthsDOT_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsDOT"
        );
        require(
            ISynthetixNamedContract(new_SynthsETHBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsETHBTC"
        );
        require(
            ISynthetixNamedContract(new_SynthsDEFI_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsDEFI"
        );
        require(
            ISynthetixNamedContract(new_FuturesMarketManager_contract).CONTRACT_NAME() == "EmptyFuturesMarketManager",
            "Invalid contract supplied for FuturesMarketManager"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        MigrationLib_Diphda.addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        MigrationLib_Diphda.addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        MigrationLib_Diphda.addressresolver_rebuildCaches_2();
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
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Import excluded-debt records from existing DebtCache;
        debtcache_i.importExcludedIssuedDebts(
            IDebtCache(0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E),
            IIssuer(0x16e5ACe2B8a9DE5c42fCFd85d6EC5992a43C0837)
        );
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);

        MigrationLib_Diphda.migrate2();

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

    function importFeePeriod_0() internal {
        // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec;
        FeePool existingFeePool = FeePool(0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec);
        // https://etherscan.io/address/0x3B2f389AeE480238A49E3A9985cd6815370712eB;
        FeePool newFeePool = FeePool(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
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
        // https://etherscan.io/address/0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec;
        FeePool existingFeePool = FeePool(0xBE02A2C22a581D796b90b200CF530Fdd1e6f54ec);
        // https://etherscan.io/address/0x3B2f389AeE480238A49E3A9985cd6815370712eB;
        FeePool newFeePool = FeePool(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
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

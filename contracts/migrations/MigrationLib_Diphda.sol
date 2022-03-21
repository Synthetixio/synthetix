pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../DebtCache.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../FeePoolEternalStorage.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../RewardEscrow.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
library MigrationLib_Diphda {
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

    function migrate2() external {
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sJPY();
        // Ensure the sJPY synth can write to its TokenState;
        tokenstatesjpy_i.setAssociatedContract(new_SynthsJPY_contract);
        // Ensure the sJPY synth Proxy is correctly connected to the Synth;
        proxysjpy_i.setTarget(Proxyable(new_SynthsJPY_contract));
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAUD();
        // Ensure the sAUD synth can write to its TokenState;
        tokenstatesaud_i.setAssociatedContract(new_SynthsAUD_contract);
        // Ensure the sAUD synth Proxy is correctly connected to the Synth;
        proxysaud_i.setTarget(Proxyable(new_SynthsAUD_contract));
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sGBP();
        // Ensure the sGBP synth can write to its TokenState;
        tokenstatesgbp_i.setAssociatedContract(new_SynthsGBP_contract);
        // Ensure the sGBP synth Proxy is correctly connected to the Synth;
        proxysgbp_i.setTarget(Proxyable(new_SynthsGBP_contract));
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sCHF();
        // Ensure the sCHF synth can write to its TokenState;
        tokenstateschf_i.setAssociatedContract(new_SynthsCHF_contract);
        // Ensure the sCHF synth Proxy is correctly connected to the Synth;
        proxyschf_i.setTarget(Proxyable(new_SynthsCHF_contract));
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sKRW();
        // Ensure the sKRW synth can write to its TokenState;
        tokenstateskrw_i.setAssociatedContract(new_SynthsKRW_contract);
        // Ensure the sKRW synth Proxy is correctly connected to the Synth;
        proxyskrw_i.setTarget(Proxyable(new_SynthsKRW_contract));
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x01435677FB11763550905594A16B645847C1d0F3);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sADA();
        // Ensure the sADA synth can write to its TokenState;
        tokenstatesada_i.setAssociatedContract(new_SynthsADA_contract);
        // Ensure the sADA synth Proxy is correctly connected to the Synth;
        proxysada_i.setTarget(Proxyable(new_SynthsADA_contract));
        // Ensure the ExchangeRates contract has the feed for sADA;
        exchangerates_i.addAggregator("sADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sDOT();
        // Ensure the sDOT synth can write to its TokenState;
        tokenstatesdot_i.setAssociatedContract(new_SynthsDOT_contract);
        // Ensure the sDOT synth Proxy is correctly connected to the Synth;
        proxysdot_i.setTarget(Proxyable(new_SynthsDOT_contract));
        // Ensure the ExchangeRates contract has the feed for sDOT;
        exchangerates_i.addAggregator("sDOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETHBTC();
        // Ensure the sETHBTC synth can write to its TokenState;
        tokenstatesethbtc_i.setAssociatedContract(new_SynthsETHBTC_contract);
        // Ensure the sETHBTC synth Proxy is correctly connected to the Synth;
        proxysethbtc_i.setTarget(Proxyable(new_SynthsETHBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sETHBTC;
        exchangerates_i.addAggregator("sETHBTC", 0xAc559F25B1619171CbC396a50854A3240b6A4e99);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sDEFI();
        // Ensure the sDEFI synth can write to its TokenState;
        tokenstatesdefi_i.setAssociatedContract(new_SynthsDEFI_contract);
        // Ensure the sDEFI synth Proxy is correctly connected to the Synth;
        proxysdefi_i.setTarget(Proxyable(new_SynthsDEFI_contract));
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0xa8E875F94138B0C5b51d1e1d5dE35bbDdd28EA87);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_96();
        // SIP-120 Set the DEX price aggregator (uniswap TWAP oracle reader);
        exchangerates_i.setDexPriceAggregator(IDexPriceAggregator(0xf120F029Ac143633d1942e48aE2Dfa2036C5786c));
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://etherscan.io/address/0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA;
        Synth existingSynth = Synth(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
        // https://etherscan.io/address/0x7df9b3f8f1C011D8BD707430e97E747479DD532a;
        Synth newSynth = Synth(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://etherscan.io/address/0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0;
        Synth existingSynth = Synth(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
        // https://etherscan.io/address/0x1b06a00Df0B27E7871E753720D4917a7D1aac68b;
        Synth newSynth = Synth(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sJPY() internal {
        // https://etherscan.io/address/0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A;
        Synth existingSynth = Synth(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
        // https://etherscan.io/address/0xB82f11f3168Ece7D56fe6a5679567948090de7C5;
        Synth newSynth = Synth(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAUD() internal {
        // https://etherscan.io/address/0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827;
        Synth existingSynth = Synth(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
        // https://etherscan.io/address/0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C;
        Synth newSynth = Synth(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sGBP() internal {
        // https://etherscan.io/address/0xde3892383965FBa6eC434bE6350F85f140098708;
        Synth existingSynth = Synth(0xde3892383965FBa6eC434bE6350F85f140098708);
        // https://etherscan.io/address/0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf;
        Synth newSynth = Synth(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sCHF() internal {
        // https://etherscan.io/address/0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D;
        Synth existingSynth = Synth(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
        // https://etherscan.io/address/0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d;
        Synth newSynth = Synth(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sKRW() internal {
        // https://etherscan.io/address/0xe2f532c389deb5E42DCe53e78A9762949A885455;
        Synth existingSynth = Synth(0xe2f532c389deb5E42DCe53e78A9762949A885455);
        // https://etherscan.io/address/0x527637bE27640d6C3e751d24DC67129A6d13E11C;
        Synth newSynth = Synth(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://etherscan.io/address/0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353;
        Synth existingSynth = Synth(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
        // https://etherscan.io/address/0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6;
        Synth newSynth = Synth(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://etherscan.io/address/0xc70B42930BD8D30A79B55415deC3be60827559f7;
        Synth existingSynth = Synth(0xc70B42930BD8D30A79B55415deC3be60827559f7);
        // https://etherscan.io/address/0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6;
        Synth newSynth = Synth(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://etherscan.io/address/0x3FFE35c3d412150C3B91d3E22eBA60E16030C608;
        Synth existingSynth = Synth(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
        // https://etherscan.io/address/0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6;
        Synth newSynth = Synth(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sADA() internal {
        // https://etherscan.io/address/0x8f9fa817200F5B95f9572c8Acf2b31410C00335a;
        Synth existingSynth = Synth(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
        // https://etherscan.io/address/0xB34F4d7c207D8979D05EDb0F63f174764Bd67825;
        Synth newSynth = Synth(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://etherscan.io/address/0x0705F0716b12a703d4F8832Ec7b97C61771f0361;
        Synth existingSynth = Synth(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
        // https://etherscan.io/address/0x95aE43E5E96314E4afffcf19D9419111cd11169e;
        Synth newSynth = Synth(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sDOT() internal {
        // https://etherscan.io/address/0xfA60918C4417b64E722ca15d79C751c1f24Ab995;
        Synth existingSynth = Synth(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
        // https://etherscan.io/address/0x27b45A4208b87A899009f45888139882477Acea5;
        Synth newSynth = Synth(0x27b45A4208b87A899009f45888139882477Acea5);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETHBTC() internal {
        // https://etherscan.io/address/0xcc3aab773e2171b2E257Ee17001400eE378aa52B;
        Synth existingSynth = Synth(0xcc3aab773e2171b2E257Ee17001400eE378aa52B);
        // https://etherscan.io/address/0x6DF798ec713b33BE823b917F27820f2aA0cf7662;
        Synth newSynth = Synth(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sDEFI() internal {
        // https://etherscan.io/address/0xe59dFC746D566EB40F92ed0B162004e24E3AC932;
        Synth existingSynth = Synth(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
        // https://etherscan.io/address/0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124;
        Synth newSynth = Synth(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_96() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_96_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_96_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_96_0[1] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_96_0[2] = ISynth(new_SynthsJPY_contract);
        issuer_addSynths_synthsToAdd_96_0[3] = ISynth(new_SynthsAUD_contract);
        issuer_addSynths_synthsToAdd_96_0[4] = ISynth(new_SynthsGBP_contract);
        issuer_addSynths_synthsToAdd_96_0[5] = ISynth(new_SynthsCHF_contract);
        issuer_addSynths_synthsToAdd_96_0[6] = ISynth(new_SynthsKRW_contract);
        issuer_addSynths_synthsToAdd_96_0[7] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_96_0[8] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_96_0[9] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_96_0[10] = ISynth(new_SynthsADA_contract);
        issuer_addSynths_synthsToAdd_96_0[11] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_96_0[12] = ISynth(new_SynthsDOT_contract);
        issuer_addSynths_synthsToAdd_96_0[13] = ISynth(new_SynthsETHBTC_contract);
        issuer_addSynths_synthsToAdd_96_0[14] = ISynth(new_SynthsDEFI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_96_0);
    }

    function addressresolver_importAddresses_0() external {
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](28);
        addressresolver_importAddresses_names_0_0[0] = bytes32("OneNetAggregatorDebtRatio");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_0_0[2] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[3] = bytes32("OneNetAggregatorIssuedSynths");
        addressresolver_importAddresses_names_0_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[5] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[6] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_0_0[7] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthetixBridgeToOptimism");
        addressresolver_importAddresses_names_0_0[9] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[11] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_0_0[12] = bytes32("SynthsJPY");
        addressresolver_importAddresses_names_0_0[13] = bytes32("SynthsAUD");
        addressresolver_importAddresses_names_0_0[14] = bytes32("SynthsGBP");
        addressresolver_importAddresses_names_0_0[15] = bytes32("SynthsCHF");
        addressresolver_importAddresses_names_0_0[16] = bytes32("SynthsKRW");
        addressresolver_importAddresses_names_0_0[17] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[18] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[19] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[20] = bytes32("SynthsADA");
        addressresolver_importAddresses_names_0_0[21] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_0_0[22] = bytes32("SynthsDOT");
        addressresolver_importAddresses_names_0_0[23] = bytes32("SynthsETHBTC");
        addressresolver_importAddresses_names_0_0[24] = bytes32("SynthsDEFI");
        addressresolver_importAddresses_names_0_0[25] = bytes32("FuturesMarketManager");
        addressresolver_importAddresses_names_0_0[26] = bytes32("ext:AggregatorIssuedSynths");
        addressresolver_importAddresses_names_0_0[27] = bytes32("ext:AggregatorDebtRatio");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](28);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthetixBridgeToOptimism_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_0_1[12] = address(new_SynthsJPY_contract);
        addressresolver_importAddresses_destinations_0_1[13] = address(new_SynthsAUD_contract);
        addressresolver_importAddresses_destinations_0_1[14] = address(new_SynthsGBP_contract);
        addressresolver_importAddresses_destinations_0_1[15] = address(new_SynthsCHF_contract);
        addressresolver_importAddresses_destinations_0_1[16] = address(new_SynthsKRW_contract);
        addressresolver_importAddresses_destinations_0_1[17] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[18] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[19] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[20] = address(new_SynthsADA_contract);
        addressresolver_importAddresses_destinations_0_1[21] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_0_1[22] = address(new_SynthsDOT_contract);
        addressresolver_importAddresses_destinations_0_1[23] = address(new_SynthsETHBTC_contract);
        addressresolver_importAddresses_destinations_0_1[24] = address(new_SynthsDEFI_contract);
        addressresolver_importAddresses_destinations_0_1[25] = address(new_FuturesMarketManager_contract);
        addressresolver_importAddresses_destinations_0_1[26] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_0_1[27] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() external {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xE95A536cF5C7384FF1ef54819Dc54E03d0FF1979);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_ExchangeCircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_SynthsJPY_contract);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_SynthsAUD_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsGBP_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsCHF_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsKRW_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(new_SynthsADA_contract);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() external {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_SynthsDOT_contract);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_SynthsETHBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_SynthsDEFI_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(new_SynthetixBridgeToOptimism_contract);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x02f9bC46beD33acdB9cb002fe346734CeF8a9480);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x7A3d898b717e50a96fd8b232E9d15F0A547A7eeb);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}

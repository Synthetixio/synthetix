pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../Issuer.sol";
import "../legacy/LegacyTokenState.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../SynthetixState.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

import "./Migration_Alkaid_Supplemental.sol";

// solhint-disable contract-name-camelcase
contract Migration_Alkaid is BaseMigration {
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
    // https://etherscan.io/address/0x11164F6a47C3f8472D19b9aDd516Fc780cb7Ee02
    FeePoolState public constant feepoolstate_i = FeePoolState(0x11164F6a47C3f8472D19b9aDd516Fc780cb7Ee02);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82
    SynthetixState public constant synthetixstate_i = SynthetixState(0x4b9Ca5607f1fF8019c1C6A3c2f0CC8de622D5B82);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x29C295B046a73Cde593f21f63091B072d407e3F2
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);
    // https://etherscan.io/address/0xc398406FFfBEd5B0680e706634490062CB1DB579
    FeePool public constant feepool_i = FeePool(0xc398406FFfBEd5B0680e706634490062CB1DB579);
    // https://etherscan.io/address/0x6d9296Df2ad52F174bF671f555d78628bEBa7752
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x6d9296Df2ad52F174bF671f555d78628bEBa7752);
    // https://etherscan.io/address/0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA);
    // https://etherscan.io/address/0x05a9CBe762B36632b3594DA4F082340E0e5343e8
    TokenState public constant tokenstatesusd_i = TokenState(0x05a9CBe762B36632b3594DA4F082340E0e5343e8);
    // https://etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    Proxy public constant proxysusd_i = Proxy(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://etherscan.io/address/0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0);
    // https://etherscan.io/address/0x6568D9e750fC44AF00f857885Dfb8281c00529c4
    TokenState public constant tokenstateseur_i = TokenState(0x6568D9e750fC44AF00f857885Dfb8281c00529c4);
    // https://etherscan.io/address/0xD71eCFF9342A5Ced620049e616c5035F1dB98620
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xD71eCFF9342A5Ced620049e616c5035F1dB98620);
    // https://etherscan.io/address/0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A
    MultiCollateralSynth public constant synthsjpy_i = MultiCollateralSynth(0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A);
    // https://etherscan.io/address/0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed
    TokenState public constant tokenstatesjpy_i = TokenState(0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed);
    // https://etherscan.io/address/0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d
    ProxyERC20 public constant proxysjpy_i = ProxyERC20(0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d);
    // https://etherscan.io/address/0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827
    MultiCollateralSynth public constant synthsaud_i = MultiCollateralSynth(0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827);
    // https://etherscan.io/address/0xCb29D2cf2C65d3Be1d00F07f3441390432D55203
    TokenState public constant tokenstatesaud_i = TokenState(0xCb29D2cf2C65d3Be1d00F07f3441390432D55203);
    // https://etherscan.io/address/0xF48e200EAF9906362BB1442fca31e0835773b8B4
    ProxyERC20 public constant proxysaud_i = ProxyERC20(0xF48e200EAF9906362BB1442fca31e0835773b8B4);
    // https://etherscan.io/address/0xde3892383965FBa6eC434bE6350F85f140098708
    MultiCollateralSynth public constant synthsgbp_i = MultiCollateralSynth(0xde3892383965FBa6eC434bE6350F85f140098708);
    // https://etherscan.io/address/0x7e88D19A79b291cfE5696d496055f7e57F537A75
    TokenState public constant tokenstatesgbp_i = TokenState(0x7e88D19A79b291cfE5696d496055f7e57F537A75);
    // https://etherscan.io/address/0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F
    ProxyERC20 public constant proxysgbp_i = ProxyERC20(0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F);
    // https://etherscan.io/address/0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D
    MultiCollateralSynth public constant synthschf_i = MultiCollateralSynth(0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D);
    // https://etherscan.io/address/0x52496fE8a4feaEFe14d9433E00D48E6929c13deC
    TokenState public constant tokenstateschf_i = TokenState(0x52496fE8a4feaEFe14d9433E00D48E6929c13deC);
    // https://etherscan.io/address/0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d
    ProxyERC20 public constant proxyschf_i = ProxyERC20(0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d);
    // https://etherscan.io/address/0xe2f532c389deb5E42DCe53e78A9762949A885455
    MultiCollateralSynth public constant synthskrw_i = MultiCollateralSynth(0xe2f532c389deb5E42DCe53e78A9762949A885455);
    // https://etherscan.io/address/0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730
    TokenState public constant tokenstateskrw_i = TokenState(0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730);
    // https://etherscan.io/address/0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B
    ProxyERC20 public constant proxyskrw_i = ProxyERC20(0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B);
    // https://etherscan.io/address/0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353);
    // https://etherscan.io/address/0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67
    TokenState public constant tokenstatesbtc_i = TokenState(0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67);
    // https://etherscan.io/address/0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6);
    // https://etherscan.io/address/0xc70B42930BD8D30A79B55415deC3be60827559f7
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0xc70B42930BD8D30A79B55415deC3be60827559f7);
    // https://etherscan.io/address/0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c
    TokenState public constant tokenstateseth_i = TokenState(0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c);
    // https://etherscan.io/address/0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);
    // https://etherscan.io/address/0x3FFE35c3d412150C3B91d3E22eBA60E16030C608
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x3FFE35c3d412150C3B91d3E22eBA60E16030C608);
    // https://etherscan.io/address/0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0
    TokenState public constant tokenstateslink_i = TokenState(0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0);
    // https://etherscan.io/address/0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6);
    // https://etherscan.io/address/0x8f9fa817200F5B95f9572c8Acf2b31410C00335a
    MultiCollateralSynth public constant synthsada_i = MultiCollateralSynth(0x8f9fa817200F5B95f9572c8Acf2b31410C00335a);
    // https://etherscan.io/address/0x9956c5019a24fbd5B506AD070b771577bAc5c343
    TokenState public constant tokenstatesada_i = TokenState(0x9956c5019a24fbd5B506AD070b771577bAc5c343);
    // https://etherscan.io/address/0xe36E2D3c7c34281FA3bC737950a68571736880A1
    ProxyERC20 public constant proxysada_i = ProxyERC20(0xe36E2D3c7c34281FA3bC737950a68571736880A1);
    // https://etherscan.io/address/0x0705F0716b12a703d4F8832Ec7b97C61771f0361
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x0705F0716b12a703d4F8832Ec7b97C61771f0361);
    // https://etherscan.io/address/0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0
    TokenState public constant tokenstatesaave_i = TokenState(0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0);
    // https://etherscan.io/address/0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076);
    // https://etherscan.io/address/0xfA60918C4417b64E722ca15d79C751c1f24Ab995
    MultiCollateralSynth public constant synthsdot_i = MultiCollateralSynth(0xfA60918C4417b64E722ca15d79C751c1f24Ab995);
    // https://etherscan.io/address/0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077
    TokenState public constant tokenstatesdot_i = TokenState(0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077);
    // https://etherscan.io/address/0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6
    ProxyERC20 public constant proxysdot_i = ProxyERC20(0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6);
    // https://etherscan.io/address/0xe59dFC746D566EB40F92ed0B162004e24E3AC932
    MultiCollateralSynth public constant synthsdefi_i = MultiCollateralSynth(0xe59dFC746D566EB40F92ed0B162004e24E3AC932);
    // https://etherscan.io/address/0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB
    TokenState public constant tokenstatesdefi_i = TokenState(0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB);
    // https://etherscan.io/address/0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B
    ProxyERC20 public constant proxysdefi_i = ProxyERC20(0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B);
    // https://etherscan.io/address/0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915
    Issuer public constant issuer_i = Issuer(0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915);
    // https://etherscan.io/address/0xb6B476C41Ea01930e6abE1f44b96800de0404c98
    SystemSettings public constant systemsettings_i = SystemSettings(0xb6B476C41Ea01930e6abE1f44b96800de0404c98);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xb6B476C41Ea01930e6abE1f44b96800de0404c98
    address public constant new_SystemSettings_contract = 0xb6B476C41Ea01930e6abE1f44b96800de0404c98;
    // https://etherscan.io/address/0x6d9296Df2ad52F174bF671f555d78628bEBa7752
    address public constant new_ExchangeRates_contract = 0x6d9296Df2ad52F174bF671f555d78628bEBa7752;
    // https://etherscan.io/address/0xc398406FFfBEd5B0680e706634490062CB1DB579
    address public constant new_FeePool_contract = 0xc398406FFfBEd5B0680e706634490062CB1DB579;
    // https://etherscan.io/address/0xDC01020857afbaE65224CfCeDb265d1216064c59
    address public constant new_Synthetix_contract = 0xDC01020857afbaE65224CfCeDb265d1216064c59;
    // https://etherscan.io/address/0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E
    address public constant new_DebtCache_contract = 0x9D5551Cd3425Dd4585c3E7Eb7E4B98902222521E;
    // https://etherscan.io/address/0x2A417C61B8062363e4ff50900779463b45d235f6
    address public constant new_Exchanger_contract = 0x2A417C61B8062363e4ff50900779463b45d235f6;
    // https://etherscan.io/address/0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915
    address public constant new_Issuer_contract = 0xC2F1F551bfAd1E9A3b4816513bFd41d77f40F915;
    // https://etherscan.io/address/0x0a6956d554485a43494D69Eca78C5103511a8fEb
    address public constant new_WrapperFactory_contract = 0x0a6956d554485a43494D69Eca78C5103511a8fEb;
    // https://etherscan.io/address/0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA
    address public constant new_SynthsUSD_contract = 0xAFDd6B5A8aB32156dBFb4060ff87F6d9E31191bA;
    // https://etherscan.io/address/0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0
    address public constant new_SynthsEUR_contract = 0xe301da3d2D3e96e57D05b8E557656629cDdbe7A0;
    // https://etherscan.io/address/0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A
    address public constant new_SynthsJPY_contract = 0x4ed5c5D5793f86c8a85E1a96E37b6d374DE0E85A;
    // https://etherscan.io/address/0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827
    address public constant new_SynthsAUD_contract = 0x005d19CA7ff9D79a5Bdf0805Fc01D9D7c53B6827;
    // https://etherscan.io/address/0xde3892383965FBa6eC434bE6350F85f140098708
    address public constant new_SynthsGBP_contract = 0xde3892383965FBa6eC434bE6350F85f140098708;
    // https://etherscan.io/address/0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D
    address public constant new_SynthsCHF_contract = 0x39DDbbb113AF3434048b9d8018a3e99d67C6eE0D;
    // https://etherscan.io/address/0xe2f532c389deb5E42DCe53e78A9762949A885455
    address public constant new_SynthsKRW_contract = 0xe2f532c389deb5E42DCe53e78A9762949A885455;
    // https://etherscan.io/address/0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353
    address public constant new_SynthsBTC_contract = 0x2B3eb5eF0EF06f2E02ef60B3F36Be4793d321353;
    // https://etherscan.io/address/0xc70B42930BD8D30A79B55415deC3be60827559f7
    address public constant new_SynthsETH_contract = 0xc70B42930BD8D30A79B55415deC3be60827559f7;
    // https://etherscan.io/address/0x3FFE35c3d412150C3B91d3E22eBA60E16030C608
    address public constant new_SynthsLINK_contract = 0x3FFE35c3d412150C3B91d3E22eBA60E16030C608;
    // https://etherscan.io/address/0x8f9fa817200F5B95f9572c8Acf2b31410C00335a
    address public constant new_SynthsADA_contract = 0x8f9fa817200F5B95f9572c8Acf2b31410C00335a;
    // https://etherscan.io/address/0x0705F0716b12a703d4F8832Ec7b97C61771f0361
    address public constant new_SynthsAAVE_contract = 0x0705F0716b12a703d4F8832Ec7b97C61771f0361;
    // https://etherscan.io/address/0xfA60918C4417b64E722ca15d79C751c1f24Ab995
    address public constant new_SynthsDOT_contract = 0xfA60918C4417b64E722ca15d79C751c1f24Ab995;
    // https://etherscan.io/address/0xe59dFC746D566EB40F92ed0B162004e24E3AC932
    address public constant new_SynthsDEFI_contract = 0xe59dFC746D566EB40F92ed0B162004e24E3AC932;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](57);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(feepoolstate_i);
        contracts[4] = address(proxysynthetix_i);
        contracts[5] = address(exchangestate_i);
        contracts[6] = address(systemstatus_i);
        contracts[7] = address(tokenstatesynthetix_i);
        contracts[8] = address(synthetixstate_i);
        contracts[9] = address(rewardescrow_i);
        contracts[10] = address(rewardsdistribution_i);
        contracts[11] = address(feepool_i);
        contracts[12] = address(exchangerates_i);
        contracts[13] = address(synthsusd_i);
        contracts[14] = address(tokenstatesusd_i);
        contracts[15] = address(proxysusd_i);
        contracts[16] = address(synthseur_i);
        contracts[17] = address(tokenstateseur_i);
        contracts[18] = address(proxyseur_i);
        contracts[19] = address(synthsjpy_i);
        contracts[20] = address(tokenstatesjpy_i);
        contracts[21] = address(proxysjpy_i);
        contracts[22] = address(synthsaud_i);
        contracts[23] = address(tokenstatesaud_i);
        contracts[24] = address(proxysaud_i);
        contracts[25] = address(synthsgbp_i);
        contracts[26] = address(tokenstatesgbp_i);
        contracts[27] = address(proxysgbp_i);
        contracts[28] = address(synthschf_i);
        contracts[29] = address(tokenstateschf_i);
        contracts[30] = address(proxyschf_i);
        contracts[31] = address(synthskrw_i);
        contracts[32] = address(tokenstateskrw_i);
        contracts[33] = address(proxyskrw_i);
        contracts[34] = address(synthsbtc_i);
        contracts[35] = address(tokenstatesbtc_i);
        contracts[36] = address(proxysbtc_i);
        contracts[37] = address(synthseth_i);
        contracts[38] = address(tokenstateseth_i);
        contracts[39] = address(proxyseth_i);
        contracts[40] = address(synthslink_i);
        contracts[41] = address(tokenstateslink_i);
        contracts[42] = address(proxyslink_i);
        contracts[43] = address(synthsada_i);
        contracts[44] = address(tokenstatesada_i);
        contracts[45] = address(proxysada_i);
        contracts[46] = address(synthsaave_i);
        contracts[47] = address(tokenstatesaave_i);
        contracts[48] = address(proxysaave_i);
        contracts[49] = address(synthsdot_i);
        contracts[50] = address(tokenstatesdot_i);
        contracts[51] = address(proxysdot_i);
        contracts[52] = address(synthsdefi_i);
        contracts[53] = address(tokenstatesdefi_i);
        contracts[54] = address(proxysdefi_i);
        contracts[55] = address(issuer_i);
        contracts[56] = address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        Migration_Alkaid_Supplemental.require_check();

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        Migration_Alkaid_Supplemental.addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        Migration_Alkaid_Supplemental.addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        Migration_Alkaid_Supplemental.addressresolver_rebuildCaches_2();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the FeePool contract can write to its State;
        feepoolstate_i.setFeePool(IFeePool(new_FeePool_contract));
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Exchanger contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_Exchanger_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure that Synthetix can write to its State contract;
        synthetixstate_i.setAssociatedContract(new_Issuer_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Import fee period from existing fee pool at index 0;
        Migration_Alkaid_Supplemental.importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        Migration_Alkaid_Supplemental.importFeePeriod_1();
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the standalone feed for sXTZ (see SCCP-139);
        exchangerates_i.addAggregator("sXTZ", 0x5239a625dEb44bF3EeAc2CD5366ba24b8e9DB63F);
        // Ensure the ExchangeRates contract has the standalone feed for sRUNE (see SCCP-139);
        exchangerates_i.addAggregator("sRUNE", 0x48731cF7e84dc94C5f84577882c14Be11a5B7456);
        // Ensure the ExchangeRates contract has the standalone feed for sYFI (see SCCP-139);
        exchangerates_i.addAggregator("sYFI", 0xA027702dbb89fbd58938e4324ac03B58d812b0E1);
        // Ensure the ExchangeRates contract has the standalone feed for sCRV (see SCCP-139);
        exchangerates_i.addAggregator("sCRV", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the standalone feed for sUNI (see SCCP-139);
        exchangerates_i.addAggregator("sUNI", 0x553303d460EE0afB37EdFf9bE42922D8FF63220e);
        // Ensure the ExchangeRates contract has the standalone feed for sXRP (see SCCP-139);
        exchangerates_i.addAggregator("sXRP", 0xCed2660c6Dd1Ffd856A5A82C67f3482d88C50b12);
        // Ensure the ExchangeRates contract has the standalone feed for sBNB (see SCCP-139);
        exchangerates_i.addAggregator("sBNB", 0x14e613AC84a31f709eadbdF89C6CC390fDc9540A);
        // Ensure the ExchangeRates contract has the standalone feed for sXAU (see SCCP-139);
        exchangerates_i.addAggregator("sXAU", 0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sJPY();
        // Ensure the sJPY synth can write to its TokenState;
        tokenstatesjpy_i.setAssociatedContract(new_SynthsJPY_contract);
        // Ensure the sJPY synth Proxy is correctly connected to the Synth;
        proxysjpy_i.setTarget(Proxyable(new_SynthsJPY_contract));
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sAUD();
        // Ensure the sAUD synth can write to its TokenState;
        tokenstatesaud_i.setAssociatedContract(new_SynthsAUD_contract);
        // Ensure the sAUD synth Proxy is correctly connected to the Synth;
        proxysaud_i.setTarget(Proxyable(new_SynthsAUD_contract));
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sGBP();
        // Ensure the sGBP synth can write to its TokenState;
        tokenstatesgbp_i.setAssociatedContract(new_SynthsGBP_contract);
        // Ensure the sGBP synth Proxy is correctly connected to the Synth;
        proxysgbp_i.setTarget(Proxyable(new_SynthsGBP_contract));
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sCHF();
        // Ensure the sCHF synth can write to its TokenState;
        tokenstateschf_i.setAssociatedContract(new_SynthsCHF_contract);
        // Ensure the sCHF synth Proxy is correctly connected to the Synth;
        proxyschf_i.setTarget(Proxyable(new_SynthsCHF_contract));
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sKRW();
        // Ensure the sKRW synth can write to its TokenState;
        tokenstateskrw_i.setAssociatedContract(new_SynthsKRW_contract);
        // Ensure the sKRW synth Proxy is correctly connected to the Synth;
        proxyskrw_i.setTarget(Proxyable(new_SynthsKRW_contract));
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x01435677FB11763550905594A16B645847C1d0F3);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sADA();
        // Ensure the sADA synth can write to its TokenState;
        tokenstatesada_i.setAssociatedContract(new_SynthsADA_contract);
        // Ensure the sADA synth Proxy is correctly connected to the Synth;
        proxysada_i.setTarget(Proxyable(new_SynthsADA_contract));
        // Ensure the ExchangeRates contract has the feed for sADA;
        exchangerates_i.addAggregator("sADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sDOT();
        // Ensure the sDOT synth can write to its TokenState;
        tokenstatesdot_i.setAssociatedContract(new_SynthsDOT_contract);
        // Ensure the sDOT synth Proxy is correctly connected to the Synth;
        proxysdot_i.setTarget(Proxyable(new_SynthsDOT_contract));
        // Ensure the ExchangeRates contract has the feed for sDOT;
        exchangerates_i.addAggregator("sDOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the new synth has the totalSupply from the previous one;
        Migration_Alkaid_Supplemental.copyTotalSupplyFrom_sDEFI();
        // Ensure the sDEFI synth can write to its TokenState;
        tokenstatesdefi_i.setAssociatedContract(new_SynthsDEFI_contract);
        // Ensure the sDEFI synth Proxy is correctly connected to the Synth;
        proxysdefi_i.setTarget(Proxyable(new_SynthsDEFI_contract));
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0xa8E875F94138B0C5b51d1e1d5dE35bbDdd28EA87);
        // Add synths to the Issuer contract - batch 1;
        Migration_Alkaid_Supplemental.issuer_addSynths_105();
        // SIP-120 Set max atomic volume per block (in USD amounts);
        systemsettings_i.setAtomicMaxVolumePerBlock(200000000000000000000000);
        // SIP-120 Set the TWAP window for atomic swaps;
        systemsettings_i.setAtomicTwapWindow(1800);
        // SIP-120 Set the equivalent token - used in uniswap pools - corresponding to this synth;
        systemsettings_i.setAtomicEquivalentForDexPricing("sUSD", 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        // SIP-120 Set the equivalent token - used in uniswap pools - corresponding to this synth;
        systemsettings_i.setAtomicEquivalentForDexPricing("sETH", 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
        // SIP-120 Set the equivalent token - used in uniswap pools - corresponding to this synth;
        systemsettings_i.setAtomicEquivalentForDexPricing("sBTC", 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
        // SIP-120 Set the exchange fee rate for swapping atomically into this synth;
        systemsettings_i.setAtomicExchangeFeeRate("sETH", 3000000000000000);
        // SIP-120 Set the exchange fee rate for swapping atomically into this synth;
        systemsettings_i.setAtomicExchangeFeeRate("sBTC", 3000000000000000);
        // SIP-120 Set the exchange fee rate for swapping atomically into this synth;
        systemsettings_i.setAtomicExchangeFeeRate("sUSD", 3000000000000000);
        // SIP-120 Set the price buffer applied to the base chainlink rate when comparing atomically;
        systemsettings_i.setAtomicPriceBuffer("sETH", 1500000000000000);
        // SIP-120 Set the price buffer applied to the base chainlink rate when comparing atomically;
        systemsettings_i.setAtomicPriceBuffer("sBTC", 1500000000000000);
        // SIP-120 Set the atomic volatility window for this synth (in seconds);
        systemsettings_i.setAtomicVolatilityConsiderationWindow("sETH", 600);
        // SIP-120 Set the atomic volatility window for this synth (in seconds);
        systemsettings_i.setAtomicVolatilityConsiderationWindow("sBTC", 600);
        // SIP-120 Set the atomic volatility count for this synth during the volatility window;
        systemsettings_i.setAtomicVolatilityUpdateThreshold("sETH", 3);
        // SIP-120 Set the atomic volatility count for this synth during the volatility window;
        systemsettings_i.setAtomicVolatilityUpdateThreshold("sBTC", 3);
        // SIP-120 Set the DEX price aggregator (uniswap TWAP oracle reader);
        exchangerates_i.setDexPriceAggregator(IDexPriceAggregator(0xf120F029Ac143633d1942e48aE2Dfa2036C5786c));
        // Ensure the CollateralShort contract has an interaction delay of zero on the OVM;
        systemsettings_i.setInteractionDelay(0x1F2c3a1046c32729862fcB038369696e3273a516, 3600);
        // Ensure the CollateralShort contract has its service fee set for collapsing loans (SIP-135);
        systemsettings_i.setCollapseFeeRate(0x1F2c3a1046c32729862fcB038369696e3273a516, 0);

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
}

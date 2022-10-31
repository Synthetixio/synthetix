pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../Issuer.sol";
import "../legacy/LegacyTokenState.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Saiph is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x29C295B046a73Cde593f21f63091B072d407e3F2
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);
    // https://etherscan.io/address/0x10A5F7D9D65bCc2734763444D4940a31b109275f
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
    // https://etherscan.io/address/0x05a9CBe762B36632b3594DA4F082340E0e5343e8
    TokenState public constant tokenstatesusd_i = TokenState(0x05a9CBe762B36632b3594DA4F082340E0e5343e8);
    // https://etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    Proxy public constant proxysusd_i = Proxy(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://etherscan.io/address/0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
    // https://etherscan.io/address/0x6568D9e750fC44AF00f857885Dfb8281c00529c4
    TokenState public constant tokenstateseur_i = TokenState(0x6568D9e750fC44AF00f857885Dfb8281c00529c4);
    // https://etherscan.io/address/0xD71eCFF9342A5Ced620049e616c5035F1dB98620
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xD71eCFF9342A5Ced620049e616c5035F1dB98620);
    // https://etherscan.io/address/0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C
    MultiCollateralSynth public constant synthsjpy_i = MultiCollateralSynth(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
    // https://etherscan.io/address/0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed
    TokenState public constant tokenstatesjpy_i = TokenState(0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed);
    // https://etherscan.io/address/0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d
    ProxyERC20 public constant proxysjpy_i = ProxyERC20(0xF6b1C627e95BFc3c1b4c9B825a032Ff0fBf3e07d);
    // https://etherscan.io/address/0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69
    MultiCollateralSynth public constant synthsaud_i = MultiCollateralSynth(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
    // https://etherscan.io/address/0xCb29D2cf2C65d3Be1d00F07f3441390432D55203
    TokenState public constant tokenstatesaud_i = TokenState(0xCb29D2cf2C65d3Be1d00F07f3441390432D55203);
    // https://etherscan.io/address/0xF48e200EAF9906362BB1442fca31e0835773b8B4
    ProxyERC20 public constant proxysaud_i = ProxyERC20(0xF48e200EAF9906362BB1442fca31e0835773b8B4);
    // https://etherscan.io/address/0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD
    MultiCollateralSynth public constant synthsgbp_i = MultiCollateralSynth(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
    // https://etherscan.io/address/0x7e88D19A79b291cfE5696d496055f7e57F537A75
    TokenState public constant tokenstatesgbp_i = TokenState(0x7e88D19A79b291cfE5696d496055f7e57F537A75);
    // https://etherscan.io/address/0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F
    ProxyERC20 public constant proxysgbp_i = ProxyERC20(0x97fe22E7341a0Cd8Db6F6C021A24Dc8f4DAD855F);
    // https://etherscan.io/address/0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88
    MultiCollateralSynth public constant synthschf_i = MultiCollateralSynth(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
    // https://etherscan.io/address/0x52496fE8a4feaEFe14d9433E00D48E6929c13deC
    TokenState public constant tokenstateschf_i = TokenState(0x52496fE8a4feaEFe14d9433E00D48E6929c13deC);
    // https://etherscan.io/address/0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d
    ProxyERC20 public constant proxyschf_i = ProxyERC20(0x0F83287FF768D1c1e17a42F44d644D7F22e8ee1d);
    // https://etherscan.io/address/0xdAe6C79c46aB3B280Ca28259000695529cbD1339
    MultiCollateralSynth public constant synthskrw_i = MultiCollateralSynth(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
    // https://etherscan.io/address/0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730
    TokenState public constant tokenstateskrw_i = TokenState(0x93B6e9FbBd2c32a0DC3C2B943B7C3CBC2fE23730);
    // https://etherscan.io/address/0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B
    ProxyERC20 public constant proxyskrw_i = ProxyERC20(0x269895a3dF4D73b077Fc823dD6dA1B95f72Aaf9B);
    // https://etherscan.io/address/0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
    // https://etherscan.io/address/0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67
    TokenState public constant tokenstatesbtc_i = TokenState(0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67);
    // https://etherscan.io/address/0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6);
    // https://etherscan.io/address/0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
    // https://etherscan.io/address/0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c
    TokenState public constant tokenstateseth_i = TokenState(0x34A5ef81d18F3a305aE9C2d7DF42beef4c79031c);
    // https://etherscan.io/address/0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);
    // https://etherscan.io/address/0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
    // https://etherscan.io/address/0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0
    TokenState public constant tokenstateslink_i = TokenState(0x577D4a7395c6A5f46d9981a5F83fa7294926aBB0);
    // https://etherscan.io/address/0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6);
    // https://etherscan.io/address/0x91b82d62Ff322b8e02b86f33E9A99a813437830d
    MultiCollateralSynth public constant synthsada_i = MultiCollateralSynth(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
    // https://etherscan.io/address/0x9956c5019a24fbd5B506AD070b771577bAc5c343
    TokenState public constant tokenstatesada_i = TokenState(0x9956c5019a24fbd5B506AD070b771577bAc5c343);
    // https://etherscan.io/address/0xe36E2D3c7c34281FA3bC737950a68571736880A1
    ProxyERC20 public constant proxysada_i = ProxyERC20(0xe36E2D3c7c34281FA3bC737950a68571736880A1);
    // https://etherscan.io/address/0x942Eb6e8c029EB22103743C99985aF4F4515a559
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
    // https://etherscan.io/address/0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0
    TokenState public constant tokenstatesaave_i = TokenState(0x9BcED8A8E3Ad81c9b146FFC880358f734A06f7c0);
    // https://etherscan.io/address/0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0xd2dF355C19471c8bd7D8A3aa27Ff4e26A21b4076);
    // https://etherscan.io/address/0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB
    MultiCollateralSynth public constant synthsdot_i = MultiCollateralSynth(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
    // https://etherscan.io/address/0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077
    TokenState public constant tokenstatesdot_i = TokenState(0x73B1a2643507Cd30F11Dfcf2D974f4373E5BC077);
    // https://etherscan.io/address/0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6
    ProxyERC20 public constant proxysdot_i = ProxyERC20(0x1715AC0743102BF5Cd58EfBB6Cf2dC2685d967b6);
    // https://etherscan.io/address/0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD
    MultiCollateralSynth public constant synthsethbtc_i = MultiCollateralSynth(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
    // https://etherscan.io/address/0x042A7A0022A7695454ac5Be77a4860e50c9683fC
    TokenState public constant tokenstatesethbtc_i = TokenState(0x042A7A0022A7695454ac5Be77a4860e50c9683fC);
    // https://etherscan.io/address/0x104eDF1da359506548BFc7c25bA1E28C16a70235
    ProxyERC20 public constant proxysethbtc_i = ProxyERC20(0x104eDF1da359506548BFc7c25bA1E28C16a70235);
    // https://etherscan.io/address/0x918b1dbf0917FdD74D03fB9434915E2ECEc89286
    MultiCollateralSynth public constant synthsdefi_i = MultiCollateralSynth(0x918b1dbf0917FdD74D03fB9434915E2ECEc89286);
    // https://etherscan.io/address/0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB
    TokenState public constant tokenstatesdefi_i = TokenState(0x7Ac2D37098a65B0f711CFfA3be635F1E6aCacFaB);
    // https://etherscan.io/address/0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B
    ProxyERC20 public constant proxysdefi_i = ProxyERC20(0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B);
    // https://etherscan.io/address/0xE5CC99EFA57943F4EA0cE6bed265318697748649
    Issuer public constant issuer_i = Issuer(0xE5CC99EFA57943F4EA0cE6bed265318697748649);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0x08F30Ecf2C15A783083ab9D5b9211c22388d0564
    address public constant new_Synthetix_contract = 0x08F30Ecf2C15A783083ab9D5b9211c22388d0564;
    // https://etherscan.io/address/0xE5CC99EFA57943F4EA0cE6bed265318697748649
    address public constant new_Issuer_contract = 0xE5CC99EFA57943F4EA0cE6bed265318697748649;
    // https://etherscan.io/address/0x10A5F7D9D65bCc2734763444D4940a31b109275f
    address public constant new_SynthsUSD_contract = 0x10A5F7D9D65bCc2734763444D4940a31b109275f;
    // https://etherscan.io/address/0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C
    address public constant new_SynthsJPY_contract = 0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C;
    // https://etherscan.io/address/0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9
    address public constant new_SynthsEUR_contract = 0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9;
    // https://etherscan.io/address/0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69
    address public constant new_SynthsAUD_contract = 0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69;
    // https://etherscan.io/address/0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD
    address public constant new_SynthsGBP_contract = 0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD;
    // https://etherscan.io/address/0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88
    address public constant new_SynthsCHF_contract = 0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88;
    // https://etherscan.io/address/0xdAe6C79c46aB3B280Ca28259000695529cbD1339
    address public constant new_SynthsKRW_contract = 0xdAe6C79c46aB3B280Ca28259000695529cbD1339;
    // https://etherscan.io/address/0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4
    address public constant new_SynthsETH_contract = 0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4;
    // https://etherscan.io/address/0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7
    address public constant new_SynthsBTC_contract = 0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7;
    // https://etherscan.io/address/0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2
    address public constant new_SynthsLINK_contract = 0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2;
    // https://etherscan.io/address/0x942Eb6e8c029EB22103743C99985aF4F4515a559
    address public constant new_SynthsAAVE_contract = 0x942Eb6e8c029EB22103743C99985aF4F4515a559;
    // https://etherscan.io/address/0x91b82d62Ff322b8e02b86f33E9A99a813437830d
    address public constant new_SynthsADA_contract = 0x91b82d62Ff322b8e02b86f33E9A99a813437830d;
    // https://etherscan.io/address/0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB
    address public constant new_SynthsDOT_contract = 0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB;
    // https://etherscan.io/address/0x918b1dbf0917FdD74D03fB9434915E2ECEc89286
    address public constant new_SynthsDEFI_contract = 0x918b1dbf0917FdD74D03fB9434915E2ECEc89286;
    // https://etherscan.io/address/0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD
    address public constant new_SynthsETHBTC_contract = 0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](52);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardescrow_i);
        contracts[5] = address(rewardsdistribution_i);
        contracts[6] = address(synthsusd_i);
        contracts[7] = address(tokenstatesusd_i);
        contracts[8] = address(proxysusd_i);
        contracts[9] = address(synthseur_i);
        contracts[10] = address(tokenstateseur_i);
        contracts[11] = address(proxyseur_i);
        contracts[12] = address(synthsjpy_i);
        contracts[13] = address(tokenstatesjpy_i);
        contracts[14] = address(proxysjpy_i);
        contracts[15] = address(synthsaud_i);
        contracts[16] = address(tokenstatesaud_i);
        contracts[17] = address(proxysaud_i);
        contracts[18] = address(synthsgbp_i);
        contracts[19] = address(tokenstatesgbp_i);
        contracts[20] = address(proxysgbp_i);
        contracts[21] = address(synthschf_i);
        contracts[22] = address(tokenstateschf_i);
        contracts[23] = address(proxyschf_i);
        contracts[24] = address(synthskrw_i);
        contracts[25] = address(tokenstateskrw_i);
        contracts[26] = address(proxyskrw_i);
        contracts[27] = address(synthsbtc_i);
        contracts[28] = address(tokenstatesbtc_i);
        contracts[29] = address(proxysbtc_i);
        contracts[30] = address(synthseth_i);
        contracts[31] = address(tokenstateseth_i);
        contracts[32] = address(proxyseth_i);
        contracts[33] = address(synthslink_i);
        contracts[34] = address(tokenstateslink_i);
        contracts[35] = address(proxyslink_i);
        contracts[36] = address(synthsada_i);
        contracts[37] = address(tokenstatesada_i);
        contracts[38] = address(proxysada_i);
        contracts[39] = address(synthsaave_i);
        contracts[40] = address(tokenstatesaave_i);
        contracts[41] = address(proxysaave_i);
        contracts[42] = address(synthsdot_i);
        contracts[43] = address(tokenstatesdot_i);
        contracts[44] = address(proxysdot_i);
        contracts[45] = address(synthsethbtc_i);
        contracts[46] = address(tokenstatesethbtc_i);
        contracts[47] = address(proxysethbtc_i);
        contracts[48] = address(synthsdefi_i);
        contracts[49] = address(tokenstatesdefi_i);
        contracts[50] = address(proxysdefi_i);
        contracts[51] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
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
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sJPY();
        // Ensure the sJPY synth can write to its TokenState;
        tokenstatesjpy_i.setAssociatedContract(new_SynthsJPY_contract);
        // Ensure the sJPY synth Proxy is correctly connected to the Synth;
        proxysjpy_i.setTarget(Proxyable(new_SynthsJPY_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAUD();
        // Ensure the sAUD synth can write to its TokenState;
        tokenstatesaud_i.setAssociatedContract(new_SynthsAUD_contract);
        // Ensure the sAUD synth Proxy is correctly connected to the Synth;
        proxysaud_i.setTarget(Proxyable(new_SynthsAUD_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sGBP();
        // Ensure the sGBP synth can write to its TokenState;
        tokenstatesgbp_i.setAssociatedContract(new_SynthsGBP_contract);
        // Ensure the sGBP synth Proxy is correctly connected to the Synth;
        proxysgbp_i.setTarget(Proxyable(new_SynthsGBP_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sCHF();
        // Ensure the sCHF synth can write to its TokenState;
        tokenstateschf_i.setAssociatedContract(new_SynthsCHF_contract);
        // Ensure the sCHF synth Proxy is correctly connected to the Synth;
        proxyschf_i.setTarget(Proxyable(new_SynthsCHF_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sKRW();
        // Ensure the sKRW synth can write to its TokenState;
        tokenstateskrw_i.setAssociatedContract(new_SynthsKRW_contract);
        // Ensure the sKRW synth Proxy is correctly connected to the Synth;
        proxyskrw_i.setTarget(Proxyable(new_SynthsKRW_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sADA();
        // Ensure the sADA synth can write to its TokenState;
        tokenstatesada_i.setAssociatedContract(new_SynthsADA_contract);
        // Ensure the sADA synth Proxy is correctly connected to the Synth;
        proxysada_i.setTarget(Proxyable(new_SynthsADA_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sDOT();
        // Ensure the sDOT synth can write to its TokenState;
        tokenstatesdot_i.setAssociatedContract(new_SynthsDOT_contract);
        // Ensure the sDOT synth Proxy is correctly connected to the Synth;
        proxysdot_i.setTarget(Proxyable(new_SynthsDOT_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETHBTC();
        // Ensure the sETHBTC synth can write to its TokenState;
        tokenstatesethbtc_i.setAssociatedContract(new_SynthsETHBTC_contract);
        // Ensure the sETHBTC synth Proxy is correctly connected to the Synth;
        proxysethbtc_i.setTarget(Proxyable(new_SynthsETHBTC_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sDEFI();
        // Ensure the sDEFI synth can write to its TokenState;
        tokenstatesdefi_i.setAssociatedContract(new_SynthsDEFI_contract);
        // Ensure the sDEFI synth Proxy is correctly connected to the Synth;
        proxysdefi_i.setTarget(Proxyable(new_SynthsDEFI_contract));
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_70();

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

    function addressresolver_importAddresses_0() internal {
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](17);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SynthsJPY");
        addressresolver_importAddresses_names_0_0[4] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthsAUD");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsGBP");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsCHF");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthsKRW");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[11] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[12] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_0_0[13] = bytes32("SynthsADA");
        addressresolver_importAddresses_names_0_0[14] = bytes32("SynthsDOT");
        addressresolver_importAddresses_names_0_0[15] = bytes32("SynthsDEFI");
        addressresolver_importAddresses_names_0_0[16] = bytes32("SynthsETHBTC");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](17);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SynthsJPY_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthsAUD_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsGBP_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsCHF_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthsKRW_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[12] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_0_1[13] = address(new_SynthsADA_contract);
        addressresolver_importAddresses_destinations_0_1[14] = address(new_SynthsDOT_contract);
        addressresolver_importAddresses_destinations_0_1[15] = address(new_SynthsDEFI_contract);
        addressresolver_importAddresses_destinations_0_1[16] = address(new_SynthsETHBTC_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x0e5fe1b05612581576e9A3dB048416d0B1E3C425);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xf79603a71144e415730C1A6f57F366E4Ea962C00);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xD64D83829D92B5bdA881f6f61A4e4E27Fc185387);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsJPY_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_SynthsAUD_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_SynthsGBP_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(new_SynthsCHF_contract);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(new_SynthsKRW_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_SynthsADA_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_SynthsDOT_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_SynthsETHBTC_contract);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(new_SynthsDEFI_contract);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x02f9bC46beD33acdB9cb002fe346734CeF8a9480);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x7A3d898b717e50a96fd8b232E9d15F0A547A7eeb);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://etherscan.io/address/0x7df9b3f8f1C011D8BD707430e97E747479DD532a;
        Synth existingSynth = Synth(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        // https://etherscan.io/address/0x10A5F7D9D65bCc2734763444D4940a31b109275f;
        Synth newSynth = Synth(0x10A5F7D9D65bCc2734763444D4940a31b109275f);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://etherscan.io/address/0x1b06a00Df0B27E7871E753720D4917a7D1aac68b;
        Synth existingSynth = Synth(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        // https://etherscan.io/address/0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9;
        Synth newSynth = Synth(0xa8E31E3C38aDD6052A9407298FAEB8fD393A6cF9);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sJPY() internal {
        // https://etherscan.io/address/0xB82f11f3168Ece7D56fe6a5679567948090de7C5;
        Synth existingSynth = Synth(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        // https://etherscan.io/address/0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C;
        Synth newSynth = Synth(0xE1cc2332852B2Ac0dA59A1f9D3051829f4eF3c1C);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAUD() internal {
        // https://etherscan.io/address/0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C;
        Synth existingSynth = Synth(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        // https://etherscan.io/address/0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69;
        Synth newSynth = Synth(0xfb020CA7f4e8C4a5bBBe060f59a249c6275d2b69);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sGBP() internal {
        // https://etherscan.io/address/0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf;
        Synth existingSynth = Synth(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        // https://etherscan.io/address/0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD;
        Synth newSynth = Synth(0xdc883b9d9Ee16f74bE08826E68dF4C9D9d26e8bD);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sCHF() internal {
        // https://etherscan.io/address/0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d;
        Synth existingSynth = Synth(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        // https://etherscan.io/address/0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88;
        Synth newSynth = Synth(0xBb5b03E920cF702De5A3bA9Fc1445aF4B3919c88);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sKRW() internal {
        // https://etherscan.io/address/0x527637bE27640d6C3e751d24DC67129A6d13E11C;
        Synth existingSynth = Synth(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        // https://etherscan.io/address/0xdAe6C79c46aB3B280Ca28259000695529cbD1339;
        Synth newSynth = Synth(0xdAe6C79c46aB3B280Ca28259000695529cbD1339);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://etherscan.io/address/0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6;
        Synth existingSynth = Synth(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        // https://etherscan.io/address/0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7;
        Synth newSynth = Synth(0x1cB004a8e84a5CE95C1fF895EE603BaC8EC506c7);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://etherscan.io/address/0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6;
        Synth existingSynth = Synth(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        // https://etherscan.io/address/0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4;
        Synth newSynth = Synth(0x5D4C724BFe3a228Ff0E29125Ac1571FE093700a4);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://etherscan.io/address/0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6;
        Synth existingSynth = Synth(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        // https://etherscan.io/address/0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2;
        Synth newSynth = Synth(0xDF69bC4541b86Aa4c5A470B4347E730c38b2c3B2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sADA() internal {
        // https://etherscan.io/address/0xB34F4d7c207D8979D05EDb0F63f174764Bd67825;
        Synth existingSynth = Synth(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        // https://etherscan.io/address/0x91b82d62Ff322b8e02b86f33E9A99a813437830d;
        Synth newSynth = Synth(0x91b82d62Ff322b8e02b86f33E9A99a813437830d);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://etherscan.io/address/0x95aE43E5E96314E4afffcf19D9419111cd11169e;
        Synth existingSynth = Synth(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        // https://etherscan.io/address/0x942Eb6e8c029EB22103743C99985aF4F4515a559;
        Synth newSynth = Synth(0x942Eb6e8c029EB22103743C99985aF4F4515a559);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sDOT() internal {
        // https://etherscan.io/address/0x27b45A4208b87A899009f45888139882477Acea5;
        Synth existingSynth = Synth(0x27b45A4208b87A899009f45888139882477Acea5);
        // https://etherscan.io/address/0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB;
        Synth newSynth = Synth(0x75A0c1597137AA36B40b6a515D997F9a6c6eefEB);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETHBTC() internal {
        // https://etherscan.io/address/0x6DF798ec713b33BE823b917F27820f2aA0cf7662;
        Synth existingSynth = Synth(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        // https://etherscan.io/address/0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD;
        Synth newSynth = Synth(0x07C1E81C345A7c58d7c24072EFc5D929BD0647AD);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sDEFI() internal {
        // https://etherscan.io/address/0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124;
        Synth existingSynth = Synth(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        // https://etherscan.io/address/0x918b1dbf0917FdD74D03fB9434915E2ECEc89286;
        Synth newSynth = Synth(0x918b1dbf0917FdD74D03fB9434915E2ECEc89286);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_70() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_70_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_70_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_70_0[1] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_70_0[2] = ISynth(new_SynthsJPY_contract);
        issuer_addSynths_synthsToAdd_70_0[3] = ISynth(new_SynthsAUD_contract);
        issuer_addSynths_synthsToAdd_70_0[4] = ISynth(new_SynthsGBP_contract);
        issuer_addSynths_synthsToAdd_70_0[5] = ISynth(new_SynthsCHF_contract);
        issuer_addSynths_synthsToAdd_70_0[6] = ISynth(new_SynthsKRW_contract);
        issuer_addSynths_synthsToAdd_70_0[7] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_70_0[8] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_70_0[9] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_70_0[10] = ISynth(new_SynthsADA_contract);
        issuer_addSynths_synthsToAdd_70_0[11] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_70_0[12] = ISynth(new_SynthsDOT_contract);
        issuer_addSynths_synthsToAdd_70_0[13] = ISynth(new_SynthsETHBTC_contract);
        issuer_addSynths_synthsToAdd_70_0[14] = ISynth(new_SynthsDEFI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_70_0);
    }
}

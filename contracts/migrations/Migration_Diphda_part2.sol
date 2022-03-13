pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../FeePool.sol";
import "../DebtCache.sol";
import "../MultiCollateralSynth.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Diphda_part2 is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0x24398a935e9649EA212b7a05DCdcB7dadF640579
    SystemStatus public constant systemstatus_i = SystemStatus(0x24398a935e9649EA212b7a05DCdcB7dadF640579);
    // https://kovan.etherscan.io/address/0xE83C187915BE184950014db5413D93cd1A6900f7
    FeePool public constant feepool_i = FeePool(0xE83C187915BE184950014db5413D93cd1A6900f7);
    // https://kovan.etherscan.io/address/0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55
    DebtCache public constant debtcache_i = DebtCache(0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55);
    // https://kovan.etherscan.io/address/0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a);
    // https://kovan.etherscan.io/address/0x90860C61E51081E6FC294Eaa95232CAD91Df6414
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0x90860C61E51081E6FC294Eaa95232CAD91Df6414);
    // https://kovan.etherscan.io/address/0x4f719F0346636B9Dc23B092F637de2A66A254420
    TokenState public constant tokenstateseur_i = TokenState(0x4f719F0346636B9Dc23B092F637de2A66A254420);
    // https://kovan.etherscan.io/address/0x57E8Bd85F3d8De4557739bc3C5ee0f4bfC931528
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0x57E8Bd85F3d8De4557739bc3C5ee0f4bfC931528);
    // https://kovan.etherscan.io/address/0xb093d0dAe697A94eA2565C638B792005EF22b450
    MultiCollateralSynth public constant synthsjpy_i = MultiCollateralSynth(0xb093d0dAe697A94eA2565C638B792005EF22b450);
    // https://kovan.etherscan.io/address/0x310705B7FecA92C2445D7471706e058653D9f989
    TokenState public constant tokenstatesjpy_i = TokenState(0x310705B7FecA92C2445D7471706e058653D9f989);
    // https://kovan.etherscan.io/address/0xCcC5c7625c90FC93D2508723e60281E6DE535166
    ProxyERC20 public constant proxysjpy_i = ProxyERC20(0xCcC5c7625c90FC93D2508723e60281E6DE535166);
    // https://kovan.etherscan.io/address/0xa56d0366B6915B72965ECb283Cae449ffb28f4aC
    MultiCollateralSynth public constant synthsaud_i = MultiCollateralSynth(0xa56d0366B6915B72965ECb283Cae449ffb28f4aC);
    // https://kovan.etherscan.io/address/0xDDEfe42790f2dEC7b0C37D4399884eFceA5361b1
    TokenState public constant tokenstatesaud_i = TokenState(0xDDEfe42790f2dEC7b0C37D4399884eFceA5361b1);
    // https://kovan.etherscan.io/address/0x4e5D412141145767F7db90c22bd0240a85da0B73
    ProxyERC20 public constant proxysaud_i = ProxyERC20(0x4e5D412141145767F7db90c22bd0240a85da0B73);
    // https://kovan.etherscan.io/address/0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a
    MultiCollateralSynth public constant synthsgbp_i = MultiCollateralSynth(0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a);
    // https://kovan.etherscan.io/address/0x3DdF5dAd59F8F8e8f957709B044eE84e87B42e25
    TokenState public constant tokenstatesgbp_i = TokenState(0x3DdF5dAd59F8F8e8f957709B044eE84e87B42e25);
    // https://kovan.etherscan.io/address/0x41d49b1ac182C9d2c8dDf8b450342DE2Ac03aC19
    ProxyERC20 public constant proxysgbp_i = ProxyERC20(0x41d49b1ac182C9d2c8dDf8b450342DE2Ac03aC19);
    // https://kovan.etherscan.io/address/0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2
    MultiCollateralSynth public constant synthskrw_i = MultiCollateralSynth(0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2);
    // https://kovan.etherscan.io/address/0x780476375FEE186824Bdabc9bDA71433017Fd591
    TokenState public constant tokenstateskrw_i = TokenState(0x780476375FEE186824Bdabc9bDA71433017Fd591);
    // https://kovan.etherscan.io/address/0xb02C0F5D8fDAD1242dceca095328dc8213A8349C
    ProxyERC20 public constant proxyskrw_i = ProxyERC20(0xb02C0F5D8fDAD1242dceca095328dc8213A8349C);
    // https://kovan.etherscan.io/address/0xc099c530Dfdc834CA75BD228C72dE6B683A961af
    MultiCollateralSynth public constant synthschf_i = MultiCollateralSynth(0xc099c530Dfdc834CA75BD228C72dE6B683A961af);
    // https://kovan.etherscan.io/address/0xEf58E3aC7F34649B640fb04188642B5e062Fa3Be
    TokenState public constant tokenstateschf_i = TokenState(0xEf58E3aC7F34649B640fb04188642B5e062Fa3Be);
    // https://kovan.etherscan.io/address/0x8E23100f9C9bd442f5bAc6A927f49B284E390Df4
    ProxyERC20 public constant proxyschf_i = ProxyERC20(0x8E23100f9C9bd442f5bAc6A927f49B284E390Df4);
    // https://kovan.etherscan.io/address/0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD);
    // https://kovan.etherscan.io/address/0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2
    TokenState public constant tokenstatesbtc_i = TokenState(0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2);
    // https://kovan.etherscan.io/address/0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf);
    // https://kovan.etherscan.io/address/0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621);
    // https://kovan.etherscan.io/address/0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0
    TokenState public constant tokenstateseth_i = TokenState(0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0);
    // https://kovan.etherscan.io/address/0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb);
    // https://kovan.etherscan.io/address/0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85);
    // https://kovan.etherscan.io/address/0x89656EF0A87fD947A181189209F6525E91D91f46
    TokenState public constant tokenstateslink_i = TokenState(0x89656EF0A87fD947A181189209F6525E91D91f46);
    // https://kovan.etherscan.io/address/0x3a4A90a2D8cBA26F2e32C4a6e6d01ffBfCE8DBB4
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0x3a4A90a2D8cBA26F2e32C4a6e6d01ffBfCE8DBB4);
    // https://kovan.etherscan.io/address/0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913
    MultiCollateralSynth public constant synthsdefi_i = MultiCollateralSynth(0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913);
    // https://kovan.etherscan.io/address/0xa8eE3730031f28a4a4a3Ed28A3308d83cabd9Ce1
    TokenState public constant tokenstatesdefi_i = TokenState(0xa8eE3730031f28a4a4a3Ed28A3308d83cabd9Ce1);
    // https://kovan.etherscan.io/address/0xf91b2d345838922b26c8899483be3f867eeaFAb5
    ProxyERC20 public constant proxysdefi_i = ProxyERC20(0xf91b2d345838922b26c8899483be3f867eeaFAb5);
    // https://kovan.etherscan.io/address/0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8
    Issuer public constant issuer_i = Issuer(0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan.etherscan.io/address/0x90860C61E51081E6FC294Eaa95232CAD91Df6414
    address public constant new_SynthsEUR_contract = 0x90860C61E51081E6FC294Eaa95232CAD91Df6414;
    // https://kovan.etherscan.io/address/0xb093d0dAe697A94eA2565C638B792005EF22b450
    address public constant new_SynthsJPY_contract = 0xb093d0dAe697A94eA2565C638B792005EF22b450;
    // https://kovan.etherscan.io/address/0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a
    address public constant new_SynthsGBP_contract = 0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a;
    // https://kovan.etherscan.io/address/0xa56d0366B6915B72965ECb283Cae449ffb28f4aC
    address public constant new_SynthsAUD_contract = 0xa56d0366B6915B72965ECb283Cae449ffb28f4aC;
    // https://kovan.etherscan.io/address/0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2
    address public constant new_SynthsKRW_contract = 0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2;
    // https://kovan.etherscan.io/address/0xc099c530Dfdc834CA75BD228C72dE6B683A961af
    address public constant new_SynthsCHF_contract = 0xc099c530Dfdc834CA75BD228C72dE6B683A961af;
    // https://kovan.etherscan.io/address/0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD
    address public constant new_SynthsBTC_contract = 0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD;
    // https://kovan.etherscan.io/address/0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621
    address public constant new_SynthsETH_contract = 0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621;
    // https://kovan.etherscan.io/address/0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85
    address public constant new_SynthsLINK_contract = 0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85;
    // https://kovan.etherscan.io/address/0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913
    address public constant new_SynthsDEFI_contract = 0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](36);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(feepool_i);
        contracts[3] = address(debtcache_i);
        contracts[4] = address(synthsusd_i);
        contracts[5] = address(synthseur_i);
        contracts[6] = address(tokenstateseur_i);
        contracts[7] = address(proxyseur_i);
        contracts[8] = address(synthsjpy_i);
        contracts[9] = address(tokenstatesjpy_i);
        contracts[10] = address(proxysjpy_i);
        contracts[11] = address(synthsaud_i);
        contracts[12] = address(tokenstatesaud_i);
        contracts[13] = address(proxysaud_i);
        contracts[14] = address(synthsgbp_i);
        contracts[15] = address(tokenstatesgbp_i);
        contracts[16] = address(proxysgbp_i);
        contracts[17] = address(synthskrw_i);
        contracts[18] = address(tokenstateskrw_i);
        contracts[19] = address(proxyskrw_i);
        contracts[20] = address(synthschf_i);
        contracts[21] = address(tokenstateschf_i);
        contracts[22] = address(proxyschf_i);
        contracts[23] = address(synthsbtc_i);
        contracts[24] = address(tokenstatesbtc_i);
        contracts[25] = address(proxysbtc_i);
        contracts[26] = address(synthseth_i);
        contracts[27] = address(tokenstateseth_i);
        contracts[28] = address(proxyseth_i);
        contracts[29] = address(synthslink_i);
        contracts[30] = address(tokenstateslink_i);
        contracts[31] = address(proxyslink_i);
        contracts[32] = address(synthsdefi_i);
        contracts[33] = address(tokenstatesdefi_i);
        contracts[34] = address(proxysdefi_i);
        contracts[35] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_SynthsEUR_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsEUR"
        );
        require(
            ISynthetixNamedContract(new_SynthsJPY_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsJPY"
        );
        require(
            ISynthetixNamedContract(new_SynthsGBP_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsGBP"
        );
        require(
            ISynthetixNamedContract(new_SynthsAUD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAUD"
        );
        require(
            ISynthetixNamedContract(new_SynthsKRW_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsKRW"
        );
        require(
            ISynthetixNamedContract(new_SynthsCHF_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsCHF"
        );
        require(
            ISynthetixNamedContract(new_SynthsBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsBTC"
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
            ISynthetixNamedContract(new_SynthsDEFI_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsDEFI"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", 0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8, true, false);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Import excluded-debt records from existing DebtCache;
        // debtcache_i.importExcludedIssuedDebts(IDebtCache(0x0b6f83DB2dE6cDc3cB57DC0ED79D07267F6fdc2A), IIssuer(0xD0B60E2FAb47e703ffa0da7364Efb9536C430912));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
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
        copyTotalSupplyFrom_sKRW();
        // Ensure the sKRW synth can write to its TokenState;
        tokenstateskrw_i.setAssociatedContract(new_SynthsKRW_contract);
        // Ensure the sKRW synth Proxy is correctly connected to the Synth;
        proxyskrw_i.setTarget(Proxyable(new_SynthsKRW_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sCHF();
        // Ensure the sCHF synth can write to its TokenState;
        tokenstateschf_i.setAssociatedContract(new_SynthsCHF_contract);
        // Ensure the sCHF synth Proxy is correctly connected to the Synth;
        proxyschf_i.setTarget(Proxyable(new_SynthsCHF_contract));
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
        copyTotalSupplyFrom_sDEFI();
        // Ensure the sDEFI synth can write to its TokenState;
        tokenstatesdefi_i.setAssociatedContract(new_SynthsDEFI_contract);
        // Ensure the sDEFI synth Proxy is correctly connected to the Synth;
        proxysdefi_i.setTarget(Proxyable(new_SynthsDEFI_contract));
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_47();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](10);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SynthsJPY");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsGBP");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SynthsAUD");
        addressresolver_importAddresses_names_0_0[4] = bytes32("SynthsKRW");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthsCHF");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthsDEFI");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](10);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SynthsJPY_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsGBP_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SynthsAUD_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_SynthsKRW_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthsCHF_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthsDEFI_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](16);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_SynthsJPY_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_SynthsGBP_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_SynthsAUD_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_SynthsKRW_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_SynthsCHF_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x5814d3c40a5A951EFdb4A37Bd93f4407450Cd424);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsDEFI_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function importFeePeriod_0() internal {
        // https://kovan.etherscan.io/address/0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E;
        FeePool existingFeePool = FeePool(0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E);
        // https://kovan.etherscan.io/address/0xE83C187915BE184950014db5413D93cd1A6900f7;
        FeePool newFeePool = FeePool(0xE83C187915BE184950014db5413D93cd1A6900f7);
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
        // https://kovan.etherscan.io/address/0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E;
        FeePool existingFeePool = FeePool(0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E);
        // https://kovan.etherscan.io/address/0xE83C187915BE184950014db5413D93cd1A6900f7;
        FeePool newFeePool = FeePool(0xE83C187915BE184950014db5413D93cd1A6900f7);
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
        // https://kovan.etherscan.io/address/0xB98c6031344EB6007e94A8eDbc0ee28C13c66290;
        Synth existingSynth = Synth(0xB98c6031344EB6007e94A8eDbc0ee28C13c66290);
        // https://kovan.etherscan.io/address/0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a;
        Synth newSynth = Synth(0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://kovan.etherscan.io/address/0x26b814c9fA4C0512D84373f80d4B92408CD13960;
        Synth existingSynth = Synth(0x26b814c9fA4C0512D84373f80d4B92408CD13960);
        // https://kovan.etherscan.io/address/0x90860C61E51081E6FC294Eaa95232CAD91Df6414;
        Synth newSynth = Synth(0x90860C61E51081E6FC294Eaa95232CAD91Df6414);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sJPY() internal {
        // https://kovan.etherscan.io/address/0x880477aE972Ca606cC7D47496E077514e978231B;
        Synth existingSynth = Synth(0x880477aE972Ca606cC7D47496E077514e978231B);
        // https://kovan.etherscan.io/address/0xb093d0dAe697A94eA2565C638B792005EF22b450;
        Synth newSynth = Synth(0xb093d0dAe697A94eA2565C638B792005EF22b450);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAUD() internal {
        // https://kovan.etherscan.io/address/0x0D9D97E38d19885441f8be74fE88C3294300C866;
        Synth existingSynth = Synth(0x0D9D97E38d19885441f8be74fE88C3294300C866);
        // https://kovan.etherscan.io/address/0xa56d0366B6915B72965ECb283Cae449ffb28f4aC;
        Synth newSynth = Synth(0xa56d0366B6915B72965ECb283Cae449ffb28f4aC);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sGBP() internal {
        // https://kovan.etherscan.io/address/0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4;
        Synth existingSynth = Synth(0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4);
        // https://kovan.etherscan.io/address/0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a;
        Synth newSynth = Synth(0x8dCAa0E48C186c3C1dBF81B3b73908Dc24A72F6a);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sKRW() internal {
        // https://kovan.etherscan.io/address/0x376684744fb828D67B1659f6D3D754938dc1Ec4b;
        Synth existingSynth = Synth(0x376684744fb828D67B1659f6D3D754938dc1Ec4b);
        // https://kovan.etherscan.io/address/0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2;
        Synth newSynth = Synth(0x461721B15CCF0Ab1a1Ae6BB4c65c1d43e7d0b9d2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sCHF() internal {
        // https://kovan.etherscan.io/address/0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e;
        Synth existingSynth = Synth(0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e);
        // https://kovan.etherscan.io/address/0xc099c530Dfdc834CA75BD228C72dE6B683A961af;
        Synth newSynth = Synth(0xc099c530Dfdc834CA75BD228C72dE6B683A961af);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://kovan.etherscan.io/address/0xe2d39AB610fEe4C7FC591003553c7557C880eD04;
        Synth existingSynth = Synth(0xe2d39AB610fEe4C7FC591003553c7557C880eD04);
        // https://kovan.etherscan.io/address/0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD;
        Synth newSynth = Synth(0xABA3ef57C8262E38382DF99767aa66aAA1aC15BD);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://kovan.etherscan.io/address/0x56a8953C03FC8b859140D5C6f7e7f24dD611d419;
        Synth existingSynth = Synth(0x56a8953C03FC8b859140D5C6f7e7f24dD611d419);
        // https://kovan.etherscan.io/address/0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621;
        Synth newSynth = Synth(0x73e677A6cCc8Df157ffd0dd3830A0e6dC4B86621);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan.etherscan.io/address/0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf;
        Synth existingSynth = Synth(0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf);
        // https://kovan.etherscan.io/address/0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85;
        Synth newSynth = Synth(0xF41351CC7Cd694520917ffBd737Ed2ab6a3e4D85);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sDEFI() internal {
        // https://kovan.etherscan.io/address/0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2;
        Synth existingSynth = Synth(0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2);
        // https://kovan.etherscan.io/address/0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913;
        Synth newSynth = Synth(0x26d77072ffd0837Db05Cd0e0963cAA0ffF9dC913);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_47() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_47_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_47_0[0] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_47_0[1] = ISynth(new_SynthsJPY_contract);
        issuer_addSynths_synthsToAdd_47_0[2] = ISynth(new_SynthsAUD_contract);
        issuer_addSynths_synthsToAdd_47_0[3] = ISynth(new_SynthsGBP_contract);
        issuer_addSynths_synthsToAdd_47_0[4] = ISynth(new_SynthsKRW_contract);
        issuer_addSynths_synthsToAdd_47_0[5] = ISynth(new_SynthsCHF_contract);
        issuer_addSynths_synthsToAdd_47_0[6] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_47_0[7] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_47_0[8] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_47_0[9] = ISynth(new_SynthsDEFI_contract);
        // keys
        bytes32[] memory keys = new bytes32[](10);
        keys[0] = "sEUR";
        keys[1] = "sJPY";
        keys[2] = "sAUD";
        keys[3] = "sGBP";
        keys[4] = "sKRW";
        keys[5] = "sCHF";
        keys[6] = "sBTC";
        keys[7] = "sETH";
        keys[8] = "sLINK";
        keys[9] = "sDEFI";
        issuer_i.removeSynths(keys);
        // FML
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_47_0);
    }
}

pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_SaiphOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x0064A673267696049938AA47595dD0B3C2e705A1
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x0064A673267696049938AA47595dD0B3C2e705A1);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C
    TokenState public constant tokenstatesynthetix_i = TokenState(0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C);
    // https://kovan-explorer.optimism.io/address/0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB);
    // https://kovan-explorer.optimism.io/address/0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95);
    // https://kovan-explorer.optimism.io/address/0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f
    TokenState public constant tokenstatesusd_i = TokenState(0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f);
    // https://kovan-explorer.optimism.io/address/0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57);
    // https://kovan-explorer.optimism.io/address/0xCB2A226c20f404d7fcFC3eC95B38D06877284527
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0xCB2A226c20f404d7fcFC3eC95B38D06877284527);
    // https://kovan-explorer.optimism.io/address/0x8E6734A7653175b3FDa62516A646709F547C8342
    TokenState public constant tokenstateseth_i = TokenState(0x8E6734A7653175b3FDa62516A646709F547C8342);
    // https://kovan-explorer.optimism.io/address/0x94B41091eB29b36003aC1C6f0E55a5225633c884
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x94B41091eB29b36003aC1C6f0E55a5225633c884);
    // https://kovan-explorer.optimism.io/address/0x9C570575586ba29ed8a2523639865fF131F59411
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x9C570575586ba29ed8a2523639865fF131F59411);
    // https://kovan-explorer.optimism.io/address/0x0F73cf03DFD5595e862aa27E98914E70554eCf6d
    TokenState public constant tokenstatesbtc_i = TokenState(0x0F73cf03DFD5595e862aa27E98914E70554eCf6d);
    // https://kovan-explorer.optimism.io/address/0x23F608ACc41bd7BCC617a01a9202214EE305439a
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x23F608ACc41bd7BCC617a01a9202214EE305439a);
    // https://kovan-explorer.optimism.io/address/0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454);
    // https://kovan-explorer.optimism.io/address/0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE
    TokenState public constant tokenstateslink_i = TokenState(0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE);
    // https://kovan-explorer.optimism.io/address/0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E);
    // https://kovan-explorer.optimism.io/address/0x2269411619c1FF9C02F251167d583450EB1E4847
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0x2269411619c1FF9C02F251167d583450EB1E4847);
    // https://kovan-explorer.optimism.io/address/0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26
    TokenState public constant tokenstatesuni_i = TokenState(0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26);
    // https://kovan-explorer.optimism.io/address/0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57);
    // https://kovan-explorer.optimism.io/address/0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958);
    // https://kovan-explorer.optimism.io/address/0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33
    TokenState public constant tokenstatesaave_i = TokenState(0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33);
    // https://kovan-explorer.optimism.io/address/0x503e91fc2b9Ad7453700130d0825E661565E4c3b
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x503e91fc2b9Ad7453700130d0825E661565E4c3b);
    // https://kovan-explorer.optimism.io/address/0x1a77afdFa733292C17975e83b08091674A8FF3B4
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0x1a77afdFa733292C17975e83b08091674A8FF3B4);
    // https://kovan-explorer.optimism.io/address/0x49460030a1801D38797D35F7ac4205a6212861aD
    TokenState public constant tokenstatessol_i = TokenState(0x49460030a1801D38797D35F7ac4205a6212861aD);
    // https://kovan-explorer.optimism.io/address/0x64Df80373eCD553CD48534A0542307178fF344DD
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x64Df80373eCD553CD48534A0542307178fF344DD);
    // https://kovan-explorer.optimism.io/address/0xDe64a263c044e193B50d5eafd5EDD330997EA39e
    MultiCollateralSynth public constant synthsavax_i = MultiCollateralSynth(0xDe64a263c044e193B50d5eafd5EDD330997EA39e);
    // https://kovan-explorer.optimism.io/address/0x8338011e46Db45f5cA0f06C4174a85280772dC85
    TokenState public constant tokenstatesavax_i = TokenState(0x8338011e46Db45f5cA0f06C4174a85280772dC85);
    // https://kovan-explorer.optimism.io/address/0x61760432A363399de4dDDFfD5925A4046c112594
    ProxyERC20 public constant proxysavax_i = ProxyERC20(0x61760432A363399de4dDDFfD5925A4046c112594);
    // https://kovan-explorer.optimism.io/address/0x042c26bBa8741B9b277695426861c09dD1c41366
    MultiCollateralSynth public constant synthsmatic_i = MultiCollateralSynth(0x042c26bBa8741B9b277695426861c09dD1c41366);
    // https://kovan-explorer.optimism.io/address/0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6
    TokenState public constant tokenstatesmatic_i = TokenState(0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6);
    // https://kovan-explorer.optimism.io/address/0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6
    ProxyERC20 public constant proxysmatic_i = ProxyERC20(0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6);
    // https://kovan-explorer.optimism.io/address/0xc696eB9b1726256bd2039a322aBBd48bD389dEF4
    MultiCollateralSynth public constant synthswti_i = MultiCollateralSynth(0xc696eB9b1726256bd2039a322aBBd48bD389dEF4);
    // https://kovan-explorer.optimism.io/address/0x412c870daAb642aA87715e2EA860d20E48E73267
    TokenState public constant tokenstateswti_i = TokenState(0x412c870daAb642aA87715e2EA860d20E48E73267);
    // https://kovan-explorer.optimism.io/address/0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA
    ProxyERC20 public constant proxyswti_i = ProxyERC20(0x6b27e4554f2FEFc04F4bd9AE0D2A77f348d12cfA);
    // https://kovan-explorer.optimism.io/address/0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B
    MultiCollateralSynth public constant synthsxau_i = MultiCollateralSynth(0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B);
    // https://kovan-explorer.optimism.io/address/0x3A008c909d505122668Ebc74980E2A222a9555Dd
    TokenState public constant tokenstatesxau_i = TokenState(0x3A008c909d505122668Ebc74980E2A222a9555Dd);
    // https://kovan-explorer.optimism.io/address/0x9B2aFAa2b72C281d86f07d4DE41A16882A3c8470
    ProxyERC20 public constant proxysxau_i = ProxyERC20(0x9B2aFAa2b72C281d86f07d4DE41A16882A3c8470);
    // https://kovan-explorer.optimism.io/address/0xe97b8152CB74ED9935d2f8b2C09331415A6ba856
    MultiCollateralSynth public constant synthsxag_i = MultiCollateralSynth(0xe97b8152CB74ED9935d2f8b2C09331415A6ba856);
    // https://kovan-explorer.optimism.io/address/0x32bB37418b682aEC849fdb86e9947847BEe392e7
    TokenState public constant tokenstatesxag_i = TokenState(0x32bB37418b682aEC849fdb86e9947847BEe392e7);
    // https://kovan-explorer.optimism.io/address/0x6e497a19f459c4D17B178539d7583553Ad9A9A90
    ProxyERC20 public constant proxysxag_i = ProxyERC20(0x6e497a19f459c4D17B178539d7583553Ad9A9A90);
    // https://kovan-explorer.optimism.io/address/0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57);
    // https://kovan-explorer.optimism.io/address/0xB16748B76C430F7cC9d8dbE617A77f09e49B482B
    TokenState public constant tokenstateseur_i = TokenState(0xB16748B76C430F7cC9d8dbE617A77f09e49B482B);
    // https://kovan-explorer.optimism.io/address/0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2);
    // https://kovan-explorer.optimism.io/address/0x1433512539954651cB95A73D4C551943fB723b48
    Issuer public constant issuer_i = Issuer(0x1433512539954651cB95A73D4C551943fB723b48);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x75d83253021b7874DF52B1f954Eb70AcA918a537
    address public constant new_Synthetix_contract = 0x75d83253021b7874DF52B1f954Eb70AcA918a537;
    // https://kovan-explorer.optimism.io/address/0x1433512539954651cB95A73D4C551943fB723b48
    address public constant new_Issuer_contract = 0x1433512539954651cB95A73D4C551943fB723b48;
    // https://kovan-explorer.optimism.io/address/0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95
    address public constant new_SynthsUSD_contract = 0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95;
    // https://kovan-explorer.optimism.io/address/0x9C570575586ba29ed8a2523639865fF131F59411
    address public constant new_SynthsBTC_contract = 0x9C570575586ba29ed8a2523639865fF131F59411;
    // https://kovan-explorer.optimism.io/address/0xCB2A226c20f404d7fcFC3eC95B38D06877284527
    address public constant new_SynthsETH_contract = 0xCB2A226c20f404d7fcFC3eC95B38D06877284527;
    // https://kovan-explorer.optimism.io/address/0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454
    address public constant new_SynthsLINK_contract = 0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454;
    // https://kovan-explorer.optimism.io/address/0x2269411619c1FF9C02F251167d583450EB1E4847
    address public constant new_SynthsUNI_contract = 0x2269411619c1FF9C02F251167d583450EB1E4847;
    // https://kovan-explorer.optimism.io/address/0x1a77afdFa733292C17975e83b08091674A8FF3B4
    address public constant new_SynthsSOL_contract = 0x1a77afdFa733292C17975e83b08091674A8FF3B4;
    // https://kovan-explorer.optimism.io/address/0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958
    address public constant new_SynthsAAVE_contract = 0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958;
    // https://kovan-explorer.optimism.io/address/0xDe64a263c044e193B50d5eafd5EDD330997EA39e
    address public constant new_SynthsAVAX_contract = 0xDe64a263c044e193B50d5eafd5EDD330997EA39e;
    // https://kovan-explorer.optimism.io/address/0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B
    address public constant new_SynthsXAU_contract = 0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B;
    // https://kovan-explorer.optimism.io/address/0x042c26bBa8741B9b277695426861c09dD1c41366
    address public constant new_SynthsMATIC_contract = 0x042c26bBa8741B9b277695426861c09dD1c41366;
    // https://kovan-explorer.optimism.io/address/0xc696eB9b1726256bd2039a322aBBd48bD389dEF4
    address public constant new_SynthsWTI_contract = 0xc696eB9b1726256bd2039a322aBBd48bD389dEF4;
    // https://kovan-explorer.optimism.io/address/0xe97b8152CB74ED9935d2f8b2C09331415A6ba856
    address public constant new_SynthsXAG_contract = 0xe97b8152CB74ED9935d2f8b2C09331415A6ba856;
    // https://kovan-explorer.optimism.io/address/0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57
    address public constant new_SynthsEUR_contract = 0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](45);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(systemstatus_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(synthsusd_i);
        contracts[6] = address(tokenstatesusd_i);
        contracts[7] = address(proxysusd_i);
        contracts[8] = address(synthseth_i);
        contracts[9] = address(tokenstateseth_i);
        contracts[10] = address(proxyseth_i);
        contracts[11] = address(synthsbtc_i);
        contracts[12] = address(tokenstatesbtc_i);
        contracts[13] = address(proxysbtc_i);
        contracts[14] = address(synthslink_i);
        contracts[15] = address(tokenstateslink_i);
        contracts[16] = address(proxyslink_i);
        contracts[17] = address(synthsuni_i);
        contracts[18] = address(tokenstatesuni_i);
        contracts[19] = address(proxysuni_i);
        contracts[20] = address(synthsaave_i);
        contracts[21] = address(tokenstatesaave_i);
        contracts[22] = address(proxysaave_i);
        contracts[23] = address(synthssol_i);
        contracts[24] = address(tokenstatessol_i);
        contracts[25] = address(proxyssol_i);
        contracts[26] = address(synthsavax_i);
        contracts[27] = address(tokenstatesavax_i);
        contracts[28] = address(proxysavax_i);
        contracts[29] = address(synthsmatic_i);
        contracts[30] = address(tokenstatesmatic_i);
        contracts[31] = address(proxysmatic_i);
        contracts[32] = address(synthswti_i);
        contracts[33] = address(tokenstateswti_i);
        contracts[34] = address(proxyswti_i);
        contracts[35] = address(synthsxau_i);
        contracts[36] = address(tokenstatesxau_i);
        contracts[37] = address(proxysxau_i);
        contracts[38] = address(synthsxag_i);
        contracts[39] = address(tokenstatesxag_i);
        contracts[40] = address(proxysxag_i);
        contracts[41] = address(synthseur_i);
        contracts[42] = address(tokenstateseur_i);
        contracts[43] = address(proxyseur_i);
        contracts[44] = address(issuer_i);
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
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
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
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUNI();
        // Ensure the sUNI synth can write to its TokenState;
        tokenstatesuni_i.setAssociatedContract(new_SynthsUNI_contract);
        // Ensure the sUNI synth Proxy is correctly connected to the Synth;
        proxysuni_i.setTarget(Proxyable(new_SynthsUNI_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sSOL();
        // Ensure the sSOL synth can write to its TokenState;
        tokenstatessol_i.setAssociatedContract(new_SynthsSOL_contract);
        // Ensure the sSOL synth Proxy is correctly connected to the Synth;
        proxyssol_i.setTarget(Proxyable(new_SynthsSOL_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAVAX();
        // Ensure the sAVAX synth can write to its TokenState;
        tokenstatesavax_i.setAssociatedContract(new_SynthsAVAX_contract);
        // Ensure the sAVAX synth Proxy is correctly connected to the Synth;
        proxysavax_i.setTarget(Proxyable(new_SynthsAVAX_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sMATIC();
        // Ensure the sMATIC synth can write to its TokenState;
        tokenstatesmatic_i.setAssociatedContract(new_SynthsMATIC_contract);
        // Ensure the sMATIC synth Proxy is correctly connected to the Synth;
        proxysmatic_i.setTarget(Proxyable(new_SynthsMATIC_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sWTI();
        // Ensure the sWTI synth can write to its TokenState;
        tokenstateswti_i.setAssociatedContract(new_SynthsWTI_contract);
        // Ensure the sWTI synth Proxy is correctly connected to the Synth;
        proxyswti_i.setTarget(Proxyable(new_SynthsWTI_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sXAU();
        // Ensure the sXAU synth can write to its TokenState;
        tokenstatesxau_i.setAssociatedContract(new_SynthsXAU_contract);
        // Ensure the sXAU synth Proxy is correctly connected to the Synth;
        proxysxau_i.setTarget(Proxyable(new_SynthsXAU_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sXAG();
        // Ensure the sXAG synth can write to its TokenState;
        tokenstatesxag_i.setAssociatedContract(new_SynthsXAG_contract);
        // Ensure the sXAG synth Proxy is correctly connected to the Synth;
        proxysxag_i.setTarget(Proxyable(new_SynthsXAG_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_61();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](15);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[4] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsUNI");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsSOL");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthsAVAX");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsXAU");
        addressresolver_importAddresses_names_0_0[11] = bytes32("SynthsMATIC");
        addressresolver_importAddresses_names_0_0[12] = bytes32("SynthsWTI");
        addressresolver_importAddresses_names_0_0[13] = bytes32("SynthsXAG");
        addressresolver_importAddresses_names_0_0[14] = bytes32("SynthsEUR");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](15);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsUNI_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsSOL_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthsAVAX_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsXAU_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_SynthsMATIC_contract);
        addressresolver_importAddresses_destinations_0_1[12] = address(new_SynthsWTI_contract);
        addressresolver_importAddresses_destinations_0_1[13] = address(new_SynthsXAG_contract);
        addressresolver_importAddresses_destinations_0_1[14] = address(new_SynthsEUR_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xE50124A0C087EC06a273D0B9886902273B02d4D8);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xE45A27fd3ad929866CEFc6786d8360fF6665c660);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xfff685537fdbD9CA07BD863Ac0b422863BF3114f);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x5b643DFC67f9701929A0b55f23e0Af61df50E75D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_SynthsUNI_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(new_SynthsSOL_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](12);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_SynthsAVAX_contract);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_SynthsMATIC_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(new_SynthsWTI_contract);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_SynthsXAU_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_SynthsXAG_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xb7469A575b7931532F09AEe2882835A0249064a0);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x65d3c950A30524D9f882cFf826040F3941D1ADAA);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA;
        Synth existingSynth = Synth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        // https://kovan-explorer.optimism.io/address/0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95;
        Synth newSynth = Synth(0xbdb2Bf553b5f9Ca3327809F3748b86C106719C95);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2;
        Synth existingSynth = Synth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        // https://kovan-explorer.optimism.io/address/0xCB2A226c20f404d7fcFC3eC95B38D06877284527;
        Synth newSynth = Synth(0xCB2A226c20f404d7fcFC3eC95B38D06877284527);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34;
        Synth existingSynth = Synth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        // https://kovan-explorer.optimism.io/address/0x9C570575586ba29ed8a2523639865fF131F59411;
        Synth newSynth = Synth(0x9C570575586ba29ed8a2523639865fF131F59411);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723;
        Synth existingSynth = Synth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        // https://kovan-explorer.optimism.io/address/0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454;
        Synth newSynth = Synth(0x1f42bE0572fccf74356C8e28A68A2dd60E7c6454);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877;
        Synth existingSynth = Synth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        // https://kovan-explorer.optimism.io/address/0x2269411619c1FF9C02F251167d583450EB1E4847;
        Synth newSynth = Synth(0x2269411619c1FF9C02F251167d583450EB1E4847);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa;
        Synth existingSynth = Synth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        // https://kovan-explorer.optimism.io/address/0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958;
        Synth newSynth = Synth(0x7EFfe4DF5961471B48Bb3c65456ff97A594b0958);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sSOL() internal {
        // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f;
        Synth existingSynth = Synth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        // https://kovan-explorer.optimism.io/address/0x1a77afdFa733292C17975e83b08091674A8FF3B4;
        Synth newSynth = Synth(0x1a77afdFa733292C17975e83b08091674A8FF3B4);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAVAX() internal {
        // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49;
        Synth existingSynth = Synth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        // https://kovan-explorer.optimism.io/address/0xDe64a263c044e193B50d5eafd5EDD330997EA39e;
        Synth newSynth = Synth(0xDe64a263c044e193B50d5eafd5EDD330997EA39e);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sMATIC() internal {
        // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65;
        Synth existingSynth = Synth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        // https://kovan-explorer.optimism.io/address/0x042c26bBa8741B9b277695426861c09dD1c41366;
        Synth newSynth = Synth(0x042c26bBa8741B9b277695426861c09dD1c41366);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sWTI() internal {
        // https://kovan-explorer.optimism.io/address/0x8e08BF90B979698AdB6d722E9e27263f36366414;
        Synth existingSynth = Synth(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        // https://kovan-explorer.optimism.io/address/0xc696eB9b1726256bd2039a322aBBd48bD389dEF4;
        Synth newSynth = Synth(0xc696eB9b1726256bd2039a322aBBd48bD389dEF4);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sXAU() internal {
        // https://kovan-explorer.optimism.io/address/0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF;
        Synth existingSynth = Synth(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        // https://kovan-explorer.optimism.io/address/0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B;
        Synth newSynth = Synth(0xce57Aa68D326f75eB815FD3c0b18D093775Bc86B);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sXAG() internal {
        // https://kovan-explorer.optimism.io/address/0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89;
        Synth existingSynth = Synth(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        // https://kovan-explorer.optimism.io/address/0xe97b8152CB74ED9935d2f8b2C09331415A6ba856;
        Synth newSynth = Synth(0xe97b8152CB74ED9935d2f8b2C09331415A6ba856);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://kovan-explorer.optimism.io/address/0x2eC164E5b91f9627193C0268F1462327e3D7EC68;
        Synth existingSynth = Synth(0x2eC164E5b91f9627193C0268F1462327e3D7EC68);
        // https://kovan-explorer.optimism.io/address/0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57;
        Synth newSynth = Synth(0x92d4e5CAfbf3219E81f1c904068Fe7CD2d440F57);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_61() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_61_0 = new ISynth[](13);
        issuer_addSynths_synthsToAdd_61_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_61_0[1] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_61_0[2] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_61_0[3] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_61_0[4] = ISynth(new_SynthsUNI_contract);
        issuer_addSynths_synthsToAdd_61_0[5] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_61_0[6] = ISynth(new_SynthsSOL_contract);
        issuer_addSynths_synthsToAdd_61_0[7] = ISynth(new_SynthsAVAX_contract);
        issuer_addSynths_synthsToAdd_61_0[8] = ISynth(new_SynthsMATIC_contract);
        issuer_addSynths_synthsToAdd_61_0[9] = ISynth(new_SynthsWTI_contract);
        issuer_addSynths_synthsToAdd_61_0[10] = ISynth(new_SynthsXAU_contract);
        issuer_addSynths_synthsToAdd_61_0[11] = ISynth(new_SynthsXAG_contract);
        issuer_addSynths_synthsToAdd_61_0[12] = ISynth(new_SynthsEUR_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_61_0);
    }
}

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
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
    // https://explorer.optimism.io/address/0x92bAc115d89cA17fd02Ed9357CEcA32842ACB4c2
    TokenState public constant tokenstatesusd_i = TokenState(0x92bAc115d89cA17fd02Ed9357CEcA32842ACB4c2);
    // https://explorer.optimism.io/address/0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9);
    // https://explorer.optimism.io/address/0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
    // https://explorer.optimism.io/address/0xEc3665F7e696b0Ad0D04Ae5161b18782D48cd1fd
    TokenState public constant tokenstateseth_i = TokenState(0xEc3665F7e696b0Ad0D04Ae5161b18782D48cd1fd);
    // https://explorer.optimism.io/address/0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49);
    // https://explorer.optimism.io/address/0x421DEF861D623F7123dfE0878D86E9576cbb3975
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
    // https://explorer.optimism.io/address/0xA9E630952522E3F110322711F424528Af894e307
    TokenState public constant tokenstatesbtc_i = TokenState(0xA9E630952522E3F110322711F424528Af894e307);
    // https://explorer.optimism.io/address/0x298B9B95708152ff6968aafd889c6586e9169f1D
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x298B9B95708152ff6968aafd889c6586e9169f1D);
    // https://explorer.optimism.io/address/0x0F6877e0Bb54a0739C6173A814B39D5127804123
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
    // https://explorer.optimism.io/address/0x08a008eEA07d3cC7ca1913EEC3468C10F8F79e6A
    TokenState public constant tokenstateslink_i = TokenState(0x08a008eEA07d3cC7ca1913EEC3468C10F8F79e6A);
    // https://explorer.optimism.io/address/0xc5Db22719A06418028A40A9B5E9A7c02959D0d08
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xc5Db22719A06418028A40A9B5E9A7c02959D0d08);
    // https://explorer.optimism.io/address/0x04B50a5992Ea2281E14d43494d656698EA9C24dD
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
    // https://explorer.optimism.io/address/0x6825Dd6B5b83FBbFF1049A44dc808A10fe9a6719
    TokenState public constant tokenstatessol_i = TokenState(0x6825Dd6B5b83FBbFF1049A44dc808A10fe9a6719);
    // https://explorer.optimism.io/address/0x8b2F7Ae8cA8EE8428B6D76dE88326bB413db2766
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x8b2F7Ae8cA8EE8428B6D76dE88326bB413db2766);
    // https://explorer.optimism.io/address/0x368A5126fF8e659004b6f9C9F723E15632e2B428
    MultiCollateralSynth public constant synthsavax_i = MultiCollateralSynth(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
    // https://explorer.optimism.io/address/0x2114d1C571CB541f3416a65f8BccFf9BB9E55Dc5
    TokenState public constant tokenstatesavax_i = TokenState(0x2114d1C571CB541f3416a65f8BccFf9BB9E55Dc5);
    // https://explorer.optimism.io/address/0xB2b42B231C68cbb0b4bF2FFEbf57782Fd97D3dA4
    ProxyERC20 public constant proxysavax_i = ProxyERC20(0xB2b42B231C68cbb0b4bF2FFEbf57782Fd97D3dA4);
    // https://explorer.optimism.io/address/0xf49C194954b6B91855aC06D6C88Be316da60eD96
    MultiCollateralSynth public constant synthsmatic_i = MultiCollateralSynth(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
    // https://explorer.optimism.io/address/0x937C9E1d18bEB4F8E1BCB0Dd7a612ca6012517a3
    TokenState public constant tokenstatesmatic_i = TokenState(0x937C9E1d18bEB4F8E1BCB0Dd7a612ca6012517a3);
    // https://explorer.optimism.io/address/0x81DDfAc111913d3d5218DEA999216323B7CD6356
    ProxyERC20 public constant proxysmatic_i = ProxyERC20(0x81DDfAc111913d3d5218DEA999216323B7CD6356);
    // https://explorer.optimism.io/address/0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
    // https://explorer.optimism.io/address/0x7afF10fc89B162c7aBf77974d190E7959cb456f5
    TokenState public constant tokenstateseur_i = TokenState(0x7afF10fc89B162c7aBf77974d190E7959cb456f5);
    // https://explorer.optimism.io/address/0xFBc4198702E81aE77c06D58f81b629BDf36f0a71
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xFBc4198702E81aE77c06D58f81b629BDf36f0a71);
    // https://explorer.optimism.io/address/0x34783A738DdC355cD7c737D4101b20622681332a
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x34783A738DdC355cD7c737D4101b20622681332a);
    // https://explorer.optimism.io/address/0xAf918f4a72BC34E59dFaF65866feC87947F1f590
    TokenState public constant tokenstatesaave_i = TokenState(0xAf918f4a72BC34E59dFaF65866feC87947F1f590);
    // https://explorer.optimism.io/address/0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x00B8D5a5e1Ac97Cb4341c4Bc4367443c8776e8d9);
    // https://explorer.optimism.io/address/0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
    // https://explorer.optimism.io/address/0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff
    TokenState public constant tokenstatesuni_i = TokenState(0xf32b995Fe4dDf540C848236dB9638d137Aa9b6ff);
    // https://explorer.optimism.io/address/0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0xf5a6115Aa582Fd1BEEa22BC93B7dC7a785F60d03);
    // https://explorer.optimism.io/address/0x34c2360ffe5D21542f76e991FFD104f281D4B3fb
    MultiCollateralSynth public constant synthsinr_i = MultiCollateralSynth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
    // https://explorer.optimism.io/address/0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6
    TokenState public constant tokenstatesinr_i = TokenState(0xfE33ae95A9f0DA8A845aF33516EDc240DCD711d6);
    // https://explorer.optimism.io/address/0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF
    ProxyERC20 public constant proxysinr_i = ProxyERC20(0xa3A538EA5D5838dC32dde15946ccD74bDd5652fF);
    // https://explorer.optimism.io/address/0xc5Ae1Eca0AFC915F88C0135cdaaf270d710f03FF
    Issuer public constant issuer_i = Issuer(0xc5Ae1Eca0AFC915F88C0135cdaaf270d710f03FF);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xc5Ae1Eca0AFC915F88C0135cdaaf270d710f03FF
    address public constant new_Issuer_contract = 0xc5Ae1Eca0AFC915F88C0135cdaaf270d710f03FF;
    // https://explorer.optimism.io/address/0xFE8E48Bf36ccC3254081eC8C65965D1c8b2E744D
    address public constant new_Synthetix_contract = 0xFE8E48Bf36ccC3254081eC8C65965D1c8b2E744D;
    // https://explorer.optimism.io/address/0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB
    address public constant new_SynthsUSD_contract = 0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB;
    // https://explorer.optimism.io/address/0x421DEF861D623F7123dfE0878D86E9576cbb3975
    address public constant new_SynthsBTC_contract = 0x421DEF861D623F7123dfE0878D86E9576cbb3975;
    // https://explorer.optimism.io/address/0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7
    address public constant new_SynthsETH_contract = 0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7;
    // https://explorer.optimism.io/address/0x0F6877e0Bb54a0739C6173A814B39D5127804123
    address public constant new_SynthsLINK_contract = 0x0F6877e0Bb54a0739C6173A814B39D5127804123;
    // https://explorer.optimism.io/address/0x04B50a5992Ea2281E14d43494d656698EA9C24dD
    address public constant new_SynthsSOL_contract = 0x04B50a5992Ea2281E14d43494d656698EA9C24dD;
    // https://explorer.optimism.io/address/0xf49C194954b6B91855aC06D6C88Be316da60eD96
    address public constant new_SynthsMATIC_contract = 0xf49C194954b6B91855aC06D6C88Be316da60eD96;
    // https://explorer.optimism.io/address/0x368A5126fF8e659004b6f9C9F723E15632e2B428
    address public constant new_SynthsAVAX_contract = 0x368A5126fF8e659004b6f9C9F723E15632e2B428;
    // https://explorer.optimism.io/address/0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2
    address public constant new_SynthsEUR_contract = 0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2;
    // https://explorer.optimism.io/address/0x34783A738DdC355cD7c737D4101b20622681332a
    address public constant new_SynthsAAVE_contract = 0x34783A738DdC355cD7c737D4101b20622681332a;
    // https://explorer.optimism.io/address/0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9
    address public constant new_SynthsUNI_contract = 0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9;
    // https://explorer.optimism.io/address/0x34c2360ffe5D21542f76e991FFD104f281D4B3fb
    address public constant new_SynthsINR_contract = 0x34c2360ffe5D21542f76e991FFD104f281D4B3fb;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](39);
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
        contracts[17] = address(synthssol_i);
        contracts[18] = address(tokenstatessol_i);
        contracts[19] = address(proxyssol_i);
        contracts[20] = address(synthsavax_i);
        contracts[21] = address(tokenstatesavax_i);
        contracts[22] = address(proxysavax_i);
        contracts[23] = address(synthsmatic_i);
        contracts[24] = address(tokenstatesmatic_i);
        contracts[25] = address(proxysmatic_i);
        contracts[26] = address(synthseur_i);
        contracts[27] = address(tokenstateseur_i);
        contracts[28] = address(proxyseur_i);
        contracts[29] = address(synthsaave_i);
        contracts[30] = address(tokenstatesaave_i);
        contracts[31] = address(proxysaave_i);
        contracts[32] = address(synthsuni_i);
        contracts[33] = address(tokenstatesuni_i);
        contracts[34] = address(proxysuni_i);
        contracts[35] = address(synthsinr_i);
        contracts[36] = address(tokenstatesinr_i);
        contracts[37] = address(proxysinr_i);
        contracts[38] = address(issuer_i);
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
        copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUNI();
        // Ensure the sUNI synth can write to its TokenState;
        tokenstatesuni_i.setAssociatedContract(new_SynthsUNI_contract);
        // Ensure the sUNI synth Proxy is correctly connected to the Synth;
        proxysuni_i.setTarget(Proxyable(new_SynthsUNI_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sINR();
        // Ensure the sINR synth can write to its TokenState;
        tokenstatesinr_i.setAssociatedContract(new_SynthsINR_contract);
        // Ensure the sINR synth Proxy is correctly connected to the Synth;
        proxysinr_i.setTarget(Proxyable(new_SynthsINR_contract));
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_53();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](13);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[4] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsSOL");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsMATIC");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthsAVAX");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsAAVE");
        addressresolver_importAddresses_names_0_0[11] = bytes32("SynthsUNI");
        addressresolver_importAddresses_names_0_0[12] = bytes32("SynthsINR");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](13);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsSOL_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsMATIC_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthsAVAX_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsAAVE_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_SynthsUNI_contract);
        addressresolver_importAddresses_destinations_0_1[12] = address(new_SynthsINR_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xcC02F000b0aA8a0eFC2B55C9cf2305Fb3531cca1);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsSOL_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_SynthsAVAX_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_SynthsMATIC_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](12);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(new_SynthsUNI_contract);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(new_SynthsINR_contract);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x27be2EFAd45DeBd732C1EBf5C9F7b49D498D4a93);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xeb4b5ABcE7310855319440d936cd3aDd77DFA193);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x6202A3B0bE1D222971E93AaB084c6E584C29DB70);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x8A91e92FDd86e734781c38DB52a390e1B99fba7c);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://explorer.optimism.io/address/0xD1599E478cC818AFa42A4839a6C665D9279C3E50;
        Synth existingSynth = Synth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        // https://explorer.optimism.io/address/0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB;
        Synth newSynth = Synth(0xDfA2d3a0d32F870D87f8A0d7AA6b9CdEB7bc5AdB);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://explorer.optimism.io/address/0x0681883084b5De1564FE2706C87affD77F1677D5;
        Synth existingSynth = Synth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        // https://explorer.optimism.io/address/0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7;
        Synth newSynth = Synth(0xe9dceA0136FEFC76c4E639Ec60CCE70482E2aCF7);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://explorer.optimism.io/address/0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2;
        Synth existingSynth = Synth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        // https://explorer.optimism.io/address/0x421DEF861D623F7123dfE0878D86E9576cbb3975;
        Synth newSynth = Synth(0x421DEF861D623F7123dfE0878D86E9576cbb3975);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://explorer.optimism.io/address/0x2302D7F7783e2712C48aA684451b9d706e74F299;
        Synth existingSynth = Synth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        // https://explorer.optimism.io/address/0x0F6877e0Bb54a0739C6173A814B39D5127804123;
        Synth newSynth = Synth(0x0F6877e0Bb54a0739C6173A814B39D5127804123);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sSOL() internal {
        // https://explorer.optimism.io/address/0x91DBC6f587D043FEfbaAD050AB48696B30F13d89;
        Synth existingSynth = Synth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        // https://explorer.optimism.io/address/0x04B50a5992Ea2281E14d43494d656698EA9C24dD;
        Synth newSynth = Synth(0x04B50a5992Ea2281E14d43494d656698EA9C24dD);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAVAX() internal {
        // https://explorer.optimism.io/address/0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D;
        Synth existingSynth = Synth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        // https://explorer.optimism.io/address/0x368A5126fF8e659004b6f9C9F723E15632e2B428;
        Synth newSynth = Synth(0x368A5126fF8e659004b6f9C9F723E15632e2B428);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sMATIC() internal {
        // https://explorer.optimism.io/address/0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e;
        Synth existingSynth = Synth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        // https://explorer.optimism.io/address/0xf49C194954b6B91855aC06D6C88Be316da60eD96;
        Synth newSynth = Synth(0xf49C194954b6B91855aC06D6C88Be316da60eD96);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sEUR() internal {
        // https://explorer.optimism.io/address/0xB16ef128b11e457afA07B09FCE52A01f5B05a937;
        Synth existingSynth = Synth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        // https://explorer.optimism.io/address/0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2;
        Synth newSynth = Synth(0xdEdb0b04AFF1525bb4B6167F00e61601690c1fF2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://explorer.optimism.io/address/0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3;
        Synth existingSynth = Synth(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        // https://explorer.optimism.io/address/0x34783A738DdC355cD7c737D4101b20622681332a;
        Synth newSynth = Synth(0x34783A738DdC355cD7c737D4101b20622681332a);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://explorer.optimism.io/address/0xC19d27d1dA572d582723C1745650E51AC4Fc877F;
        Synth existingSynth = Synth(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        // https://explorer.optimism.io/address/0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9;
        Synth newSynth = Synth(0xcF2E165D2359E3C4dFF1E10eC40dBB5a745223A9);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sINR() internal {
        // https://explorer.optimism.io/address/0xc66499aCe3B6c6a30c784bE5511E8d338d543913;
        Synth existingSynth = Synth(0xc66499aCe3B6c6a30c784bE5511E8d338d543913);
        // https://explorer.optimism.io/address/0x34c2360ffe5D21542f76e991FFD104f281D4B3fb;
        Synth newSynth = Synth(0x34c2360ffe5D21542f76e991FFD104f281D4B3fb);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_53() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_53_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_53_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_53_0[1] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_53_0[2] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_53_0[3] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_53_0[4] = ISynth(new_SynthsSOL_contract);
        issuer_addSynths_synthsToAdd_53_0[5] = ISynth(new_SynthsAVAX_contract);
        issuer_addSynths_synthsToAdd_53_0[6] = ISynth(new_SynthsMATIC_contract);
        issuer_addSynths_synthsToAdd_53_0[7] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_53_0[8] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_53_0[9] = ISynth(new_SynthsUNI_contract);
        issuer_addSynths_synthsToAdd_53_0[10] = ISynth(new_SynthsINR_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_53_0);
    }
}

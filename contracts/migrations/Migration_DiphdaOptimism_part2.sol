pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../FeePool.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_DiphdaOptimism_part2 is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8
    SystemStatus public constant systemstatus_i = SystemStatus(0x343BC4b4195FE21D7797B9bb12FcA2C85B5619C8);
    // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C
    FeePool public constant feepool_i = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
    // https://kovan-explorer.optimism.io/address/0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
    // https://kovan-explorer.optimism.io/address/0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4);
    // https://kovan-explorer.optimism.io/address/0x8E6734A7653175b3FDa62516A646709F547C8342
    TokenState public constant tokenstateseth_i = TokenState(0x8E6734A7653175b3FDa62516A646709F547C8342);
    // https://kovan-explorer.optimism.io/address/0x94B41091eB29b36003aC1C6f0E55a5225633c884
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x94B41091eB29b36003aC1C6f0E55a5225633c884);
    // https://kovan-explorer.optimism.io/address/0x62aE6f77610896d60729dcf7a1514dE188E2E838
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x62aE6f77610896d60729dcf7a1514dE188E2E838);
    // https://kovan-explorer.optimism.io/address/0x0F73cf03DFD5595e862aa27E98914E70554eCf6d
    TokenState public constant tokenstatesbtc_i = TokenState(0x0F73cf03DFD5595e862aa27E98914E70554eCf6d);
    // https://kovan-explorer.optimism.io/address/0x23F608ACc41bd7BCC617a01a9202214EE305439a
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x23F608ACc41bd7BCC617a01a9202214EE305439a);
    // https://kovan-explorer.optimism.io/address/0x98b857df9913D97B5822ad6e9d82e4F71073FD1D
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x98b857df9913D97B5822ad6e9d82e4F71073FD1D);
    // https://kovan-explorer.optimism.io/address/0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE
    TokenState public constant tokenstateslink_i = TokenState(0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE);
    // https://kovan-explorer.optimism.io/address/0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E);
    // https://kovan-explorer.optimism.io/address/0xD9d31828c9fa04AEcfD41578b58dC44B82485326
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0xD9d31828c9fa04AEcfD41578b58dC44B82485326);
    // https://kovan-explorer.optimism.io/address/0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26
    TokenState public constant tokenstatesuni_i = TokenState(0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26);
    // https://kovan-explorer.optimism.io/address/0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57);
    // https://kovan-explorer.optimism.io/address/0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA);
    // https://kovan-explorer.optimism.io/address/0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33
    TokenState public constant tokenstatesaave_i = TokenState(0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33);
    // https://kovan-explorer.optimism.io/address/0x503e91fc2b9Ad7453700130d0825E661565E4c3b
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x503e91fc2b9Ad7453700130d0825E661565E4c3b);
    // https://kovan-explorer.optimism.io/address/0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1);
    // https://kovan-explorer.optimism.io/address/0x49460030a1801D38797D35F7ac4205a6212861aD
    TokenState public constant tokenstatessol_i = TokenState(0x49460030a1801D38797D35F7ac4205a6212861aD);
    // https://kovan-explorer.optimism.io/address/0x64Df80373eCD553CD48534A0542307178fF344DD
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x64Df80373eCD553CD48534A0542307178fF344DD);
    // https://kovan-explorer.optimism.io/address/0x9C1063A02195d2f0409CC9d3B2bab16fE0C75DEE
    Issuer public constant issuer_i = Issuer(0x9C1063A02195d2f0409CC9d3B2bab16fE0C75DEE);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x9C1063A02195d2f0409CC9d3B2bab16fE0C75DEE
    address public constant new_Issuer_contract = 0x9C1063A02195d2f0409CC9d3B2bab16fE0C75DEE;
    // https://kovan-explorer.optimism.io/address/0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4
    address public constant new_SynthsETH_contract = 0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4;
    // https://kovan-explorer.optimism.io/address/0x62aE6f77610896d60729dcf7a1514dE188E2E838
    address public constant new_SynthsBTC_contract = 0x62aE6f77610896d60729dcf7a1514dE188E2E838;
    // https://kovan-explorer.optimism.io/address/0x98b857df9913D97B5822ad6e9d82e4F71073FD1D
    address public constant new_SynthsLINK_contract = 0x98b857df9913D97B5822ad6e9d82e4F71073FD1D;
    // https://kovan-explorer.optimism.io/address/0xD9d31828c9fa04AEcfD41578b58dC44B82485326
    address public constant new_SynthsUNI_contract = 0xD9d31828c9fa04AEcfD41578b58dC44B82485326;
    // https://kovan-explorer.optimism.io/address/0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1
    address public constant new_SynthsSOL_contract = 0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1;
    // https://kovan-explorer.optimism.io/address/0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA
    address public constant new_SynthsAAVE_contract = 0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](23);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(feepool_i);
        contracts[3] = address(synthsusd_i);
        contracts[4] = address(synthseth_i);
        contracts[5] = address(tokenstateseth_i);
        contracts[6] = address(proxyseth_i);
        contracts[7] = address(synthsbtc_i);
        contracts[8] = address(tokenstatesbtc_i);
        contracts[9] = address(proxysbtc_i);
        contracts[10] = address(synthslink_i);
        contracts[11] = address(tokenstateslink_i);
        contracts[12] = address(proxyslink_i);
        contracts[13] = address(synthsuni_i);
        contracts[14] = address(tokenstatesuni_i);
        contracts[15] = address(proxysuni_i);
        contracts[16] = address(synthsaave_i);
        contracts[17] = address(tokenstatesaave_i);
        contracts[18] = address(proxysaave_i);
        contracts[19] = address(synthssol_i);
        contracts[20] = address(tokenstatessol_i);
        contracts[21] = address(proxyssol_i);
        contracts[22] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
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
            ISynthetixNamedContract(new_SynthsUNI_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUNI"
        );
        require(
            ISynthetixNamedContract(new_SynthsSOL_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsSOL"
        );
        require(
            ISynthetixNamedContract(new_SynthsAAVE_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAAVE"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the owner can suspend and resume the protocol;
        systemstatus_updateAccessControls_10();
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_33();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](7);
        addressresolver_importAddresses_names_0_0[0] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[4] = bytes32("SynthsUNI");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthsSOL");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsAAVE");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](7);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_SynthsUNI_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthsSOL_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsAAVE_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xc7d4AF2B7c32ea13ea64911c672C89254251c652);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xe8A28CbD4A1ED50C3Fb955cb5DE0cEf0538540dd);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xe2D65eD9dcE9581113B5dc3faA451d2D3b51ed85);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x71736002ca4fD4FE5E139815915520AE9Ea3428c);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsUNI_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsAAVE_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsSOL_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](1);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function systemstatus_updateAccessControls_10() internal {
        bytes32[] memory systemstatus_updateAccessControls_sections_10_0 = new bytes32[](6);
        systemstatus_updateAccessControls_sections_10_0[0] = bytes32("System");
        systemstatus_updateAccessControls_sections_10_0[1] = bytes32("Issuance");
        systemstatus_updateAccessControls_sections_10_0[2] = bytes32("Exchange");
        systemstatus_updateAccessControls_sections_10_0[3] = bytes32("SynthExchange");
        systemstatus_updateAccessControls_sections_10_0[4] = bytes32("Synth");
        systemstatus_updateAccessControls_sections_10_0[5] = bytes32("Futures");
        address[] memory systemstatus_updateAccessControls_accounts_10_1 = new address[](6);
        systemstatus_updateAccessControls_accounts_10_1[0] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        systemstatus_updateAccessControls_accounts_10_1[1] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        systemstatus_updateAccessControls_accounts_10_1[2] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        systemstatus_updateAccessControls_accounts_10_1[3] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        systemstatus_updateAccessControls_accounts_10_1[4] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        systemstatus_updateAccessControls_accounts_10_1[5] = address(0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94);
        bool[] memory systemstatus_updateAccessControls_canSuspends_10_2 = new bool[](6);
        systemstatus_updateAccessControls_canSuspends_10_2[0] = bool(true);
        systemstatus_updateAccessControls_canSuspends_10_2[1] = bool(true);
        systemstatus_updateAccessControls_canSuspends_10_2[2] = bool(true);
        systemstatus_updateAccessControls_canSuspends_10_2[3] = bool(true);
        systemstatus_updateAccessControls_canSuspends_10_2[4] = bool(true);
        systemstatus_updateAccessControls_canSuspends_10_2[5] = bool(true);
        bool[] memory systemstatus_updateAccessControls_canResumes_10_3 = new bool[](6);
        systemstatus_updateAccessControls_canResumes_10_3[0] = bool(true);
        systemstatus_updateAccessControls_canResumes_10_3[1] = bool(true);
        systemstatus_updateAccessControls_canResumes_10_3[2] = bool(true);
        systemstatus_updateAccessControls_canResumes_10_3[3] = bool(true);
        systemstatus_updateAccessControls_canResumes_10_3[4] = bool(true);
        systemstatus_updateAccessControls_canResumes_10_3[5] = bool(true);
        systemstatus_i.updateAccessControls(
            systemstatus_updateAccessControls_sections_10_0,
            systemstatus_updateAccessControls_accounts_10_1,
            systemstatus_updateAccessControls_canSuspends_10_2,
            systemstatus_updateAccessControls_canResumes_10_3
        );
    }

    function importFeePeriod_0() internal {
        // https://kovan-explorer.optimism.io/address/0xAe35A8BC0e190D4544579a331229e809B2f7ca7b;
        FeePool existingFeePool = FeePool(0xAe35A8BC0e190D4544579a331229e809B2f7ca7b);
        // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C;
        FeePool newFeePool = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
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
        // https://kovan-explorer.optimism.io/address/0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C;
        FeePool newFeePool = FeePool(0x0b0Db6d9403dc56d918781dd74d9A1B7dfE59E7C);
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
        // https://kovan-explorer.optimism.io/address/0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10;
        Synth existingSynth = Synth(0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10);
        // https://kovan-explorer.optimism.io/address/0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9;
        Synth newSynth = Synth(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://kovan-explorer.optimism.io/address/0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1;
        Synth existingSynth = Synth(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        // https://kovan-explorer.optimism.io/address/0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4;
        Synth newSynth = Synth(0x43465ddce92F81321a6e8aE7bf6E0EFb52A349C4);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://kovan-explorer.optimism.io/address/0x66C203BcF339460698c48a2B589eBD91de4984E7;
        Synth existingSynth = Synth(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        // https://kovan-explorer.optimism.io/address/0x62aE6f77610896d60729dcf7a1514dE188E2E838;
        Synth newSynth = Synth(0x62aE6f77610896d60729dcf7a1514dE188E2E838);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan-explorer.optimism.io/address/0xe5671C038739F8D71b11A5F78888e520356BFCD5;
        Synth existingSynth = Synth(0xe5671C038739F8D71b11A5F78888e520356BFCD5);
        // https://kovan-explorer.optimism.io/address/0x98b857df9913D97B5822ad6e9d82e4F71073FD1D;
        Synth newSynth = Synth(0x98b857df9913D97B5822ad6e9d82e4F71073FD1D);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://kovan-explorer.optimism.io/address/0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b;
        Synth existingSynth = Synth(0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b);
        // https://kovan-explorer.optimism.io/address/0xD9d31828c9fa04AEcfD41578b58dC44B82485326;
        Synth newSynth = Synth(0xD9d31828c9fa04AEcfD41578b58dC44B82485326);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://kovan-explorer.optimism.io/address/0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70;
        Synth existingSynth = Synth(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        // https://kovan-explorer.optimism.io/address/0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA;
        Synth newSynth = Synth(0x3eF3722dAF184A73f4c9345e827919c7E12Eb6DA);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sSOL() internal {
        // https://kovan-explorer.optimism.io/address/0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5;
        Synth existingSynth = Synth(0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5);
        // https://kovan-explorer.optimism.io/address/0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1;
        Synth newSynth = Synth(0x07DD3cc86Af31085E3dA1924B9D47FF718F2afC1);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_33() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_33_0 = new ISynth[](7);
        issuer_addSynths_synthsToAdd_33_0[0] = ISynth(0x41fBD15327acFAf9Ab1416339f8e2C1B0b70eFe9);
        issuer_addSynths_synthsToAdd_33_0[1] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_33_0[2] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_33_0[3] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_33_0[4] = ISynth(new_SynthsUNI_contract);
        issuer_addSynths_synthsToAdd_33_0[5] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_33_0[6] = ISynth(new_SynthsSOL_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_33_0);
    }
}

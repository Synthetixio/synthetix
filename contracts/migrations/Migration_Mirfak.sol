pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../FeePoolState.sol";
import "../ProxyERC20.sol";
import "../Proxy.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../SynthetixState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../FeePool.sol";
import "../MultiCollateralSynth.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../ProxyERC20.sol";
import "../MultiCollateralSynth.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../MultiCollateralSynth.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Mirfak is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0xc43b833F93C3896472dED3EfF73311f571e38742
    Proxy public constant proxyfeepool_i = Proxy(0xc43b833F93C3896472dED3EfF73311f571e38742);
    // https://kovan.etherscan.io/address/0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D);
    // https://kovan.etherscan.io/address/0x78b70223d9Fa1a0abE6cD967472Fa04fEf3C7586
    FeePoolState public constant feepoolstate_i = FeePoolState(0x78b70223d9Fa1a0abE6cD967472Fa04fEf3C7586);
    // https://kovan.etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://kovan.etherscan.io/address/0x22f1ba6dB6ca0A065e1b7EAe6FC22b7E675310EF
    Proxy public constant proxysynthetix_i = Proxy(0x22f1ba6dB6ca0A065e1b7EAe6FC22b7E675310EF);
    // https://kovan.etherscan.io/address/0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe
    ExchangeState public constant exchangestate_i = ExchangeState(0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe);
    // https://kovan.etherscan.io/address/0xcf8B3d452A56Dab495dF84905655047BC1Dc41Bc
    SystemStatus public constant systemstatus_i = SystemStatus(0xcf8B3d452A56Dab495dF84905655047BC1Dc41Bc);
    // https://kovan.etherscan.io/address/0x46824bFAaFd049fB0Af9a45159A88e595Bbbb9f7
    TokenState public constant tokenstatesynthetix_i = TokenState(0x46824bFAaFd049fB0Af9a45159A88e595Bbbb9f7);
    // https://kovan.etherscan.io/address/0xAfcBC491B67c01B40f6c077EF53488876a0a0D6E
    SynthetixState public constant synthetixstate_i = SynthetixState(0xAfcBC491B67c01B40f6c077EF53488876a0a0D6E);
    // https://kovan.etherscan.io/address/0x8c6680412e914932A9abC02B6c7cbf690e583aFA
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x8c6680412e914932A9abC02B6c7cbf690e583aFA);
    // https://kovan.etherscan.io/address/0xD29160e4f5D2e5818041f9Cd9192853BA349c47E
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xD29160e4f5D2e5818041f9Cd9192853BA349c47E);
    // https://kovan.etherscan.io/address/0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E
    FeePool public constant feepool_i = FeePool(0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E);
    // https://kovan.etherscan.io/address/0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0);
    // https://kovan.etherscan.io/address/0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF
    TokenState public constant tokenstatesusd_i = TokenState(0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF);
    // https://kovan.etherscan.io/address/0xC674ad732Dfd4E1359ec4B18fA5472c0747E480A
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xC674ad732Dfd4E1359ec4B18fA5472c0747E480A);
    // https://kovan.etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    ProxyERC20 public constant proxyerc20susd_i = ProxyERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://kovan.etherscan.io/address/0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0);
    // https://kovan.etherscan.io/address/0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2
    TokenState public constant tokenstatesbtc_i = TokenState(0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2);
    // https://kovan.etherscan.io/address/0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf);
    // https://kovan.etherscan.io/address/0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68);
    // https://kovan.etherscan.io/address/0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0
    TokenState public constant tokenstateseth_i = TokenState(0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0);
    // https://kovan.etherscan.io/address/0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb);
    // https://kovan.etherscan.io/address/0x26a2356A295bEa8bCA0440a88Eec8605234FdC29
    Issuer public constant issuer_i = Issuer(0x26a2356A295bEa8bCA0440a88Eec8605234FdC29);

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() external pure returns (address[] memory contracts) {
        contracts = new address[](24);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(feepoolstate_i);
        contracts[4] = address(proxyerc20_i);
        contracts[5] = address(proxysynthetix_i);
        contracts[6] = address(exchangestate_i);
        contracts[7] = address(systemstatus_i);
        contracts[8] = address(tokenstatesynthetix_i);
        contracts[9] = address(synthetixstate_i);
        contracts[10] = address(rewardescrow_i);
        contracts[11] = address(rewardsdistribution_i);
        contracts[12] = address(feepool_i);
        contracts[13] = address(synthsusd_i);
        contracts[14] = address(tokenstatesusd_i);
        contracts[15] = address(proxysusd_i);
        contracts[16] = address(proxyerc20susd_i);
        contracts[17] = address(synthsbtc_i);
        contracts[18] = address(tokenstatesbtc_i);
        contracts[19] = address(proxysbtc_i);
        contracts[20] = address(synthseth_i);
        contracts[21] = address(tokenstateseth_i);
        contracts[22] = address(proxyseth_i);
        contracts[23] = address(issuer_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://kovan.etherscan.io/address/0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E
        address new_FeePool_contract = 0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E;
        // https://kovan.etherscan.io/address/0x9CAa994c1de15B13bb9b1C435305AE1e548E0721
        address new_Synthetix_contract = 0x9CAa994c1de15B13bb9b1C435305AE1e548E0721;
        // https://kovan.etherscan.io/address/0x26a2356A295bEa8bCA0440a88Eec8605234FdC29
        address new_Issuer_contract = 0x26a2356A295bEa8bCA0440a88Eec8605234FdC29;
        // https://kovan.etherscan.io/address/0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A
        address new_Exchanger_contract = 0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A;
        // https://kovan.etherscan.io/address/0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8
        address new_DebtCache_contract = 0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8;
        // https://kovan.etherscan.io/address/0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa
        address new_SynthRedeemer_contract = 0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa;
        // https://kovan.etherscan.io/address/0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0
        address new_SynthsUSD_contract = 0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0;
        // https://kovan.etherscan.io/address/0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0
        address new_SynthsBTC_contract = 0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0;
        // https://kovan.etherscan.io/address/0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68
        address new_SynthsETH_contract = 0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68;

        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix",
            "Invalid contract supplied for Synthetix"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithVirtualSynth",
            "Invalid contract supplied for Exchanger"
        );
        require(
            ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache",
            "Invalid contract supplied for DebtCache"
        );
        require(
            ISynthetixNamedContract(new_SynthRedeemer_contract).CONTRACT_NAME() == "SynthRedeemer",
            "Invalid contract supplied for SynthRedeemer"
        );
        require(
            ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUSD"
        );
        require(
            ISynthetixNamedContract(new_SynthsBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsBTC"
        );
        require(
            ISynthetixNamedContract(new_SynthsETH_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsETH"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        addressresolver_i.acceptOwnership();
        proxyfeepool_i.acceptOwnership();
        feepooleternalstorage_i.acceptOwnership();
        feepoolstate_i.acceptOwnership();
        proxyerc20_i.acceptOwnership();
        proxysynthetix_i.acceptOwnership();
        exchangestate_i.acceptOwnership();
        systemstatus_i.acceptOwnership();
        tokenstatesynthetix_i.acceptOwnership();
        synthetixstate_i.acceptOwnership();
        rewardescrow_i.acceptOwnership();
        rewardsdistribution_i.acceptOwnership();
        feepool_i.acceptOwnership();
        synthsusd_i.acceptOwnership();
        tokenstatesusd_i.acceptOwnership();
        proxysusd_i.acceptOwnership();
        proxyerc20susd_i.acceptOwnership();
        synthsbtc_i.acceptOwnership();
        tokenstatesbtc_i.acceptOwnership();
        proxysbtc_i.acceptOwnership();
        synthseth_i.acceptOwnership();
        tokenstateseth_i.acceptOwnership();
        proxyseth_i.acceptOwnership();
        issuer_i.acceptOwnership();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_3();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the FeePool contract can write to its State;
        feepoolstate_i.setFeePool(IFeePool(new_FeePool_contract));
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxyerc20_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the legacy SNX proxy has the correct Synthetix target set;
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
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the special ERC20 proxy for sUSD has its target set to the Synth;
        proxyerc20susd_i.setTarget(Proxyable(new_SynthsUSD_contract));
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_29();
        // Add synths to the Issuer contract - batch 2;
        issuer_addSynths_30();
        // Add synths to the Issuer contract - batch 3;
        issuer_addSynths_31();

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        addressresolver_i.nominateNewOwner(owner);
        proxyfeepool_i.nominateNewOwner(owner);
        feepooleternalstorage_i.nominateNewOwner(owner);
        feepoolstate_i.nominateNewOwner(owner);
        proxyerc20_i.nominateNewOwner(owner);
        proxysynthetix_i.nominateNewOwner(owner);
        exchangestate_i.nominateNewOwner(owner);
        systemstatus_i.nominateNewOwner(owner);
        tokenstatesynthetix_i.nominateNewOwner(owner);
        synthetixstate_i.nominateNewOwner(owner);
        rewardescrow_i.nominateNewOwner(owner);
        rewardsdistribution_i.nominateNewOwner(owner);
        feepool_i.nominateNewOwner(owner);
        synthsusd_i.nominateNewOwner(owner);
        tokenstatesusd_i.nominateNewOwner(owner);
        proxysusd_i.nominateNewOwner(owner);
        proxyerc20susd_i.nominateNewOwner(owner);
        synthsbtc_i.nominateNewOwner(owner);
        tokenstatesbtc_i.nominateNewOwner(owner);
        proxysbtc_i.nominateNewOwner(owner);
        synthseth_i.nominateNewOwner(owner);
        tokenstateseth_i.nominateNewOwner(owner);
        proxyseth_i.nominateNewOwner(owner);
        issuer_i.nominateNewOwner(owner);
    }

    function addressresolver_importAddresses_0() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://kovan.etherscan.io/address/0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E
        address new_FeePool_contract = 0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E;
        // https://kovan.etherscan.io/address/0x9CAa994c1de15B13bb9b1C435305AE1e548E0721
        address new_Synthetix_contract = 0x9CAa994c1de15B13bb9b1C435305AE1e548E0721;
        // https://kovan.etherscan.io/address/0x26a2356A295bEa8bCA0440a88Eec8605234FdC29
        address new_Issuer_contract = 0x26a2356A295bEa8bCA0440a88Eec8605234FdC29;
        // https://kovan.etherscan.io/address/0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A
        address new_Exchanger_contract = 0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A;
        // https://kovan.etherscan.io/address/0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8
        address new_DebtCache_contract = 0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8;
        // https://kovan.etherscan.io/address/0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa
        address new_SynthRedeemer_contract = 0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa;
        // https://kovan.etherscan.io/address/0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0
        address new_SynthsUSD_contract = 0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0;
        // https://kovan.etherscan.io/address/0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0
        address new_SynthsBTC_contract = 0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0;
        // https://kovan.etherscan.io/address/0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68
        address new_SynthsETH_contract = 0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68;

        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](9);
        addressresolver_importAddresses_names_0_0[0] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthRedeemer");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[8] = bytes32("SynthsETH");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](9);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthRedeemer_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_SynthsETH_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_1() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL

        // https://kovan.etherscan.io/address/0x26a2356A295bEa8bCA0440a88Eec8605234FdC29
        address new_Issuer_contract = 0x26a2356A295bEa8bCA0440a88Eec8605234FdC29;
        // https://kovan.etherscan.io/address/0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A
        address new_Exchanger_contract = 0xa7679E25A6DF152691AE8Dbd147E88f0974D6f5A;

        // https://kovan.etherscan.io/address/0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0
        address new_SynthsUSD_contract = 0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0;
        // https://kovan.etherscan.io/address/0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0
        address new_SynthsBTC_contract = 0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0;
        // https://kovan.etherscan.io/address/0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68
        address new_SynthsETH_contract = 0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x0F126120C20A4d696D8D27516C579a605536ba16);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x88021D729298B0D8F59581388b49eAaA2A5CE1D2);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x2a6BCfE6Ef91a7679053875a540737636Ec30E4f);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xeF71dd8EB832D574D35cCBD23cC9e5cde43f92De);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xF7631453c32b8278a5c8bbcC9Fe4c3072d6c25B6);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x857f40aa756e93816a9Fa5ce378762ec8bD13278);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xc6Cd03C78f585076cdF8f6561B7D5FebeeBD9cC2);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xA0544264Ea43FD5A536E5b8d43d7c76C3D6229a7);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xD6f913019bc26ab98911046FFE202141D9d7f2e6);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x908b892d240220D9de9A21db4Fc2f66d0893FadE);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x75408bdC4647Ac7EC3ec5B94a86bA65a91519Bb2);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x550683599b2f8C031F1db911598d16C793B99E51);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xC5301Eb1A4eD3552DFec9C21d966bD25dDe0aD40);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xf4435125fEAC75600d8CC502710A7c4F702E4180);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_2() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x63417fCE3a75eB4FA5Df2a26d8fD82BB952eE9C0);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xD62933a82cDBba32b4CA51309CA2D7000445d0c5);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xCC200785cea662a7fA66E033AA1a4a054022a197);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xfFd76a5fE92Cfe681aEFDEA9FA5C22372D72B510);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xEca41030226Ace8F54D0AF5DbD37C276E100055A);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xbf075BF30c5Fc4929785f0E50eC42078B92DF869);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x6A8a006786819D551eF4f0AbFA9264D2d2A7ff2f);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x130613411D53076923Af9bA1d830205b34126d76);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xEbCdeFe5F392eb16c71a4905fB2720f580e09B88);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x6F4a1312a48D9887Aa8a05c282C387663528Fe05);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xe9a2A90241f0474c460A1e6106b66F8DcB42c851);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x9A71fC5AAa6716b66A44D11B4BBC04bD9F36AE8f);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x75bA0dB0934665E37f57fD0FF2b677cc433696d4);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x95541c84A45d61Ff7aCf2912aa8cb3d7AdD1f6eE);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x07d1503D736B5a5Ef7b19686f34dF6Ca360ce917);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xA8A2Ef65e6E5df51fe30620d639edDCd2dE32A89);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x22f1E84c484132D48dF1848c1D13Ad247d0dc30C);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0xc13E77E4F1a1aF9dF03B26DADd51a31A45eEa5D9);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x99947fA8aeDD08838B4cBa632f590730dCDf808b);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xf796f60c5feE6dEfC55720aE09a1212D0A1d7707);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_3() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://kovan.etherscan.io/address/0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E
        address new_FeePool_contract = 0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E;
        // https://kovan.etherscan.io/address/0x9CAa994c1de15B13bb9b1C435305AE1e548E0721
        address new_Synthetix_contract = 0x9CAa994c1de15B13bb9b1C435305AE1e548E0721;
        // https://kovan.etherscan.io/address/0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8
        address new_DebtCache_contract = 0x45545Ab4a249E93Bd204329b295AFbeDF94E1Fa8;
        // https://kovan.etherscan.io/address/0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa
        address new_SynthRedeemer_contract = 0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](17);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x75928A56B81876eEfE2cE762E06B939648D775Ec);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0xD3E46f5D15ED12f008C9E8727374A24A7F598605);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xd748Fcbb98F1F1943C7d7b5D04e530d2040611FA);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xBBfAd9112203b943f26320B330B75BABF6e2aF2a);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0xD134Db47DDF5A6feB245452af17cCAf92ee53D3c);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(new_SynthRedeemer_contract);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(0xC9985cAc4a69588Da66F74E42845B784798fe5aB);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0x5814d3c40a5A951EFdb4A37Bd93f4407450Cd424);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
        /* solhint-enable no-unused-vars */
    }

    function importFeePeriod_0() internal {
        /* solhint-disable no-unused-vars */

        FeePool existingFeePool = FeePool(0x38635D2501F9ca46106A22bE4aF9B8C08C2B4823);
        FeePool newFeePool = FeePool(0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E);
        (
            uint64 feePeriodId_0,
            uint64 startingDebtIndex_0,
            uint64 startTime_0,
            uint feesToDistribute_0,
            uint feesClaimed_0,
            uint rewardsToDistribute_0,
            uint rewardsClaimed_0
        ) = existingFeePool.recentFeePeriods(0);
        newFeePool.importFeePeriod(
            0,
            feePeriodId_0,
            startingDebtIndex_0,
            startTime_0,
            feesToDistribute_0,
            feesClaimed_0,
            rewardsToDistribute_0,
            rewardsClaimed_0
        );
        /* solhint-enable no-unused-vars */
    }

    function importFeePeriod_1() internal {
        /* solhint-disable no-unused-vars */

        FeePool existingFeePool = FeePool(0x38635D2501F9ca46106A22bE4aF9B8C08C2B4823);
        FeePool newFeePool = FeePool(0x660F51083E8c8eC1aD2771bDAa4104B84b1A793E);
        (
            uint64 feePeriodId_1,
            uint64 startingDebtIndex_1,
            uint64 startTime_1,
            uint feesToDistribute_1,
            uint feesClaimed_1,
            uint rewardsToDistribute_1,
            uint rewardsClaimed_1
        ) = existingFeePool.recentFeePeriods(1);
        newFeePool.importFeePeriod(
            1,
            feePeriodId_1,
            startingDebtIndex_1,
            startTime_1,
            feesToDistribute_1,
            feesClaimed_1,
            rewardsToDistribute_1,
            rewardsClaimed_1
        );
        /* solhint-enable no-unused-vars */
    }

    function copyTotalSupplyFrom_sUSD() internal {
        /* solhint-disable no-unused-vars */

        Synth existingSynth = Synth(0x253E60880f7393B02ef963fB98DD28eaC6a0026E);
        Synth newSynth = Synth(0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function copyTotalSupplyFrom_sBTC() internal {
        /* solhint-disable no-unused-vars */

        Synth existingSynth = Synth(0xa08868E26079c5e4c4334065a7E59192D6b3A33B);
        Synth newSynth = Synth(0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function copyTotalSupplyFrom_sETH() internal {
        /* solhint-disable no-unused-vars */

        Synth existingSynth = Synth(0xce754192eE9265D71b6286Db05329a16F20291CD);
        Synth newSynth = Synth(0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_29() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL

        // https://kovan.etherscan.io/address/0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0
        address new_SynthsUSD_contract = 0x4e890A2aee91ddcaef97410cB45D4C6cBCA583B0;
        // https://kovan.etherscan.io/address/0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0
        address new_SynthsBTC_contract = 0xe9bC4e7AE355c88724C5d43BD89fBDB118B95eb0;
        // https://kovan.etherscan.io/address/0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68
        address new_SynthsETH_contract = 0x75dc07eF40b3fC1045E25EE2bf3FfDD9BE4cCD68;

        ISynth[] memory issuer_addSynths_synthsToAdd_29_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_29_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_29_0[1] = ISynth(0x0F126120C20A4d696D8D27516C579a605536ba16);
        issuer_addSynths_synthsToAdd_29_0[2] = ISynth(0x88021D729298B0D8F59581388b49eAaA2A5CE1D2);
        issuer_addSynths_synthsToAdd_29_0[3] = ISynth(0x2a6BCfE6Ef91a7679053875a540737636Ec30E4f);
        issuer_addSynths_synthsToAdd_29_0[4] = ISynth(0xeF71dd8EB832D574D35cCBD23cC9e5cde43f92De);
        issuer_addSynths_synthsToAdd_29_0[5] = ISynth(0xF7631453c32b8278a5c8bbcC9Fe4c3072d6c25B6);
        issuer_addSynths_synthsToAdd_29_0[6] = ISynth(0x857f40aa756e93816a9Fa5ce378762ec8bD13278);
        issuer_addSynths_synthsToAdd_29_0[7] = ISynth(0xc6Cd03C78f585076cdF8f6561B7D5FebeeBD9cC2);
        issuer_addSynths_synthsToAdd_29_0[8] = ISynth(0xA0544264Ea43FD5A536E5b8d43d7c76C3D6229a7);
        issuer_addSynths_synthsToAdd_29_0[9] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_29_0[10] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_29_0[11] = ISynth(0xD6f913019bc26ab98911046FFE202141D9d7f2e6);
        issuer_addSynths_synthsToAdd_29_0[12] = ISynth(0x908b892d240220D9de9A21db4Fc2f66d0893FadE);
        issuer_addSynths_synthsToAdd_29_0[13] = ISynth(0x75408bdC4647Ac7EC3ec5B94a86bA65a91519Bb2);
        issuer_addSynths_synthsToAdd_29_0[14] = ISynth(0x550683599b2f8C031F1db911598d16C793B99E51);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_29_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_30() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL

        ISynth[] memory issuer_addSynths_synthsToAdd_30_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_30_0[0] = ISynth(0xC5301Eb1A4eD3552DFec9C21d966bD25dDe0aD40);
        issuer_addSynths_synthsToAdd_30_0[1] = ISynth(0xf4435125fEAC75600d8CC502710A7c4F702E4180);
        issuer_addSynths_synthsToAdd_30_0[2] = ISynth(0x63417fCE3a75eB4FA5Df2a26d8fD82BB952eE9C0);
        issuer_addSynths_synthsToAdd_30_0[3] = ISynth(0xD62933a82cDBba32b4CA51309CA2D7000445d0c5);
        issuer_addSynths_synthsToAdd_30_0[4] = ISynth(0xCC200785cea662a7fA66E033AA1a4a054022a197);
        issuer_addSynths_synthsToAdd_30_0[5] = ISynth(0xfFd76a5fE92Cfe681aEFDEA9FA5C22372D72B510);
        issuer_addSynths_synthsToAdd_30_0[6] = ISynth(0xEca41030226Ace8F54D0AF5DbD37C276E100055A);
        issuer_addSynths_synthsToAdd_30_0[7] = ISynth(0xbf075BF30c5Fc4929785f0E50eC42078B92DF869);
        issuer_addSynths_synthsToAdd_30_0[8] = ISynth(0x6A8a006786819D551eF4f0AbFA9264D2d2A7ff2f);
        issuer_addSynths_synthsToAdd_30_0[9] = ISynth(0x130613411D53076923Af9bA1d830205b34126d76);
        issuer_addSynths_synthsToAdd_30_0[10] = ISynth(0xEbCdeFe5F392eb16c71a4905fB2720f580e09B88);
        issuer_addSynths_synthsToAdd_30_0[11] = ISynth(0x6F4a1312a48D9887Aa8a05c282C387663528Fe05);
        issuer_addSynths_synthsToAdd_30_0[12] = ISynth(0xe9a2A90241f0474c460A1e6106b66F8DcB42c851);
        issuer_addSynths_synthsToAdd_30_0[13] = ISynth(0x9A71fC5AAa6716b66A44D11B4BBC04bD9F36AE8f);
        issuer_addSynths_synthsToAdd_30_0[14] = ISynth(0x75bA0dB0934665E37f57fD0FF2b677cc433696d4);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_30_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_31() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL

        ISynth[] memory issuer_addSynths_synthsToAdd_31_0 = new ISynth[](10);
        issuer_addSynths_synthsToAdd_31_0[0] = ISynth(0x95541c84A45d61Ff7aCf2912aa8cb3d7AdD1f6eE);
        issuer_addSynths_synthsToAdd_31_0[1] = ISynth(0x07d1503D736B5a5Ef7b19686f34dF6Ca360ce917);
        issuer_addSynths_synthsToAdd_31_0[2] = ISynth(0xA8A2Ef65e6E5df51fe30620d639edDCd2dE32A89);
        issuer_addSynths_synthsToAdd_31_0[3] = ISynth(0x22f1E84c484132D48dF1848c1D13Ad247d0dc30C);
        issuer_addSynths_synthsToAdd_31_0[4] = ISynth(0xc13E77E4F1a1aF9dF03B26DADd51a31A45eEa5D9);
        issuer_addSynths_synthsToAdd_31_0[5] = ISynth(0x99947fA8aeDD08838B4cBa632f590730dCDf808b);
        issuer_addSynths_synthsToAdd_31_0[6] = ISynth(0xf796f60c5feE6dEfC55720aE09a1212D0A1d7707);
        issuer_addSynths_synthsToAdd_31_0[7] = ISynth(0x75928A56B81876eEfE2cE762E06B939648D775Ec);
        issuer_addSynths_synthsToAdd_31_0[8] = ISynth(0xD3E46f5D15ED12f008C9E8727374A24A7F598605);
        issuer_addSynths_synthsToAdd_31_0[9] = ISynth(0xd748Fcbb98F1F1943C7d7b5D04e530d2040611FA);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_31_0);
        /* solhint-enable no-unused-vars */
    }
}

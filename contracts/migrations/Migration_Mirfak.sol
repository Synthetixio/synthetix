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
import "../legacy/LegacyTokenState.sol";
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
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Mirfak is BaseMigration {
    // https://local.etherscan.io/address/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address public constant OWNER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    // https://local.etherscan.io/address/0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
    AddressResolver public constant addressresolver_i = AddressResolver(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0);
    // https://local.etherscan.io/address/0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
    Proxy public constant proxyfeepool_i = Proxy(0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0);
    // https://local.etherscan.io/address/0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE);
    // https://local.etherscan.io/address/0x3Aa5ebB10DC797CAC828524e59A333d0A371443c
    FeePoolState public constant feepoolstate_i = FeePoolState(0x3Aa5ebB10DC797CAC828524e59A333d0A371443c);
    // https://local.etherscan.io/address/0x59b670e9fA9D0A427751Af201D676719a970857b
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0x59b670e9fA9D0A427751Af201D676719a970857b);
    // https://local.etherscan.io/address/0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f
    Proxy public constant proxysynthetix_i = Proxy(0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f);
    // https://local.etherscan.io/address/0xc5a5C42992dECbae36851359345FE25997F5C42d
    ExchangeState public constant exchangestate_i = ExchangeState(0xc5a5C42992dECbae36851359345FE25997F5C42d);
    // https://local.etherscan.io/address/0x0165878A594ca255338adfa4d48449f69242Eb8F
    SystemStatus public constant systemstatus_i = SystemStatus(0x0165878A594ca255338adfa4d48449f69242Eb8F);
    // https://local.etherscan.io/address/0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1);
    // https://local.etherscan.io/address/0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
    SynthetixState public constant synthetixstate_i = SynthetixState(0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e);
    // https://local.etherscan.io/address/0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
    // https://local.etherscan.io/address/0xc6e7DF5E7b4f2A278906862b61205850344D4e7d
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xc6e7DF5E7b4f2A278906862b61205850344D4e7d);
    // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
    FeePool public constant feepool_i = FeePool(0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3);
    // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x0c626FC4A447b01554518550e30600136864640B);
    // https://local.etherscan.io/address/0x851356ae760d987E095750cCeb3bC6014560891C
    TokenState public constant tokenstatesusd_i = TokenState(0x851356ae760d987E095750cCeb3bC6014560891C);
    // https://local.etherscan.io/address/0xf5059a5D33d5853360D16C683c16e67980206f36
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xf5059a5D33d5853360D16C683c16e67980206f36);
    // https://local.etherscan.io/address/0x95401dc811bb5740090279Ba06cfA8fcF6113778
    ProxyERC20 public constant proxyerc20susd_i = ProxyERC20(0x95401dc811bb5740090279Ba06cfA8fcF6113778);
    // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94);
    // https://local.etherscan.io/address/0x922D6956C99E12DFeB3224DEA977D0939758A1Fe
    TokenState public constant tokenstateseth_i = TokenState(0x922D6956C99E12DFeB3224DEA977D0939758A1Fe);
    // https://local.etherscan.io/address/0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f);
    // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
    Issuer public constant issuer_i = Issuer(0x7Cf4be31f546c04787886358b9486ca3d62B9acf);

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() external pure returns (address[] memory contracts) {
        contracts = new address[](21);
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
        contracts[17] = address(synthseth_i);
        contracts[18] = address(tokenstateseth_i);
        contracts[19] = address(proxyseth_i);
        contracts[20] = address(issuer_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix",
            "Invalid contract supplied for Synthetix"
        );
        require(
            ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache",
            "Invalid contract supplied for DebtCache"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithVirtualSynth",
            "Invalid contract supplied for Exchanger"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
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
        copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_34();
        // Add synths to the Issuer contract - batch 2;
        issuer_addSynths_35();
        // Add synths to the Issuer contract - batch 3;
        issuer_addSynths_36();

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        addressresolver_i.nominateNewOwner(owner);
        proxyfeepool_i.nominateNewOwner(owner);
        feepooleternalstorage_i.nominateNewOwner(owner);
        feepoolstate_i.nominateNewOwner(owner);
        proxyerc20_i.nominateNewOwner(owner);
        proxysynthetix_i.nominateNewOwner(owner);
        exchangestate_i.nominateNewOwner(owner);
        systemstatus_i.nominateNewOwner(owner);
        tokenstatesynthetix_i.nominateOwner(owner);
        synthetixstate_i.nominateNewOwner(owner);
        rewardescrow_i.nominateNewOwner(owner);
        rewardsdistribution_i.nominateNewOwner(owner);
        feepool_i.nominateNewOwner(owner);
        synthsusd_i.nominateNewOwner(owner);
        tokenstatesusd_i.nominateNewOwner(owner);
        proxysusd_i.nominateNewOwner(owner);
        proxyerc20susd_i.nominateNewOwner(owner);
        synthseth_i.nominateNewOwner(owner);
        tokenstateseth_i.nominateNewOwner(owner);
        proxyseth_i.nominateNewOwner(owner);
        issuer_i.nominateNewOwner(owner);
    }

    function addressresolver_importAddresses_0() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](8);
        addressresolver_importAddresses_names_0_0[0] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthRedeemer");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsETH");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](8);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthRedeemer_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsETH_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_1() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x8A791620dd6260079BF849Dc5567aDC3F2FdC318);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x9d4454B023096f34B160D6B654540c56A1F81688);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x809d550fca64d94Bd9F66E60752A544199cfAC3D);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x82e01223d51Eb87e16A03E24687EDF0F294da6f1);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xcbEAF3BDe82155F56486Fb5a1072cb8baAf547cc);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x162A433068F51e18b7d13932F27e66a3f99E6890);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x4C4a2f8c81640e47606d3fd77B353E87Ba015584);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x36b58F5C1969B7b6591D752ea6F5486D069010AB);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x4EE6eCAD1c2Dae9f525404De8555724e3c35d07B);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xC9a43158891282A2B1475592D5719c001986Aaec);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_2() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x4C2F7092C2aE51D986bEFEe378e50BD4dB99C901);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x4631BCAbD6dF18D94796344963cB60d44a4136b6);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xf953b3A269d80e3eB0F2947630Da976B896A8C5b);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x18E317A7D70d8fBf8e6E893616b52390EbBdb629);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xD5ac451B0c50B9476107823Af206eD814a2e2580);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xc96304e3c037f81dA488ed9dEa1D8F2a48278a75);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x07882Ae1ecB7429a84f1D53048d35c4bB2056877);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xfaAddC93baf78e89DCf37bA67943E1bE8F37Bb8c);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x3155755b79aA083bd953911C92705B7aA82a18F9);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x3aAde2dCD2Df6a8cAc689EE797591b2913658659);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x1f10F3Ba7ACB61b2F50B9d6DdCf91a6f787C0E82);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x38a024C0b412B9d1db8BC398140D00F5Af3093D4);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x2a810409872AfC346F9B5b26571Fd6eC42EA4849);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x40918Ba7f132E0aCba2CE4de4c4baF9BD2D7D849);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0x99dBE4AEa58E518C50a1c04aE9b48C9F6354612f);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0xB0f05d25e41FbC2b52013099ED9616f1206Ae21B);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x927b167526bAbB9be047421db732C663a0b77B11);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x02b0B4EFd909240FCB2Eb5FAe060dC60D112E3a4);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0x6C2d83262fF84cBaDb3e416D527403135D757892);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_3() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x0B306BF915C4d645ff596e518fAf3F9669b97016);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x9E545E3C0baAB3E08CdfD552C960A1050f373042);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x6F6f570F45833E249e27022648a26F4076F48f78);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0xa513E6E4b8f2a923D98304ec87F64353C4D5C853);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(new_SynthRedeemer_contract);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xD42912755319665397FF090fBB63B1a31aE87Cee);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0x5FeaeBfB4439F3516c74939A9D04e95AFE82C4ae);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
        /* solhint-enable no-unused-vars */
    }

    function importFeePeriod_0() internal {
        /* solhint-disable no-unused-vars */

        FeePool existingFeePool = FeePool(0x666D0c3da3dBc946D5128D06115bb4eed4595580);
        FeePool newFeePool = FeePool(0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3);
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

        FeePool existingFeePool = FeePool(0x666D0c3da3dBc946D5128D06115bb4eed4595580);
        FeePool newFeePool = FeePool(0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3);
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

        Synth existingSynth = Synth(0x286B8DecD5ED79c962b2d8F4346CD97FF0E2C352);
        Synth newSynth = Synth(0x0c626FC4A447b01554518550e30600136864640B);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function copyTotalSupplyFrom_sETH() internal {
        /* solhint-disable no-unused-vars */

        Synth existingSynth = Synth(0xb868Cc77A95a65F42611724AF05Aa2d3B6Ec05F2);
        Synth newSynth = Synth(0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_34() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        ISynth[] memory issuer_addSynths_synthsToAdd_34_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_34_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_34_0[1] = ISynth(0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf);
        issuer_addSynths_synthsToAdd_34_0[2] = ISynth(0x9d4454B023096f34B160D6B654540c56A1F81688);
        issuer_addSynths_synthsToAdd_34_0[3] = ISynth(0x809d550fca64d94Bd9F66E60752A544199cfAC3D);
        issuer_addSynths_synthsToAdd_34_0[4] = ISynth(0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154);
        issuer_addSynths_synthsToAdd_34_0[5] = ISynth(0x82e01223d51Eb87e16A03E24687EDF0F294da6f1);
        issuer_addSynths_synthsToAdd_34_0[6] = ISynth(0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650);
        issuer_addSynths_synthsToAdd_34_0[7] = ISynth(0xcbEAF3BDe82155F56486Fb5a1072cb8baAf547cc);
        issuer_addSynths_synthsToAdd_34_0[8] = ISynth(0x162A433068F51e18b7d13932F27e66a3f99E6890);
        issuer_addSynths_synthsToAdd_34_0[9] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_34_0[10] = ISynth(0x4C4a2f8c81640e47606d3fd77B353E87Ba015584);
        issuer_addSynths_synthsToAdd_34_0[11] = ISynth(0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43);
        issuer_addSynths_synthsToAdd_34_0[12] = ISynth(0x36b58F5C1969B7b6591D752ea6F5486D069010AB);
        issuer_addSynths_synthsToAdd_34_0[13] = ISynth(0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB);
        issuer_addSynths_synthsToAdd_34_0[14] = ISynth(0x4EE6eCAD1c2Dae9f525404De8555724e3c35d07B);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_34_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_35() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        ISynth[] memory issuer_addSynths_synthsToAdd_35_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_35_0[0] = ISynth(0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5);
        issuer_addSynths_synthsToAdd_35_0[1] = ISynth(0xC9a43158891282A2B1475592D5719c001986Aaec);
        issuer_addSynths_synthsToAdd_35_0[2] = ISynth(0x4C2F7092C2aE51D986bEFEe378e50BD4dB99C901);
        issuer_addSynths_synthsToAdd_35_0[3] = ISynth(0x4631BCAbD6dF18D94796344963cB60d44a4136b6);
        issuer_addSynths_synthsToAdd_35_0[4] = ISynth(0xf953b3A269d80e3eB0F2947630Da976B896A8C5b);
        issuer_addSynths_synthsToAdd_35_0[5] = ISynth(0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3);
        issuer_addSynths_synthsToAdd_35_0[6] = ISynth(0x18E317A7D70d8fBf8e6E893616b52390EbBdb629);
        issuer_addSynths_synthsToAdd_35_0[7] = ISynth(0xD5ac451B0c50B9476107823Af206eD814a2e2580);
        issuer_addSynths_synthsToAdd_35_0[8] = ISynth(0xc96304e3c037f81dA488ed9dEa1D8F2a48278a75);
        issuer_addSynths_synthsToAdd_35_0[9] = ISynth(0x07882Ae1ecB7429a84f1D53048d35c4bB2056877);
        issuer_addSynths_synthsToAdd_35_0[10] = ISynth(0xfaAddC93baf78e89DCf37bA67943E1bE8F37Bb8c);
        issuer_addSynths_synthsToAdd_35_0[11] = ISynth(0x3155755b79aA083bd953911C92705B7aA82a18F9);
        issuer_addSynths_synthsToAdd_35_0[12] = ISynth(0x3aAde2dCD2Df6a8cAc689EE797591b2913658659);
        issuer_addSynths_synthsToAdd_35_0[13] = ISynth(0x1f10F3Ba7ACB61b2F50B9d6DdCf91a6f787C0E82);
        issuer_addSynths_synthsToAdd_35_0[14] = ISynth(0x38a024C0b412B9d1db8BC398140D00F5Af3093D4);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_35_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_36() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://local.etherscan.io/address/0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3
        address new_FeePool_contract = 0x70E5370b8981Abc6e14C91F4AcE823954EFC8eA3;
        // https://local.etherscan.io/address/0x4000F8820522AC96C4221b299876e3e53bCc8525
        address new_Synthetix_contract = 0x4000F8820522AC96C4221b299876e3e53bCc8525;
        // https://local.etherscan.io/address/0x9338CA7d556248055f5751d85cDA7aD6eF254433
        address new_DebtCache_contract = 0x9338CA7d556248055f5751d85cDA7aD6eF254433;
        // https://local.etherscan.io/address/0x9c65f85425c619A6cB6D29fF8d57ef696323d188
        address new_Exchanger_contract = 0x9c65f85425c619A6cB6D29fF8d57ef696323d188;
        // https://local.etherscan.io/address/0x7Cf4be31f546c04787886358b9486ca3d62B9acf
        address new_Issuer_contract = 0x7Cf4be31f546c04787886358b9486ca3d62B9acf;
        // https://local.etherscan.io/address/0x33E45b187da34826aBCEDA1039231Be46f1b05Af
        address new_SynthRedeemer_contract = 0x33E45b187da34826aBCEDA1039231Be46f1b05Af;
        // https://local.etherscan.io/address/0x0c626FC4A447b01554518550e30600136864640B
        address new_SynthsUSD_contract = 0x0c626FC4A447b01554518550e30600136864640B;
        // https://local.etherscan.io/address/0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94
        address new_SynthsETH_contract = 0xA21DDc1f17dF41589BC6A5209292AED2dF61Cc94;

        ISynth[] memory issuer_addSynths_synthsToAdd_36_0 = new ISynth[](3);
        issuer_addSynths_synthsToAdd_36_0[0] = ISynth(0x2a810409872AfC346F9B5b26571Fd6eC42EA4849);
        issuer_addSynths_synthsToAdd_36_0[1] = ISynth(0x40918Ba7f132E0aCba2CE4de4c4baF9BD2D7D849);
        issuer_addSynths_synthsToAdd_36_0[2] = ISynth(0x99dBE4AEa58E518C50a1c04aE9b48C9F6354612f);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_36_0);
        /* solhint-enable no-unused-vars */
    }
}

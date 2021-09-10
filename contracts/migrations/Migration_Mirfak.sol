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
import "../Proxy.sol";
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
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

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
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0xC011A72400E58ecD99Ee497CF89E3775d4bd732F
    Proxy public constant proxysynthetix_i = Proxy(0xC011A72400E58ecD99Ee497CF89E3775d4bd732F);
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
    // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
    FeePool public constant feepool_i = FeePool(0x510adfDF6E7554C571b7Cd9305Ce91473610015e);
    // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b);
    // https://etherscan.io/address/0x05a9CBe762B36632b3594DA4F082340E0e5343e8
    TokenState public constant tokenstatesusd_i = TokenState(0x05a9CBe762B36632b3594DA4F082340E0e5343e8);
    // https://etherscan.io/address/0x57Ab1E02fEE23774580C119740129eAC7081e9D3
    Proxy public constant proxysusd_i = Proxy(0x57Ab1E02fEE23774580C119740129eAC7081e9D3);
    // https://etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    ProxyERC20 public constant proxyerc20susd_i = ProxyERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9);
    // https://etherscan.io/address/0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67
    TokenState public constant tokenstatesbtc_i = TokenState(0x4F6296455F8d754c19821cF1EC8FeBF2cD456E67);
    // https://etherscan.io/address/0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6);
    // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
    Issuer public constant issuer_i = Issuer(0x922C84B3894298296C34842D866BfC0d36C54778);

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
        contracts[17] = address(synthsbtc_i);
        contracts[18] = address(tokenstatesbtc_i);
        contracts[19] = address(proxysbtc_i);
        contracts[20] = address(issuer_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

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
            ISynthetixNamedContract(new_SynthsBTC_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsBTC"
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 4;
        addressresolver_rebuildCaches_4();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 5;
        addressresolver_rebuildCaches_5();
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_35();
        // Add synths to the Issuer contract - batch 2;
        issuer_addSynths_36();
        // Add synths to the Issuer contract - batch 3;
        issuer_addSynths_37();
        // Add synths to the Issuer contract - batch 4;
        issuer_addSynths_38();
        // Add synths to the Issuer contract - batch 5;
        issuer_addSynths_39();

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
        synthsbtc_i.nominateNewOwner(owner);
        tokenstatesbtc_i.nominateNewOwner(owner);
        proxysbtc_i.nominateNewOwner(owner);
        issuer_i.nominateNewOwner(owner);
    }

    function addressresolver_importAddresses_0() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](8);
        addressresolver_importAddresses_names_0_0[0] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[1] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[2] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthRedeemer");
        addressresolver_importAddresses_names_0_0[6] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[7] = bytes32("SynthsBTC");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](8);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthRedeemer_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_SynthsBTC_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_1() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xC61b352fCc311Ae6B0301459A970150005e74b3E);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x388fD1A8a7d36e03eFA1ab100a1c5159a3A3d427);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x37B648a07476F4941D3D647f81118AFd55fa8a04);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xEF285D339c91aDf1dD7DE0aEAa6250805FD68258);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xcf9bB94b5d65589039607BA66e3DAC686d3eFf01);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xCeC4e038371d32212C6Dcdf36Fdbcb6F8a34C6d8);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x5eDf7dd83fE2889D264fa9D3b93d0a6e6A45D6C6);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x9745606DA6e162866DAD7bF80f2AbF145EDD7571);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x2962EA4E749e54b10CFA557770D597027BA67cB3);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xab4e760fEEe20C5c2509061b995e06b542D3112B);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xda3c83750b1FA31Fda838136ef3f853b41cb7a5a);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x47bD14817d7684082E04934878EE2Dd3576Ae19d);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x6F927644d55E32318629198081923894FbFe5c07);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xe3D5E1c1bA874C0fF3BA31b999967F24d5ca04e5);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0xA962208CDC8588F9238fae169d0F63306c353F4F);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_2() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xcd980Fc5CcdAe62B18A52b83eC64200121A929db);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xAf090d6E583C082f2011908cf95c2518BE7A53ac);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x21ee4afBd6c151fD9A69c1389598170B1d45E0e3);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xcb6Cb218D558ae7fF6415f95BDA6616FCFF669Cb);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x7B29C9e188De18563B19d162374ce6836F31415a);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xC22e51FA362654ea453B4018B616ef6f6ab3b779);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xaB38249f4f56Ef868F6b5E01D9cFa26B952c1270);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xAa1b12E3e5F70aBCcd1714F4260A74ca21e7B17b);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x0F393ce493d8FB0b83915248a21a3104932ed97c);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xfD0435A588BF5c5a6974BA19Fa627b772833d4eb);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x4287dac1cC7434991119Eba7413189A66fFE65cF);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x34c76BC146b759E58886e821D62548AC1e0BA7Bc);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0x0E8Fa2339314AB7E164818F26207897bBe29C3af);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0xe615Df79AC987193561f37E77465bEC2aEfe9aDb);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x3E2dA260B4A85782A629320EB027A3B7c28eA9f1);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(0xc02DD182Ce029E6d7f78F37492DFd39E4FEB1f8b);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x0d1c4e5C07B071aa4E6A14A604D4F6478cAAC7B4);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x13D0F5B8630520eA04f694F17A001fb95eaFD30E);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x815CeF3b7773f35428B4353073B086ecB658f73C);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0xb0e0BA880775B7F2ba813b3800b3979d719F0379);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_3() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0x8e082925e78538955bC0e2F363FC5d1Ab3be739b);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0x399BA516a6d68d6Ad4D5f3999902D0DeAcaACDdd);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0x9530FA32a3059114AC20A5812870Da12D97d1174);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(0x249612F641111022f2f48769f3Df5D85cb3E26a2);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0x04720DbBD4599aD26811545595d97fB813E84964);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(0x2acfe6265D358d982cB1c3B521199973CD443C71);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(0x46A7Af405093B27DA6DeF193C508Bd9240A255FA);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0x8350d1b2d6EF5289179fe49E5b0F208165B4e32e);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0x29DD4A59F4D339226867e77aF211724eaBb45c02);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xf7B8dF8b16dA302d85603B8e7F95111a768458Cc);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0x0517A56da8A517e3b2D484Cc5F1Da4BDCfE68ec3);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0x099CfAd1640fc7EA686ab1D83F0A285Ba0470882);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(0x19cC1f63e344D74A87D955E3F3E95B28DDDc61d8);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0x4D50A0e5f068ACdC80A1da2dd1f0Ad48845df2F8);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0xb73c665825dAa926D6ef09417FbE5654473c1b49);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(0x806A599d60B2FdBda379D5890287D2fba1026cC0);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0xCea42504874586a718954746A564B72bc7eba3E3);
        addressresolver_rebuildCaches_destinations_3_0[17] = MixinResolver(0x947d5656725fB9A8f9c826A91b6082b07E2745B7);
        addressresolver_rebuildCaches_destinations_3_0[18] = MixinResolver(0x186E56A62E7caCE1308f1A1B0dbb27f33F80f16f);
        addressresolver_rebuildCaches_destinations_3_0[19] = MixinResolver(0x931c5516EE121a177bD2B60e0122Da5B27630ABc);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_4() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_4_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_4_0[0] = MixinResolver(0x6Dc6a64724399524184C2c44a526A2cff1BaA507);
        addressresolver_rebuildCaches_destinations_4_0[1] = MixinResolver(0x87eb6e935e3C7E3E3A0E31a5658498bC87dE646E);
        addressresolver_rebuildCaches_destinations_4_0[2] = MixinResolver(0x53869BDa4b8d85aEDCC9C6cAcf015AF9447Cade7);
        addressresolver_rebuildCaches_destinations_4_0[3] = MixinResolver(0x1cB27Ac646afAE192dF9928A2808C0f7f586Af7d);
        addressresolver_rebuildCaches_destinations_4_0[4] = MixinResolver(0x3dD7b893c25025CabFBd290A5E06BaFF3DE335b8);
        addressresolver_rebuildCaches_destinations_4_0[5] = MixinResolver(0x1A4505543C92084bE57ED80113eaB7241171e7a8);
        addressresolver_rebuildCaches_destinations_4_0[6] = MixinResolver(0xF6ce55E09De0F9F97210aAf6DB88Ed6b6792Ca1f);
        addressresolver_rebuildCaches_destinations_4_0[7] = MixinResolver(0xacAAB69C2BA65A2DB415605F309007e18D4F5E8C);
        addressresolver_rebuildCaches_destinations_4_0[8] = MixinResolver(0x9A5Ea0D8786B8d17a70410A905Aed1443fae5A38);
        addressresolver_rebuildCaches_destinations_4_0[9] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_4_0[10] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_4_0[11] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_4_0[12] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_4_0[13] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_4_0[14] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_4_0[15] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_4_0[16] = MixinResolver(0xCd9D4988C0AE61887B075bA77f08cbFAd2b65068);
        addressresolver_rebuildCaches_destinations_4_0[17] = MixinResolver(0xd69b189020EF614796578AfE4d10378c5e7e1138);
        addressresolver_rebuildCaches_destinations_4_0[18] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_4_0[19] = MixinResolver(new_DebtCache_contract);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_4_0);
        /* solhint-enable no-unused-vars */
    }

    function addressresolver_rebuildCaches_5() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        MixinResolver[] memory addressresolver_rebuildCaches_destinations_5_0 = new MixinResolver[](2);
        addressresolver_rebuildCaches_destinations_5_0[0] = MixinResolver(new_SynthRedeemer_contract);
        addressresolver_rebuildCaches_destinations_5_0[1] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_5_0);
        /* solhint-enable no-unused-vars */
    }

    function importFeePeriod_0() internal {
        /* solhint-disable no-unused-vars */

        FeePool existingFeePool = FeePool(0xcf9E60005C9aca983caf65d3669a24fDd0775fc0);
        FeePool newFeePool = FeePool(0x510adfDF6E7554C571b7Cd9305Ce91473610015e);
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

        FeePool existingFeePool = FeePool(0xcf9E60005C9aca983caf65d3669a24fDd0775fc0);
        FeePool newFeePool = FeePool(0x510adfDF6E7554C571b7Cd9305Ce91473610015e);
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

        Synth existingSynth = Synth(0x4D8dBD193d89b7B506BE5dC9Db75B91dA00D6a1d);
        Synth newSynth = Synth(0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function copyTotalSupplyFrom_sBTC() internal {
        /* solhint-disable no-unused-vars */

        Synth existingSynth = Synth(0xDB91E4B3b6E19bF22E810C43273eae48C9037e74);
        Synth newSynth = Synth(0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9);
        newSynth.setTotalSupply(existingSynth.totalSupply());
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_35() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        ISynth[] memory issuer_addSynths_synthsToAdd_35_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_35_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_35_0[1] = ISynth(0xC61b352fCc311Ae6B0301459A970150005e74b3E);
        issuer_addSynths_synthsToAdd_35_0[2] = ISynth(0x388fD1A8a7d36e03eFA1ab100a1c5159a3A3d427);
        issuer_addSynths_synthsToAdd_35_0[3] = ISynth(0x37B648a07476F4941D3D647f81118AFd55fa8a04);
        issuer_addSynths_synthsToAdd_35_0[4] = ISynth(0xEF285D339c91aDf1dD7DE0aEAa6250805FD68258);
        issuer_addSynths_synthsToAdd_35_0[5] = ISynth(0xcf9bB94b5d65589039607BA66e3DAC686d3eFf01);
        issuer_addSynths_synthsToAdd_35_0[6] = ISynth(0xCeC4e038371d32212C6Dcdf36Fdbcb6F8a34C6d8);
        issuer_addSynths_synthsToAdd_35_0[7] = ISynth(0x5eDf7dd83fE2889D264fa9D3b93d0a6e6A45D6C6);
        issuer_addSynths_synthsToAdd_35_0[8] = ISynth(0x9745606DA6e162866DAD7bF80f2AbF145EDD7571);
        issuer_addSynths_synthsToAdd_35_0[9] = ISynth(0x2962EA4E749e54b10CFA557770D597027BA67cB3);
        issuer_addSynths_synthsToAdd_35_0[10] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_35_0[11] = ISynth(0xab4e760fEEe20C5c2509061b995e06b542D3112B);
        issuer_addSynths_synthsToAdd_35_0[12] = ISynth(0xda3c83750b1FA31Fda838136ef3f853b41cb7a5a);
        issuer_addSynths_synthsToAdd_35_0[13] = ISynth(0x47bD14817d7684082E04934878EE2Dd3576Ae19d);
        issuer_addSynths_synthsToAdd_35_0[14] = ISynth(0x6F927644d55E32318629198081923894FbFe5c07);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_35_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_36() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        ISynth[] memory issuer_addSynths_synthsToAdd_36_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_36_0[0] = ISynth(0xe3D5E1c1bA874C0fF3BA31b999967F24d5ca04e5);
        issuer_addSynths_synthsToAdd_36_0[1] = ISynth(0xA962208CDC8588F9238fae169d0F63306c353F4F);
        issuer_addSynths_synthsToAdd_36_0[2] = ISynth(0xcd980Fc5CcdAe62B18A52b83eC64200121A929db);
        issuer_addSynths_synthsToAdd_36_0[3] = ISynth(0xAf090d6E583C082f2011908cf95c2518BE7A53ac);
        issuer_addSynths_synthsToAdd_36_0[4] = ISynth(0x21ee4afBd6c151fD9A69c1389598170B1d45E0e3);
        issuer_addSynths_synthsToAdd_36_0[5] = ISynth(0xcb6Cb218D558ae7fF6415f95BDA6616FCFF669Cb);
        issuer_addSynths_synthsToAdd_36_0[6] = ISynth(0x7B29C9e188De18563B19d162374ce6836F31415a);
        issuer_addSynths_synthsToAdd_36_0[7] = ISynth(0xC22e51FA362654ea453B4018B616ef6f6ab3b779);
        issuer_addSynths_synthsToAdd_36_0[8] = ISynth(0xaB38249f4f56Ef868F6b5E01D9cFa26B952c1270);
        issuer_addSynths_synthsToAdd_36_0[9] = ISynth(0xAa1b12E3e5F70aBCcd1714F4260A74ca21e7B17b);
        issuer_addSynths_synthsToAdd_36_0[10] = ISynth(0x0F393ce493d8FB0b83915248a21a3104932ed97c);
        issuer_addSynths_synthsToAdd_36_0[11] = ISynth(0xfD0435A588BF5c5a6974BA19Fa627b772833d4eb);
        issuer_addSynths_synthsToAdd_36_0[12] = ISynth(0x4287dac1cC7434991119Eba7413189A66fFE65cF);
        issuer_addSynths_synthsToAdd_36_0[13] = ISynth(0x34c76BC146b759E58886e821D62548AC1e0BA7Bc);
        issuer_addSynths_synthsToAdd_36_0[14] = ISynth(0x0E8Fa2339314AB7E164818F26207897bBe29C3af);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_36_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_37() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        ISynth[] memory issuer_addSynths_synthsToAdd_37_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_37_0[0] = ISynth(0xe615Df79AC987193561f37E77465bEC2aEfe9aDb);
        issuer_addSynths_synthsToAdd_37_0[1] = ISynth(0x3E2dA260B4A85782A629320EB027A3B7c28eA9f1);
        issuer_addSynths_synthsToAdd_37_0[2] = ISynth(0xc02DD182Ce029E6d7f78F37492DFd39E4FEB1f8b);
        issuer_addSynths_synthsToAdd_37_0[3] = ISynth(0x0d1c4e5C07B071aa4E6A14A604D4F6478cAAC7B4);
        issuer_addSynths_synthsToAdd_37_0[4] = ISynth(0x13D0F5B8630520eA04f694F17A001fb95eaFD30E);
        issuer_addSynths_synthsToAdd_37_0[5] = ISynth(0x815CeF3b7773f35428B4353073B086ecB658f73C);
        issuer_addSynths_synthsToAdd_37_0[6] = ISynth(0xb0e0BA880775B7F2ba813b3800b3979d719F0379);
        issuer_addSynths_synthsToAdd_37_0[7] = ISynth(0x8e082925e78538955bC0e2F363FC5d1Ab3be739b);
        issuer_addSynths_synthsToAdd_37_0[8] = ISynth(0x399BA516a6d68d6Ad4D5f3999902D0DeAcaACDdd);
        issuer_addSynths_synthsToAdd_37_0[9] = ISynth(0x9530FA32a3059114AC20A5812870Da12D97d1174);
        issuer_addSynths_synthsToAdd_37_0[10] = ISynth(0x249612F641111022f2f48769f3Df5D85cb3E26a2);
        issuer_addSynths_synthsToAdd_37_0[11] = ISynth(0x04720DbBD4599aD26811545595d97fB813E84964);
        issuer_addSynths_synthsToAdd_37_0[12] = ISynth(0x2acfe6265D358d982cB1c3B521199973CD443C71);
        issuer_addSynths_synthsToAdd_37_0[13] = ISynth(0x46A7Af405093B27DA6DeF193C508Bd9240A255FA);
        issuer_addSynths_synthsToAdd_37_0[14] = ISynth(0x8350d1b2d6EF5289179fe49E5b0F208165B4e32e);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_37_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_38() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        ISynth[] memory issuer_addSynths_synthsToAdd_38_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_38_0[0] = ISynth(0x29DD4A59F4D339226867e77aF211724eaBb45c02);
        issuer_addSynths_synthsToAdd_38_0[1] = ISynth(0xf7B8dF8b16dA302d85603B8e7F95111a768458Cc);
        issuer_addSynths_synthsToAdd_38_0[2] = ISynth(0x0517A56da8A517e3b2D484Cc5F1Da4BDCfE68ec3);
        issuer_addSynths_synthsToAdd_38_0[3] = ISynth(0x099CfAd1640fc7EA686ab1D83F0A285Ba0470882);
        issuer_addSynths_synthsToAdd_38_0[4] = ISynth(0x19cC1f63e344D74A87D955E3F3E95B28DDDc61d8);
        issuer_addSynths_synthsToAdd_38_0[5] = ISynth(0x4D50A0e5f068ACdC80A1da2dd1f0Ad48845df2F8);
        issuer_addSynths_synthsToAdd_38_0[6] = ISynth(0xb73c665825dAa926D6ef09417FbE5654473c1b49);
        issuer_addSynths_synthsToAdd_38_0[7] = ISynth(0x806A599d60B2FdBda379D5890287D2fba1026cC0);
        issuer_addSynths_synthsToAdd_38_0[8] = ISynth(0xCea42504874586a718954746A564B72bc7eba3E3);
        issuer_addSynths_synthsToAdd_38_0[9] = ISynth(0x947d5656725fB9A8f9c826A91b6082b07E2745B7);
        issuer_addSynths_synthsToAdd_38_0[10] = ISynth(0x186E56A62E7caCE1308f1A1B0dbb27f33F80f16f);
        issuer_addSynths_synthsToAdd_38_0[11] = ISynth(0x931c5516EE121a177bD2B60e0122Da5B27630ABc);
        issuer_addSynths_synthsToAdd_38_0[12] = ISynth(0x6Dc6a64724399524184C2c44a526A2cff1BaA507);
        issuer_addSynths_synthsToAdd_38_0[13] = ISynth(0x87eb6e935e3C7E3E3A0E31a5658498bC87dE646E);
        issuer_addSynths_synthsToAdd_38_0[14] = ISynth(0x53869BDa4b8d85aEDCC9C6cAcf015AF9447Cade7);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_38_0);
        /* solhint-enable no-unused-vars */
    }

    function issuer_addSynths_39() internal {
        /* solhint-disable no-unused-vars */

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x510adfDF6E7554C571b7Cd9305Ce91473610015e
        address new_FeePool_contract = 0x510adfDF6E7554C571b7Cd9305Ce91473610015e;
        // https://etherscan.io/address/0x54f25546260C7539088982bcF4b7dC8EDEF19f21
        address new_Synthetix_contract = 0x54f25546260C7539088982bcF4b7dC8EDEF19f21;
        // https://etherscan.io/address/0xe92B4c7428152052B0930c81F4c687a5F1A12292
        address new_DebtCache_contract = 0xe92B4c7428152052B0930c81F4c687a5F1A12292;
        // https://etherscan.io/address/0x7634F2A1741a683ccda37Dce864c187F990D7B4b
        address new_Exchanger_contract = 0x7634F2A1741a683ccda37Dce864c187F990D7B4b;
        // https://etherscan.io/address/0x922C84B3894298296C34842D866BfC0d36C54778
        address new_Issuer_contract = 0x922C84B3894298296C34842D866BfC0d36C54778;
        // https://etherscan.io/address/0xe533139Af961c9747356D947838c98451015e234
        address new_SynthRedeemer_contract = 0xe533139Af961c9747356D947838c98451015e234;
        // https://etherscan.io/address/0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b
        address new_SynthsUSD_contract = 0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b;
        // https://etherscan.io/address/0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9
        address new_SynthsBTC_contract = 0xC8a5f06858a1B49A7F703EacD433A1444a5e5bd9;

        ISynth[] memory issuer_addSynths_synthsToAdd_39_0 = new ISynth[](6);
        issuer_addSynths_synthsToAdd_39_0[0] = ISynth(0x1cB27Ac646afAE192dF9928A2808C0f7f586Af7d);
        issuer_addSynths_synthsToAdd_39_0[1] = ISynth(0x3dD7b893c25025CabFBd290A5E06BaFF3DE335b8);
        issuer_addSynths_synthsToAdd_39_0[2] = ISynth(0x1A4505543C92084bE57ED80113eaB7241171e7a8);
        issuer_addSynths_synthsToAdd_39_0[3] = ISynth(0xF6ce55E09De0F9F97210aAf6DB88Ed6b6792Ca1f);
        issuer_addSynths_synthsToAdd_39_0[4] = ISynth(0xacAAB69C2BA65A2DB415605F309007e18D4F5E8C);
        issuer_addSynths_synthsToAdd_39_0[5] = ISynth(0x9A5Ea0D8786B8d17a70410A905Aed1443fae5A38);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_39_0);
        /* solhint-enable no-unused-vars */
    }
}

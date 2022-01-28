pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../ProxyERC20.sol";
import "../ProxyERC20.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../SynthetixState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alsephina is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0xc43b833F93C3896472dED3EfF73311f571e38742
    Proxy public constant proxyfeepool_i = Proxy(0xc43b833F93C3896472dED3EfF73311f571e38742);
    // https://kovan.etherscan.io/address/0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D);
    // https://kovan.etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://kovan.etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
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
    // https://kovan.etherscan.io/address/0xEb3A9651cFaE0eCAECCf8c8b0581A6311F6C5921
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0xEb3A9651cFaE0eCAECCf8c8b0581A6311F6C5921);
    // https://kovan.etherscan.io/address/0x47247c67E761d885965B880C0d6a42c350862c63
    SystemSettings public constant systemsettings_i = SystemSettings(0x47247c67E761d885965B880C0d6a42c350862c63);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan.etherscan.io/address/0x34305B62550E0c652e697736E0BC93e67aB9b67B
    address public constant new_SystemSettingsLib_contract = 0x34305B62550E0c652e697736E0BC93e67aB9b67B;
    // https://kovan.etherscan.io/address/0x47247c67E761d885965B880C0d6a42c350862c63
    address public constant new_SystemSettings_contract = 0x47247c67E761d885965B880C0d6a42c350862c63;
    // https://kovan.etherscan.io/address/0xEb3A9651cFaE0eCAECCf8c8b0581A6311F6C5921
    address public constant new_ExchangeRates_contract = 0xEb3A9651cFaE0eCAECCf8c8b0581A6311F6C5921;
    // https://kovan.etherscan.io/address/0x1c4811F6FDd6a8F7F26A1d11191Ab5F95Abf6E1E
    address public constant new_Exchanger_contract = 0x1c4811F6FDd6a8F7F26A1d11191Ab5F95Abf6E1E;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](13);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyfeepool_i);
        contracts[2] = address(feepooleternalstorage_i);
        contracts[3] = address(proxyerc20_i);
        contracts[4] = address(proxysynthetix_i);
        contracts[5] = address(exchangestate_i);
        contracts[6] = address(systemstatus_i);
        contracts[7] = address(tokenstatesynthetix_i);
        contracts[8] = address(synthetixstate_i);
        contracts[9] = address(rewardescrow_i);
        contracts[10] = address(rewardsdistribution_i);
        contracts[11] = address(exchangerates_i);
        contracts[12] = address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
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
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Exchanger contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_Exchanger_contract, true, false);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x31f93DA9823d737b7E44bdee0DF389Fe62Fd1AcD);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x9326BFA02ADD2366b30bacB125260Af641031331);
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0x0c15Ab9A0DB086e062194c273CC79f41597Bbf13);
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xD627B1eF3AC23F1d3e576FA6206126F3c1Bd0942);
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x5813A90f826e16dB392abd2aF7966313fc1fd5B8);
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x28b0061f44E6A9780224AA61BEc8C3Fcb0d37de9);
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x9e465c5499023675051517E9Ee5f4C334D91e369);
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0xed0616BeF04D374969f302a34AE4A63882490A8C);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0x6135b13325bfC4B00278B4abC5e20bbce2D6580e);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x9326BFA02ADD2366b30bacB125260Af641031331);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x396c5E36DD0a0F5a5D33dae44368D4193f69a1F0);
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0x70179FB2F3A0a5b7FfB36a235599De440B0922ea);
        // Set exchange dynamic fee threshold (SIP-184);
        systemsettings_i.setExchangeDynamicFeeThreshold(4000000000000000);
        // Set exchange dynamic fee weight decay (SIP-184);
        systemsettings_i.setExchangeDynamicFeeWeightDecay(900000000000000000);
        // Set exchange dynamic fee rounds (SIP-184);
        systemsettings_i.setExchangeDynamicFeeRounds(10);
        // Set exchange max dynamic fee (SIP-184);
        systemsettings_i.setExchangeMaxDynamicFee(50000000000000000);

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](4);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettingsLib");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[2] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](4);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettingsLib_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x0b6f83DB2dE6cDc3cB57DC0ED79D07267F6fdc2A);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xa4Ac258D9796f079443be218AAA4428824172851);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x6B4D3e213e10d9238c1a1A87E493687cc2eb1DD0);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xB98c6031344EB6007e94A8eDbc0ee28C13c66290);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x26b814c9fA4C0512D84373f80d4B92408CD13960);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x880477aE972Ca606cC7D47496E077514e978231B);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x0D9D97E38d19885441f8be74fE88C3294300C866);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x376684744fb828D67B1659f6D3D754938dc1Ec4b);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](9);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xe2d39AB610fEe4C7FC591003553c7557C880eD04);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x56a8953C03FC8b859140D5C6f7e7f24dD611d419);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x69A9d122654E6FA8BE179462ff4553D6419a60fE);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xBBfAd9112203b943f26320B330B75BABF6e2aF2a);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0xD134Db47DDF5A6feB245452af17cCAf92ee53D3c);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xf59A5D8Af09848Cd8bcFBF14A4a5A2323d0dE83c);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}

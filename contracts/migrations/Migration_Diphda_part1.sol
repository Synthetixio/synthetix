pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../SystemStatus.sol";
import "../Proxy.sol";
import "../FeePoolEternalStorage.sol";
import "../ExchangeState.sol";
import "../RewardEscrow.sol";
import "../FeePool.sol";
import "../DebtCache.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../MultiCollateralSynth.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../ProxyERC20.sol";
import "../Issuer.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Diphda_part1 is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0x24398a935e9649EA212b7a05DCdcB7dadF640579
    SystemStatus public constant systemstatus_i = SystemStatus(0x24398a935e9649EA212b7a05DCdcB7dadF640579);
    // https://kovan.etherscan.io/address/0xc43b833F93C3896472dED3EfF73311f571e38742
    Proxy public constant proxyfeepool_i = Proxy(0xc43b833F93C3896472dED3EfF73311f571e38742);
    // https://kovan.etherscan.io/address/0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D);
    // https://kovan.etherscan.io/address/0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe
    ExchangeState public constant exchangestate_i = ExchangeState(0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe);
    // https://kovan.etherscan.io/address/0x8c6680412e914932A9abC02B6c7cbf690e583aFA
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x8c6680412e914932A9abC02B6c7cbf690e583aFA);
    // https://kovan.etherscan.io/address/0xE83C187915BE184950014db5413D93cd1A6900f7
    FeePool public constant feepool_i = FeePool(0xE83C187915BE184950014db5413D93cd1A6900f7);
    // https://kovan.etherscan.io/address/0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55
    DebtCache public constant debtcache_i = DebtCache(0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55);
    // https://kovan.etherscan.io/address/0x19669E19253c7B69C1ff0c03Ce6356c34EA354e6
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x19669E19253c7B69C1ff0c03Ce6356c34EA354e6);
    // https://kovan.etherscan.io/address/0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a);
    // https://kovan.etherscan.io/address/0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF
    TokenState public constant tokenstatesusd_i = TokenState(0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF);
    // https://kovan.etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://kovan.etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    ProxyERC20 public constant proxyerc20susd_i = ProxyERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://kovan.etherscan.io/address/0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8
    Issuer public constant issuer_i = Issuer(0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan.etherscan.io/address/0x815957a4B8c35FA25De5259DaA95489Bb441578D
    address public constant new_ext_AggregatorIssuedSynths_contract = 0x815957a4B8c35FA25De5259DaA95489Bb441578D;
    // https://kovan.etherscan.io/address/0x0fD4e2cFD3909247C9fdb00c631FeaE3420e94f9
    address public constant new_ext_AggregatorDebtRatio_contract = 0x0fD4e2cFD3909247C9fdb00c631FeaE3420e94f9;
    // https://kovan.etherscan.io/address/0x19669E19253c7B69C1ff0c03Ce6356c34EA354e6
    address public constant new_ExchangeRates_contract = 0x19669E19253c7B69C1ff0c03Ce6356c34EA354e6;
    // https://kovan.etherscan.io/address/0x24398a935e9649EA212b7a05DCdcB7dadF640579
    address public constant new_SystemStatus_contract = 0x24398a935e9649EA212b7a05DCdcB7dadF640579;
    // https://kovan.etherscan.io/address/0xE83C187915BE184950014db5413D93cd1A6900f7
    address public constant new_FeePool_contract = 0xE83C187915BE184950014db5413D93cd1A6900f7;
    // https://kovan.etherscan.io/address/0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55
    address public constant new_DebtCache_contract = 0x41EE9D25b1a72064892Dfb2F90ED451CAFFd0E55;
    // https://kovan.etherscan.io/address/0x8C64bd4371070B9476505816e6911ca6829f55FB
    address public constant new_Exchanger_contract = 0x8C64bd4371070B9476505816e6911ca6829f55FB;
    // https://kovan.etherscan.io/address/0x88dB124f40c6E7CcBfeE655617250F00F9E5dd9b
    address public constant new_ExchangeCircuitBreaker_contract = 0x88dB124f40c6E7CcBfeE655617250F00F9E5dd9b;
    // https://kovan.etherscan.io/address/0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8
    address public constant new_Issuer_contract = 0xb5c4AE8116D41e4724A9b562C2ae07e0bed895e8;
    // https://kovan.etherscan.io/address/0xc500cb57A23bAC85e793691440114D35FA4Eda82
    address public constant new_SynthetixBridgeToOptimism_contract = 0xc500cb57A23bAC85e793691440114D35FA4Eda82;
    // https://kovan.etherscan.io/address/0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a
    address public constant new_SynthsUSD_contract = 0x1C2cbB4019918bF518Bb0B59D56533ed3bB8563a;
    // https://kovan.etherscan.io/address/0xBE7A6623752a4217045A62dc0fbe56db35757738
    address public constant new_FuturesMarketManager_contract = 0xBE7A6623752a4217045A62dc0fbe56db35757738;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](13);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(systemstatus_i);
        contracts[2] = address(proxyfeepool_i);
        contracts[3] = address(feepooleternalstorage_i);
        contracts[4] = address(exchangestate_i);
        contracts[5] = address(rewardescrow_i);
        contracts[6] = address(feepool_i);
        contracts[7] = address(debtcache_i);
        contracts[8] = address(exchangerates_i);
        contracts[9] = address(synthsusd_i);
        contracts[10] = address(tokenstatesusd_i);
        contracts[11] = address(proxysusd_i);
        contracts[12] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        // require(ISynthetixNamedContract(new_SystemStatus_contract).CONTRACT_NAME() == "SystemStatus", "Invalid contract supplied for SystemStatus");
        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_DebtCache_contract).CONTRACT_NAME() == "DebtCache",
            "Invalid contract supplied for DebtCache"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "ExchangerWithFeeRecAlternatives",
            "Invalid contract supplied for Exchanger"
        );
        require(
            ISynthetixNamedContract(new_ExchangeCircuitBreaker_contract).CONTRACT_NAME() == "ExchangeCircuitBreaker",
            "Invalid contract supplied for ExchangeCircuitBreaker"
        );
        require(
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        // require(ISynthetixNamedContract(new_SynthetixBridgeToOptimism_contract).CONTRACT_NAME() == "SynthetixBridgeToOptimism", "Invalid contract supplied for SynthetixBridgeToOptimism");
        require(
            ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUSD"
        );
        // require(ISynthetixNamedContract(new_FuturesMarketManager_contract).CONTRACT_NAME() == "EmptyFuturesMarketManager", "Invalid contract supplied for FuturesMarketManager");

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
        systemstatus_updateAccessControls_11();
        // Ensure the ProxyFeePool contract has the correct FeePool target set;
        proxyfeepool_i.setTarget(Proxyable(new_FeePool_contract));
        // Ensure the FeePool contract can write to its EternalStorage;
        feepooleternalstorage_i.setAssociatedContract(new_FeePool_contract);
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the ExchangeCircuitBreaker contract can suspend synths - see SIP-65;
        systemstatus_i.updateAccessControl("Synth", new_ExchangeCircuitBreaker_contract, true, false);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the legacy RewardEscrow contract is connected to the FeePool contract;
        rewardescrow_i.setFeePool(IFeePool(new_FeePool_contract));
        // Import fee period from existing fee pool at index 0;
        importFeePeriod_0();
        // Import fee period from existing fee pool at index 1;
        importFeePeriod_1();
        // Import excluded-debt records from existing DebtCache;
        debtcache_i.importExcludedIssuedDebts(
            IDebtCache(0x0b6f83DB2dE6cDc3cB57DC0ED79D07267F6fdc2A),
            IIssuer(0xD0B60E2FAb47e703ffa0da7364Efb9536C430912)
        );
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x31f93DA9823d737b7E44bdee0DF389Fe62Fd1AcD);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x9326BFA02ADD2366b30bacB125260Af641031331);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the special ERC20 proxy for sUSD has its target set to the Synth;
        proxyerc20susd_i.setTarget(Proxyable(new_SynthsUSD_contract));
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_37();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](12);
        addressresolver_importAddresses_names_0_0[0] = bytes32("ext:AggregatorIssuedSynths");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ext:AggregatorDebtRatio");
        addressresolver_importAddresses_names_0_0[2] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[3] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_0_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[5] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[6] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[7] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_0_0[8] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthetixBridgeToOptimism");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[11] = bytes32("FuturesMarketManager");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](12);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ext_AggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ext_AggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthetixBridgeToOptimism_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_FuturesMarketManager_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_ExchangeCircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xAa1Cc6433be4EB877a4b5C087c95f5004e640F19);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x26b814c9fA4C0512D84373f80d4B92408CD13960);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x880477aE972Ca606cC7D47496E077514e978231B);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x0D9D97E38d19885441f8be74fE88C3294300C866);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x376684744fb828D67B1659f6D3D754938dc1Ec4b);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](10);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xe2d39AB610fEe4C7FC591003553c7557C880eD04);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x56a8953C03FC8b859140D5C6f7e7f24dD611d419);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_SynthetixBridgeToOptimism_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x6B4D3e213e10d9238c1a1A87E493687cc2eb1DD0);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xBBfAd9112203b943f26320B330B75BABF6e2aF2a);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x0f46148D93b52e2B503fE84897609913Cba42B7A);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function systemstatus_updateAccessControls_11() internal {
        bytes32[] memory systemstatus_updateAccessControls_sections_11_0 = new bytes32[](6);
        systemstatus_updateAccessControls_sections_11_0[0] = bytes32("System");
        systemstatus_updateAccessControls_sections_11_0[1] = bytes32("Issuance");
        systemstatus_updateAccessControls_sections_11_0[2] = bytes32("Exchange");
        systemstatus_updateAccessControls_sections_11_0[3] = bytes32("SynthExchange");
        systemstatus_updateAccessControls_sections_11_0[4] = bytes32("Synth");
        systemstatus_updateAccessControls_sections_11_0[5] = bytes32("Futures");
        address[] memory systemstatus_updateAccessControls_accounts_11_1 = new address[](6);
        systemstatus_updateAccessControls_accounts_11_1[0] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_11_1[1] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_11_1[2] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_11_1[3] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_11_1[4] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_11_1[5] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        bool[] memory systemstatus_updateAccessControls_canSuspends_11_2 = new bool[](6);
        systemstatus_updateAccessControls_canSuspends_11_2[0] = bool(true);
        systemstatus_updateAccessControls_canSuspends_11_2[1] = bool(true);
        systemstatus_updateAccessControls_canSuspends_11_2[2] = bool(true);
        systemstatus_updateAccessControls_canSuspends_11_2[3] = bool(true);
        systemstatus_updateAccessControls_canSuspends_11_2[4] = bool(true);
        systemstatus_updateAccessControls_canSuspends_11_2[5] = bool(true);
        bool[] memory systemstatus_updateAccessControls_canResumes_11_3 = new bool[](6);
        systemstatus_updateAccessControls_canResumes_11_3[0] = bool(true);
        systemstatus_updateAccessControls_canResumes_11_3[1] = bool(true);
        systemstatus_updateAccessControls_canResumes_11_3[2] = bool(true);
        systemstatus_updateAccessControls_canResumes_11_3[3] = bool(true);
        systemstatus_updateAccessControls_canResumes_11_3[4] = bool(true);
        systemstatus_updateAccessControls_canResumes_11_3[5] = bool(true);
        systemstatus_i.updateAccessControls(
            systemstatus_updateAccessControls_sections_11_0,
            systemstatus_updateAccessControls_accounts_11_1,
            systemstatus_updateAccessControls_canSuspends_11_2,
            systemstatus_updateAccessControls_canResumes_11_3
        );
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

    function issuer_addSynths_37() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_37_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_37_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_37_0[1] = ISynth(0x26b814c9fA4C0512D84373f80d4B92408CD13960);
        issuer_addSynths_synthsToAdd_37_0[2] = ISynth(0x880477aE972Ca606cC7D47496E077514e978231B);
        issuer_addSynths_synthsToAdd_37_0[3] = ISynth(0x0D9D97E38d19885441f8be74fE88C3294300C866);
        issuer_addSynths_synthsToAdd_37_0[4] = ISynth(0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4);
        issuer_addSynths_synthsToAdd_37_0[5] = ISynth(0x376684744fb828D67B1659f6D3D754938dc1Ec4b);
        issuer_addSynths_synthsToAdd_37_0[6] = ISynth(0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e);
        issuer_addSynths_synthsToAdd_37_0[7] = ISynth(0xe2d39AB610fEe4C7FC591003553c7557C880eD04);
        issuer_addSynths_synthsToAdd_37_0[8] = ISynth(0x56a8953C03FC8b859140D5C6f7e7f24dD611d419);
        issuer_addSynths_synthsToAdd_37_0[9] = ISynth(0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf);
        issuer_addSynths_synthsToAdd_37_0[10] = ISynth(0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_37_0);
    }
}

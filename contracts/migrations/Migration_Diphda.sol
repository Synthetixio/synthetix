pragma solidity ^0.5.16;

import "./MigrationLib_Diphda.sol";

// solhint-disable contract-name-camelcase
contract Migration_Diphda is BaseMigration {
    // https://kovan.etherscan.io/address/0x73570075092502472E4b61A7058Df1A4a1DB12f2;
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan.etherscan.io/address/0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6
    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    // https://kovan.etherscan.io/address/0x648727A32112e6C233c1c5d8d57A9AA736FfB18B
    SystemStatus public constant systemstatus_i = SystemStatus(0x648727A32112e6C233c1c5d8d57A9AA736FfB18B);
    // https://kovan.etherscan.io/address/0xc43b833F93C3896472dED3EfF73311f571e38742
    Proxy public constant proxyfeepool_i = Proxy(0xc43b833F93C3896472dED3EfF73311f571e38742);
    // https://kovan.etherscan.io/address/0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D);
    // https://kovan.etherscan.io/address/0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe
    ExchangeState public constant exchangestate_i = ExchangeState(0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe);
    // https://kovan.etherscan.io/address/0x8c6680412e914932A9abC02B6c7cbf690e583aFA
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x8c6680412e914932A9abC02B6c7cbf690e583aFA);
    // https://kovan.etherscan.io/address/0x42B340961496731B0c4337E2A600087A2368DfCF
    FeePool public constant feepool_i = FeePool(0x42B340961496731B0c4337E2A600087A2368DfCF);
    // https://kovan.etherscan.io/address/0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07
    DebtCache public constant debtcache_i = DebtCache(0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07);
    // https://kovan.etherscan.io/address/0x8F630b584765E30fF08A55BF436D84041674196E
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0x8F630b584765E30fF08A55BF436D84041674196E);
    // https://kovan.etherscan.io/address/0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226);
    // https://kovan.etherscan.io/address/0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF
    TokenState public constant tokenstatesusd_i = TokenState(0x9aF5763Dc180f388A5fd20Dd7BA4B2790566f2eF);
    // https://kovan.etherscan.io/address/0x57Ab1ec28D129707052df4dF418D58a2D46d5f51
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    // https://kovan.etherscan.io/address/0xB26c16491869Eb115362CE6dd456C4786bf10B3E
    MultiCollateralSynth public constant synthseur_i = MultiCollateralSynth(0xB26c16491869Eb115362CE6dd456C4786bf10B3E);
    // https://kovan.etherscan.io/address/0x4f719F0346636B9Dc23B092F637de2A66A254420
    TokenState public constant tokenstateseur_i = TokenState(0x4f719F0346636B9Dc23B092F637de2A66A254420);
    // https://kovan.etherscan.io/address/0x57E8Bd85F3d8De4557739bc3C5ee0f4bfC931528
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0x57E8Bd85F3d8De4557739bc3C5ee0f4bfC931528);
    // https://kovan.etherscan.io/address/0x151af739E74589320C3Db8852C806F28073928B1
    MultiCollateralSynth public constant synthsjpy_i = MultiCollateralSynth(0x151af739E74589320C3Db8852C806F28073928B1);
    // https://kovan.etherscan.io/address/0x310705B7FecA92C2445D7471706e058653D9f989
    TokenState public constant tokenstatesjpy_i = TokenState(0x310705B7FecA92C2445D7471706e058653D9f989);
    // https://kovan.etherscan.io/address/0xCcC5c7625c90FC93D2508723e60281E6DE535166
    ProxyERC20 public constant proxysjpy_i = ProxyERC20(0xCcC5c7625c90FC93D2508723e60281E6DE535166);
    // https://kovan.etherscan.io/address/0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426
    MultiCollateralSynth public constant synthsaud_i = MultiCollateralSynth(0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426);
    // https://kovan.etherscan.io/address/0xDDEfe42790f2dEC7b0C37D4399884eFceA5361b1
    TokenState public constant tokenstatesaud_i = TokenState(0xDDEfe42790f2dEC7b0C37D4399884eFceA5361b1);
    // https://kovan.etherscan.io/address/0x4e5D412141145767F7db90c22bd0240a85da0B73
    ProxyERC20 public constant proxysaud_i = ProxyERC20(0x4e5D412141145767F7db90c22bd0240a85da0B73);
    // https://kovan.etherscan.io/address/0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56
    MultiCollateralSynth public constant synthsgbp_i = MultiCollateralSynth(0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56);
    // https://kovan.etherscan.io/address/0x3DdF5dAd59F8F8e8f957709B044eE84e87B42e25
    TokenState public constant tokenstatesgbp_i = TokenState(0x3DdF5dAd59F8F8e8f957709B044eE84e87B42e25);
    // https://kovan.etherscan.io/address/0x41d49b1ac182C9d2c8dDf8b450342DE2Ac03aC19
    ProxyERC20 public constant proxysgbp_i = ProxyERC20(0x41d49b1ac182C9d2c8dDf8b450342DE2Ac03aC19);
    // https://kovan.etherscan.io/address/0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85
    MultiCollateralSynth public constant synthskrw_i = MultiCollateralSynth(0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85);
    // https://kovan.etherscan.io/address/0x780476375FEE186824Bdabc9bDA71433017Fd591
    TokenState public constant tokenstateskrw_i = TokenState(0x780476375FEE186824Bdabc9bDA71433017Fd591);
    // https://kovan.etherscan.io/address/0xb02C0F5D8fDAD1242dceca095328dc8213A8349C
    ProxyERC20 public constant proxyskrw_i = ProxyERC20(0xb02C0F5D8fDAD1242dceca095328dc8213A8349C);
    // https://kovan.etherscan.io/address/0xdFd88Db048F5dBe7a42593556E607675C6D912f5
    MultiCollateralSynth public constant synthschf_i = MultiCollateralSynth(0xdFd88Db048F5dBe7a42593556E607675C6D912f5);
    // https://kovan.etherscan.io/address/0xEf58E3aC7F34649B640fb04188642B5e062Fa3Be
    TokenState public constant tokenstateschf_i = TokenState(0xEf58E3aC7F34649B640fb04188642B5e062Fa3Be);
    // https://kovan.etherscan.io/address/0x8E23100f9C9bd442f5bAc6A927f49B284E390Df4
    ProxyERC20 public constant proxyschf_i = ProxyERC20(0x8E23100f9C9bd442f5bAc6A927f49B284E390Df4);
    // https://kovan.etherscan.io/address/0x894235628D36aA617ad5EE49A3763b287F506204
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x894235628D36aA617ad5EE49A3763b287F506204);
    // https://kovan.etherscan.io/address/0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2
    TokenState public constant tokenstatesbtc_i = TokenState(0x029E1687c7BB8ead5Ab02DB390eB82b87b2D54a2);
    // https://kovan.etherscan.io/address/0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x3Aa2d4A15aA7F50158DEEAE0208F862a461f19Cf);
    // https://kovan.etherscan.io/address/0x821621D141584dB05aE9593f6E42BfC6ebA90462
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x821621D141584dB05aE9593f6E42BfC6ebA90462);
    // https://kovan.etherscan.io/address/0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0
    TokenState public constant tokenstateseth_i = TokenState(0xFbB6526ed92DA8915d4843a86166020d0B7bAAd0);
    // https://kovan.etherscan.io/address/0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x54c4B5cb58C880DD1734123c8b588e49eDf442Fb);
    // https://kovan.etherscan.io/address/0x23d4b4D2318aFAA26205c21192696aDb64BA86c2
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x23d4b4D2318aFAA26205c21192696aDb64BA86c2);
    // https://kovan.etherscan.io/address/0x89656EF0A87fD947A181189209F6525E91D91f46
    TokenState public constant tokenstateslink_i = TokenState(0x89656EF0A87fD947A181189209F6525E91D91f46);
    // https://kovan.etherscan.io/address/0x3a4A90a2D8cBA26F2e32C4a6e6d01ffBfCE8DBB4
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0x3a4A90a2D8cBA26F2e32C4a6e6d01ffBfCE8DBB4);
    // https://kovan.etherscan.io/address/0xA86F796336C821340619174dB7B46c4d492AF2A4
    MultiCollateralSynth public constant synthsdefi_i = MultiCollateralSynth(0xA86F796336C821340619174dB7B46c4d492AF2A4);
    // https://kovan.etherscan.io/address/0xa8eE3730031f28a4a4a3Ed28A3308d83cabd9Ce1
    TokenState public constant tokenstatesdefi_i = TokenState(0xa8eE3730031f28a4a4a3Ed28A3308d83cabd9Ce1);
    // https://kovan.etherscan.io/address/0xf91b2d345838922b26c8899483be3f867eeaFAb5
    ProxyERC20 public constant proxysdefi_i = ProxyERC20(0xf91b2d345838922b26c8899483be3f867eeaFAb5);
    // https://kovan.etherscan.io/address/0xCD783bEB541a410BF25329DcEBDeAa431c33dFEA
    Issuer public constant issuer_i = Issuer(0xCD783bEB541a410BF25329DcEBDeAa431c33dFEA);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan.etherscan.io/address/0x126576EB6B604D734621629Deea7F951E55Fcc00
    address public constant new_OneNetAggregatorIssuedSynths_contract = 0x126576EB6B604D734621629Deea7F951E55Fcc00;
    // https://kovan.etherscan.io/address/0x1636e633fe03CAD6a0459b557D2C74A2210c5Cd6
    address public constant new_OneNetAggregatorDebtRatio_contract = 0x1636e633fe03CAD6a0459b557D2C74A2210c5Cd6;
    // https://kovan.etherscan.io/address/0x648727A32112e6C233c1c5d8d57A9AA736FfB18B
    address public constant new_SystemStatus_contract = 0x648727A32112e6C233c1c5d8d57A9AA736FfB18B;
    // https://kovan.etherscan.io/address/0x8F630b584765E30fF08A55BF436D84041674196E
    address public constant new_ExchangeRates_contract = 0x8F630b584765E30fF08A55BF436D84041674196E;
    // https://kovan.etherscan.io/address/0x42B340961496731B0c4337E2A600087A2368DfCF
    address public constant new_FeePool_contract = 0x42B340961496731B0c4337E2A600087A2368DfCF;
    // https://kovan.etherscan.io/address/0x4bd5B027679E630e11BE8F34a0354ee88c3e84db
    address public constant new_ExchangeCircuitBreaker_contract = 0x4bd5B027679E630e11BE8F34a0354ee88c3e84db;
    // https://kovan.etherscan.io/address/0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07
    address public constant new_DebtCache_contract = 0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07;
    // https://kovan.etherscan.io/address/0xFFa5bEc38dF933E062e4BC890A04beA4c43f4378
    address public constant new_Exchanger_contract = 0xFFa5bEc38dF933E062e4BC890A04beA4c43f4378;
    // https://kovan.etherscan.io/address/0xCD783bEB541a410BF25329DcEBDeAa431c33dFEA
    address public constant new_Issuer_contract = 0xCD783bEB541a410BF25329DcEBDeAa431c33dFEA;
    // https://kovan.etherscan.io/address/0x8f9D085D1bdfB6c05a4Cd82553e871B3e61e70CD
    address public constant new_SynthetixBridgeToOptimism_contract = 0x8f9D085D1bdfB6c05a4Cd82553e871B3e61e70CD;
    // https://kovan.etherscan.io/address/0x151af739E74589320C3Db8852C806F28073928B1
    address public constant new_SynthsJPY_contract = 0x151af739E74589320C3Db8852C806F28073928B1;
    // https://kovan.etherscan.io/address/0xB26c16491869Eb115362CE6dd456C4786bf10B3E
    address public constant new_SynthsEUR_contract = 0xB26c16491869Eb115362CE6dd456C4786bf10B3E;
    // https://kovan.etherscan.io/address/0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226
    address public constant new_SynthsUSD_contract = 0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226;
    // https://kovan.etherscan.io/address/0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426
    address public constant new_SynthsAUD_contract = 0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426;
    // https://kovan.etherscan.io/address/0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56
    address public constant new_SynthsGBP_contract = 0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56;
    // https://kovan.etherscan.io/address/0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85
    address public constant new_SynthsKRW_contract = 0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85;
    // https://kovan.etherscan.io/address/0xdFd88Db048F5dBe7a42593556E607675C6D912f5
    address public constant new_SynthsCHF_contract = 0xdFd88Db048F5dBe7a42593556E607675C6D912f5;
    // https://kovan.etherscan.io/address/0x821621D141584dB05aE9593f6E42BfC6ebA90462
    address public constant new_SynthsETH_contract = 0x821621D141584dB05aE9593f6E42BfC6ebA90462;
    // https://kovan.etherscan.io/address/0x894235628D36aA617ad5EE49A3763b287F506204
    address public constant new_SynthsBTC_contract = 0x894235628D36aA617ad5EE49A3763b287F506204;
    // https://kovan.etherscan.io/address/0x23d4b4D2318aFAA26205c21192696aDb64BA86c2
    address public constant new_SynthsLINK_contract = 0x23d4b4D2318aFAA26205c21192696aDb64BA86c2;
    // https://kovan.etherscan.io/address/0xA86F796336C821340619174dB7B46c4d492AF2A4
    address public constant new_SynthsDEFI_contract = 0xA86F796336C821340619174dB7B46c4d492AF2A4;
    // https://kovan.etherscan.io/address/0x012A86834cd1600dC405fa1C7022425a484E34ea
    address public constant new_FuturesMarketManager_contract = 0x012A86834cd1600dC405fa1C7022425a484E34ea;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](43);
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
        contracts[12] = address(synthseur_i);
        contracts[13] = address(tokenstateseur_i);
        contracts[14] = address(proxyseur_i);
        contracts[15] = address(synthsjpy_i);
        contracts[16] = address(tokenstatesjpy_i);
        contracts[17] = address(proxysjpy_i);
        contracts[18] = address(synthsaud_i);
        contracts[19] = address(tokenstatesaud_i);
        contracts[20] = address(proxysaud_i);
        contracts[21] = address(synthsgbp_i);
        contracts[22] = address(tokenstatesgbp_i);
        contracts[23] = address(proxysgbp_i);
        contracts[24] = address(synthskrw_i);
        contracts[25] = address(tokenstateskrw_i);
        contracts[26] = address(proxyskrw_i);
        contracts[27] = address(synthschf_i);
        contracts[28] = address(tokenstateschf_i);
        contracts[29] = address(proxyschf_i);
        contracts[30] = address(synthsbtc_i);
        contracts[31] = address(tokenstatesbtc_i);
        contracts[32] = address(proxysbtc_i);
        contracts[33] = address(synthseth_i);
        contracts[34] = address(tokenstateseth_i);
        contracts[35] = address(proxyseth_i);
        contracts[36] = address(synthslink_i);
        contracts[37] = address(tokenstateslink_i);
        contracts[38] = address(proxyslink_i);
        contracts[39] = address(synthsdefi_i);
        contracts[40] = address(tokenstatesdefi_i);
        contracts[41] = address(proxysdefi_i);
        contracts[42] = address(issuer_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRatesWithDexPricing",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_FeePool_contract).CONTRACT_NAME() == "FeePool",
            "Invalid contract supplied for FeePool"
        );
        require(
            ISynthetixNamedContract(new_ExchangeCircuitBreaker_contract).CONTRACT_NAME() == "ExchangeCircuitBreaker",
            "Invalid contract supplied for ExchangeCircuitBreaker"
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
            ISynthetixNamedContract(new_Issuer_contract).CONTRACT_NAME() == "Issuer",
            "Invalid contract supplied for Issuer"
        );
        require(
            ISynthetixNamedContract(new_SynthsJPY_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsJPY"
        );
        require(
            ISynthetixNamedContract(new_SynthsEUR_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsEUR"
        );
        require(
            ISynthetixNamedContract(new_SynthsUSD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsUSD"
        );
        require(
            ISynthetixNamedContract(new_SynthsAUD_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsAUD"
        );
        require(
            ISynthetixNamedContract(new_SynthsGBP_contract).CONTRACT_NAME() == "MultiCollateralSynth",
            "Invalid contract supplied for SynthsGBP"
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the owner can suspend and resume the protocol;
        systemstatus_updateAccessControls_21();
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

        // Call migration library split
        MigrationLib_Diphda.migration_split();

        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_77();

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](22);
        addressresolver_importAddresses_names_0_0[0] = bytes32("OneNetAggregatorIssuedSynths");
        addressresolver_importAddresses_names_0_0[1] = bytes32("OneNetAggregatorDebtRatio");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SystemStatus");
        addressresolver_importAddresses_names_0_0[3] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[4] = bytes32("FeePool");
        addressresolver_importAddresses_names_0_0[5] = bytes32("ExchangeCircuitBreaker");
        addressresolver_importAddresses_names_0_0[6] = bytes32("DebtCache");
        addressresolver_importAddresses_names_0_0[7] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[8] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[9] = bytes32("SynthetixBridgeToOptimism");
        addressresolver_importAddresses_names_0_0[10] = bytes32("SynthsJPY");
        addressresolver_importAddresses_names_0_0[11] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_0_0[12] = bytes32("SynthsUSD");
        addressresolver_importAddresses_names_0_0[13] = bytes32("SynthsAUD");
        addressresolver_importAddresses_names_0_0[14] = bytes32("SynthsGBP");
        addressresolver_importAddresses_names_0_0[15] = bytes32("SynthsKRW");
        addressresolver_importAddresses_names_0_0[16] = bytes32("SynthsCHF");
        addressresolver_importAddresses_names_0_0[17] = bytes32("SynthsETH");
        addressresolver_importAddresses_names_0_0[18] = bytes32("SynthsBTC");
        addressresolver_importAddresses_names_0_0[19] = bytes32("SynthsLINK");
        addressresolver_importAddresses_names_0_0[20] = bytes32("SynthsDEFI");
        addressresolver_importAddresses_names_0_0[21] = bytes32("FuturesMarketManager");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](22);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_OneNetAggregatorIssuedSynths_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_OneNetAggregatorDebtRatio_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SystemStatus_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_FeePool_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_ExchangeCircuitBreaker_contract);
        addressresolver_importAddresses_destinations_0_1[6] = address(new_DebtCache_contract);
        addressresolver_importAddresses_destinations_0_1[7] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[8] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[9] = address(new_SynthetixBridgeToOptimism_contract);
        addressresolver_importAddresses_destinations_0_1[10] = address(new_SynthsJPY_contract);
        addressresolver_importAddresses_destinations_0_1[11] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_0_1[12] = address(new_SynthsUSD_contract);
        addressresolver_importAddresses_destinations_0_1[13] = address(new_SynthsAUD_contract);
        addressresolver_importAddresses_destinations_0_1[14] = address(new_SynthsGBP_contract);
        addressresolver_importAddresses_destinations_0_1[15] = address(new_SynthsKRW_contract);
        addressresolver_importAddresses_destinations_0_1[16] = address(new_SynthsCHF_contract);
        addressresolver_importAddresses_destinations_0_1[17] = address(new_SynthsETH_contract);
        addressresolver_importAddresses_destinations_0_1[18] = address(new_SynthsBTC_contract);
        addressresolver_importAddresses_destinations_0_1[19] = address(new_SynthsLINK_contract);
        addressresolver_importAddresses_destinations_0_1[20] = address(new_SynthsDEFI_contract);
        addressresolver_importAddresses_destinations_0_1[21] = address(new_FuturesMarketManager_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_FeePool_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xAa1Cc6433be4EB877a4b5C087c95f5004e640F19);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_DebtCache_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(new_ExchangeCircuitBreaker_contract);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(new_SynthsUSD_contract);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(new_SynthsJPY_contract);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_SynthsAUD_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_SynthsGBP_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SynthsKRW_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(new_SynthsCHF_contract);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_SynthsBTC_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_SynthsETH_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(new_SynthsLINK_contract);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(new_SynthsDEFI_contract);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x53baE964339e8A742B5b47F6C10bbfa8Ff138F34);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](11);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x44Af736495544a726ED15CB0EBe2d87a6bCC1832);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(new_SynthetixBridgeToOptimism_contract);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x6B4D3e213e10d9238c1a1A87E493687cc2eb1DD0);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xBBfAd9112203b943f26320B330B75BABF6e2aF2a);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x0f46148D93b52e2B503fE84897609913Cba42B7A);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xFa01a0494913b150Dd37CbE1fF775B08f108dEEa);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x5814d3c40a5A951EFdb4A37Bd93f4407450Cd424);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function systemstatus_updateAccessControls_21() internal {
        bytes32[] memory systemstatus_updateAccessControls_sections_21_0 = new bytes32[](6);
        systemstatus_updateAccessControls_sections_21_0[0] = bytes32("System");
        systemstatus_updateAccessControls_sections_21_0[1] = bytes32("Issuance");
        systemstatus_updateAccessControls_sections_21_0[2] = bytes32("Exchange");
        systemstatus_updateAccessControls_sections_21_0[3] = bytes32("SynthExchange");
        systemstatus_updateAccessControls_sections_21_0[4] = bytes32("Synth");
        systemstatus_updateAccessControls_sections_21_0[5] = bytes32("Futures");
        address[] memory systemstatus_updateAccessControls_accounts_21_1 = new address[](6);
        systemstatus_updateAccessControls_accounts_21_1[0] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_21_1[1] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_21_1[2] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_21_1[3] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_21_1[4] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        systemstatus_updateAccessControls_accounts_21_1[5] = address(0x73570075092502472E4b61A7058Df1A4a1DB12f2);
        bool[] memory systemstatus_updateAccessControls_canSuspends_21_2 = new bool[](6);
        systemstatus_updateAccessControls_canSuspends_21_2[0] = bool(true);
        systemstatus_updateAccessControls_canSuspends_21_2[1] = bool(true);
        systemstatus_updateAccessControls_canSuspends_21_2[2] = bool(true);
        systemstatus_updateAccessControls_canSuspends_21_2[3] = bool(true);
        systemstatus_updateAccessControls_canSuspends_21_2[4] = bool(true);
        systemstatus_updateAccessControls_canSuspends_21_2[5] = bool(true);
        bool[] memory systemstatus_updateAccessControls_canResumes_21_3 = new bool[](6);
        systemstatus_updateAccessControls_canResumes_21_3[0] = bool(true);
        systemstatus_updateAccessControls_canResumes_21_3[1] = bool(true);
        systemstatus_updateAccessControls_canResumes_21_3[2] = bool(true);
        systemstatus_updateAccessControls_canResumes_21_3[3] = bool(true);
        systemstatus_updateAccessControls_canResumes_21_3[4] = bool(true);
        systemstatus_updateAccessControls_canResumes_21_3[5] = bool(true);
        systemstatus_i.updateAccessControls(
            systemstatus_updateAccessControls_sections_21_0,
            systemstatus_updateAccessControls_accounts_21_1,
            systemstatus_updateAccessControls_canSuspends_21_2,
            systemstatus_updateAccessControls_canResumes_21_3
        );
    }

    function importFeePeriod_0() internal {
        // https://kovan.etherscan.io/address/0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E;
        FeePool existingFeePool = FeePool(0x4bcA7fF0a1F9BE5c8c77C6855B0ED9Fce028098E);
        // https://kovan.etherscan.io/address/0x42B340961496731B0c4337E2A600087A2368DfCF;
        FeePool newFeePool = FeePool(0x42B340961496731B0c4337E2A600087A2368DfCF);
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
        // https://kovan.etherscan.io/address/0x42B340961496731B0c4337E2A600087A2368DfCF;
        FeePool newFeePool = FeePool(0x42B340961496731B0c4337E2A600087A2368DfCF);
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

    function issuer_addSynths_77() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_77_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_77_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_77_0[1] = ISynth(new_SynthsEUR_contract);
        issuer_addSynths_synthsToAdd_77_0[2] = ISynth(new_SynthsJPY_contract);
        issuer_addSynths_synthsToAdd_77_0[3] = ISynth(new_SynthsAUD_contract);
        issuer_addSynths_synthsToAdd_77_0[4] = ISynth(new_SynthsGBP_contract);
        issuer_addSynths_synthsToAdd_77_0[5] = ISynth(new_SynthsKRW_contract);
        issuer_addSynths_synthsToAdd_77_0[6] = ISynth(new_SynthsCHF_contract);
        issuer_addSynths_synthsToAdd_77_0[7] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_77_0[8] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_77_0[9] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_77_0[10] = ISynth(new_SynthsDEFI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_77_0);
    }
}

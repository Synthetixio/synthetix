
pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../DebtCache.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../FeePoolEternalStorage.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../RewardEscrow.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
library MigrationLib_Diphda {

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
    FeePoolEternalStorage public constant feepooleternalstorage_i = FeePoolEternalStorage(0x7bB8B3Cc191600547b9467639aD397c05AF3ce8D);
    // https://kovan.etherscan.io/address/0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe
    ExchangeState public constant exchangestate_i = ExchangeState(0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe);
    // https://kovan.etherscan.io/address/0x8c6680412e914932A9abC02B6c7cbf690e583aFA
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x8c6680412e914932A9abC02B6c7cbf690e583aFA);
    // https://kovan.etherscan.io/address/0x42B340961496731B0c4337E2A600087A2368DfCF
    FeePool public constant feepool_i = FeePool(0x42B340961496731B0c4337E2A600087A2368DfCF);
    // https://kovan.etherscan.io/address/0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07
    DebtCache public constant debtcache_i = DebtCache(0xF7440b98b0DC9B54BFae68288a11C48dabFE7D07);
    // https://kovan.etherscan.io/address/0x8F630b584765E30fF08A55BF436D84041674196E
    ExchangeRatesWithDexPricing public constant exchangerates_i = ExchangeRatesWithDexPricing(0x8F630b584765E30fF08A55BF436D84041674196E);
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

    function migration_split() external {
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUSD();
        // Ensure the sUSD synth can write to its TokenState;
        tokenstatesusd_i.setAssociatedContract(new_SynthsUSD_contract);
        // Ensure the sUSD synth Proxy is correctly connected to the Synth;
        proxysusd_i.setTarget(Proxyable(new_SynthsUSD_contract));
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sEUR();
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0x0c15Ab9A0DB086e062194c273CC79f41597Bbf13);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sJPY();
        // Ensure the sJPY synth can write to its TokenState;
        tokenstatesjpy_i.setAssociatedContract(new_SynthsJPY_contract);
        // Ensure the sJPY synth Proxy is correctly connected to the Synth;
        proxysjpy_i.setTarget(Proxyable(new_SynthsJPY_contract));
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xD627B1eF3AC23F1d3e576FA6206126F3c1Bd0942);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAUD();
        // Ensure the sAUD synth can write to its TokenState;
        tokenstatesaud_i.setAssociatedContract(new_SynthsAUD_contract);
        // Ensure the sAUD synth Proxy is correctly connected to the Synth;
        proxysaud_i.setTarget(Proxyable(new_SynthsAUD_contract));
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x5813A90f826e16dB392abd2aF7966313fc1fd5B8);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sGBP();
        // Ensure the sGBP synth can write to its TokenState;
        tokenstatesgbp_i.setAssociatedContract(new_SynthsGBP_contract);
        // Ensure the sGBP synth Proxy is correctly connected to the Synth;
        proxysgbp_i.setTarget(Proxyable(new_SynthsGBP_contract));
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x28b0061f44E6A9780224AA61BEc8C3Fcb0d37de9);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sKRW();
        // Ensure the sKRW synth can write to its TokenState;
        tokenstateskrw_i.setAssociatedContract(new_SynthsKRW_contract);
        // Ensure the sKRW synth Proxy is correctly connected to the Synth;
        proxyskrw_i.setTarget(Proxyable(new_SynthsKRW_contract));
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x9e465c5499023675051517E9Ee5f4C334D91e369);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sCHF();
        // Ensure the sCHF synth can write to its TokenState;
        tokenstateschf_i.setAssociatedContract(new_SynthsCHF_contract);
        // Ensure the sCHF synth Proxy is correctly connected to the Synth;
        proxyschf_i.setTarget(Proxyable(new_SynthsCHF_contract));
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0xed0616BeF04D374969f302a34AE4A63882490A8C);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0x6135b13325bfC4B00278B4abC5e20bbce2D6580e);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sETH();
        // Ensure the sETH synth can write to its TokenState;
        tokenstateseth_i.setAssociatedContract(new_SynthsETH_contract);
        // Ensure the sETH synth Proxy is correctly connected to the Synth;
        proxyseth_i.setTarget(Proxyable(new_SynthsETH_contract));
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x9326BFA02ADD2366b30bacB125260Af641031331);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x396c5E36DD0a0F5a5D33dae44368D4193f69a1F0);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sDEFI();
        // Ensure the sDEFI synth can write to its TokenState;
        tokenstatesdefi_i.setAssociatedContract(new_SynthsDEFI_contract);
        // Ensure the sDEFI synth Proxy is correctly connected to the Synth;
        proxysdefi_i.setTarget(Proxyable(new_SynthsDEFI_contract));
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0x70179FB2F3A0a5b7FfB36a235599De440B0922ea);
    }
        
    function copyTotalSupplyFrom_sUSD() internal {
        // https://kovan.etherscan.io/address/0xB98c6031344EB6007e94A8eDbc0ee28C13c66290;
        Synth existingSynth = Synth(0xB98c6031344EB6007e94A8eDbc0ee28C13c66290);
        // https://kovan.etherscan.io/address/0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226;
        Synth newSynth = Synth(0x9a6e96A0D9cDd4213BAd9101AB7c4d7Bd1Ea5226);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sEUR() internal {
        // https://kovan.etherscan.io/address/0x26b814c9fA4C0512D84373f80d4B92408CD13960;
        Synth existingSynth = Synth(0x26b814c9fA4C0512D84373f80d4B92408CD13960);
        // https://kovan.etherscan.io/address/0xB26c16491869Eb115362CE6dd456C4786bf10B3E;
        Synth newSynth = Synth(0xB26c16491869Eb115362CE6dd456C4786bf10B3E);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sJPY() internal {
        // https://kovan.etherscan.io/address/0x880477aE972Ca606cC7D47496E077514e978231B;
        Synth existingSynth = Synth(0x880477aE972Ca606cC7D47496E077514e978231B);
        // https://kovan.etherscan.io/address/0x151af739E74589320C3Db8852C806F28073928B1;
        Synth newSynth = Synth(0x151af739E74589320C3Db8852C806F28073928B1);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sAUD() internal {
        // https://kovan.etherscan.io/address/0x0D9D97E38d19885441f8be74fE88C3294300C866;
        Synth existingSynth = Synth(0x0D9D97E38d19885441f8be74fE88C3294300C866);
        // https://kovan.etherscan.io/address/0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426;
        Synth newSynth = Synth(0xaf103dFe9ADa5964E2cb3114B7bB8BC191CAF426);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sGBP() internal {
        // https://kovan.etherscan.io/address/0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4;
        Synth existingSynth = Synth(0x16A5ED828fD7F03B0c3F4E261Ea519112c4fa2f4);
        // https://kovan.etherscan.io/address/0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56;
        Synth newSynth = Synth(0x7B7a1C2fD495d060dF95Be983A74B84B01ef5F56);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sKRW() internal {
        // https://kovan.etherscan.io/address/0x376684744fb828D67B1659f6D3D754938dc1Ec4b;
        Synth existingSynth = Synth(0x376684744fb828D67B1659f6D3D754938dc1Ec4b);
        // https://kovan.etherscan.io/address/0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85;
        Synth newSynth = Synth(0x5EA49De5ECD0183dCB95252ef252FE2C9e677c85);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sCHF() internal {
        // https://kovan.etherscan.io/address/0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e;
        Synth existingSynth = Synth(0x67FbB70d887e8E493611D273E94aD12fE7a7Da4e);
        // https://kovan.etherscan.io/address/0xdFd88Db048F5dBe7a42593556E607675C6D912f5;
        Synth newSynth = Synth(0xdFd88Db048F5dBe7a42593556E607675C6D912f5);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sBTC() internal {
        // https://kovan.etherscan.io/address/0xe2d39AB610fEe4C7FC591003553c7557C880eD04;
        Synth existingSynth = Synth(0xe2d39AB610fEe4C7FC591003553c7557C880eD04);
        // https://kovan.etherscan.io/address/0x894235628D36aA617ad5EE49A3763b287F506204;
        Synth newSynth = Synth(0x894235628D36aA617ad5EE49A3763b287F506204);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sETH() internal {
        // https://kovan.etherscan.io/address/0x56a8953C03FC8b859140D5C6f7e7f24dD611d419;
        Synth existingSynth = Synth(0x56a8953C03FC8b859140D5C6f7e7f24dD611d419);
        // https://kovan.etherscan.io/address/0x821621D141584dB05aE9593f6E42BfC6ebA90462;
        Synth newSynth = Synth(0x821621D141584dB05aE9593f6E42BfC6ebA90462);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan.etherscan.io/address/0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf;
        Synth existingSynth = Synth(0xa2aFD3FaA2b69a334DD5493031fa59B7779a3CBf);
        // https://kovan.etherscan.io/address/0x23d4b4D2318aFAA26205c21192696aDb64BA86c2;
        Synth newSynth = Synth(0x23d4b4D2318aFAA26205c21192696aDb64BA86c2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    
    function copyTotalSupplyFrom_sDEFI() internal {
        // https://kovan.etherscan.io/address/0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2;
        Synth existingSynth = Synth(0x7fA8b2D1F640Ac31f08046d0502147Ed430DdAb2);
        // https://kovan.etherscan.io/address/0xA86F796336C821340619174dB7B46c4d492AF2A4;
        Synth newSynth = Synth(0xA86F796336C821340619174dB7B46c4d492AF2A4);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }
}

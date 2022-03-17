pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../DebtCache.sol";
import "../ExchangeRates.sol";
import "../ExchangeState.sol";
import "../FeePool.sol";
import "../FeePoolEternalStorage.sol";
import "../FuturesMarketManager.sol";
import "../FuturesMarketSettings.sol";
import "../Issuer.sol";
import "../MultiCollateralSynth.sol";
import "../Proxy.sol";
import "../ProxyERC20.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
library MigrationLib_DiphdaOptimism {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    FuturesMarketManager public constant futuresmarketmanager_i =
        FuturesMarketManager(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599
    Proxy public constant proxyfeepool_i = Proxy(0xd8c8887A629F98C56686Be6aEEDAae7f8f75D599);
    // https://kovan-explorer.optimism.io/address/0x0A1d3bde7751e92971891FB034AcDE4C271de408
    FeePoolEternalStorage public constant feepooleternalstorage_i =
        FeePoolEternalStorage(0x0A1d3bde7751e92971891FB034AcDE4C271de408);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456
    FeePool public constant feepool_i = FeePool(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
    // https://kovan-explorer.optimism.io/address/0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121
    DebtCache public constant debtcache_i = DebtCache(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
    // https://kovan-explorer.optimism.io/address/0x9FFB4aA93612c9681203118941F983Bb1bB59d20
    ExchangeRates public constant exchangerates_i = ExchangeRates(0x9FFB4aA93612c9681203118941F983Bb1bB59d20);
    // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA
    MultiCollateralSynth public constant synthsusd_i = MultiCollateralSynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
    // https://kovan-explorer.optimism.io/address/0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f
    TokenState public constant tokenstatesusd_i = TokenState(0x77e4837cc55a3CB32A33988Fb670c5bcF13bBD3f);
    // https://kovan-explorer.optimism.io/address/0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57
    ProxyERC20 public constant proxysusd_i = ProxyERC20(0xaA5068dC2B3AADE533d3e52C6eeaadC6a8154c57);
    // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2
    MultiCollateralSynth public constant synthseth_i = MultiCollateralSynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
    // https://kovan-explorer.optimism.io/address/0x8E6734A7653175b3FDa62516A646709F547C8342
    TokenState public constant tokenstateseth_i = TokenState(0x8E6734A7653175b3FDa62516A646709F547C8342);
    // https://kovan-explorer.optimism.io/address/0x94B41091eB29b36003aC1C6f0E55a5225633c884
    ProxyERC20 public constant proxyseth_i = ProxyERC20(0x94B41091eB29b36003aC1C6f0E55a5225633c884);
    // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34
    MultiCollateralSynth public constant synthsbtc_i = MultiCollateralSynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
    // https://kovan-explorer.optimism.io/address/0x0F73cf03DFD5595e862aa27E98914E70554eCf6d
    TokenState public constant tokenstatesbtc_i = TokenState(0x0F73cf03DFD5595e862aa27E98914E70554eCf6d);
    // https://kovan-explorer.optimism.io/address/0x23F608ACc41bd7BCC617a01a9202214EE305439a
    ProxyERC20 public constant proxysbtc_i = ProxyERC20(0x23F608ACc41bd7BCC617a01a9202214EE305439a);
    // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723
    MultiCollateralSynth public constant synthslink_i = MultiCollateralSynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
    // https://kovan-explorer.optimism.io/address/0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE
    TokenState public constant tokenstateslink_i = TokenState(0xbFD9DaF95246b6e21461f2D48aD1bE5984145FFE);
    // https://kovan-explorer.optimism.io/address/0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E
    ProxyERC20 public constant proxyslink_i = ProxyERC20(0xe2B26511C64FE18Acc0BE8EA7c888cDFcacD846E);
    // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877
    MultiCollateralSynth public constant synthsuni_i = MultiCollateralSynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
    // https://kovan-explorer.optimism.io/address/0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26
    TokenState public constant tokenstatesuni_i = TokenState(0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26);
    // https://kovan-explorer.optimism.io/address/0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57
    ProxyERC20 public constant proxysuni_i = ProxyERC20(0x3E88bFAbDCd2b336C4a430262809Cf4a0AC5cd57);
    // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa
    MultiCollateralSynth public constant synthsaave_i = MultiCollateralSynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
    // https://kovan-explorer.optimism.io/address/0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33
    TokenState public constant tokenstatesaave_i = TokenState(0x2Bf6Bed12D1733FD649676d482c3D6d2c1c3df33);
    // https://kovan-explorer.optimism.io/address/0x503e91fc2b9Ad7453700130d0825E661565E4c3b
    ProxyERC20 public constant proxysaave_i = ProxyERC20(0x503e91fc2b9Ad7453700130d0825E661565E4c3b);
    // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f
    MultiCollateralSynth public constant synthssol_i = MultiCollateralSynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
    // https://kovan-explorer.optimism.io/address/0x49460030a1801D38797D35F7ac4205a6212861aD
    TokenState public constant tokenstatessol_i = TokenState(0x49460030a1801D38797D35F7ac4205a6212861aD);
    // https://kovan-explorer.optimism.io/address/0x64Df80373eCD553CD48534A0542307178fF344DD
    ProxyERC20 public constant proxyssol_i = ProxyERC20(0x64Df80373eCD553CD48534A0542307178fF344DD);
    // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49
    MultiCollateralSynth public constant synthsavax_i = MultiCollateralSynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
    // https://kovan-explorer.optimism.io/address/0x8338011e46Db45f5cA0f06C4174a85280772dC85
    TokenState public constant tokenstatesavax_i = TokenState(0x8338011e46Db45f5cA0f06C4174a85280772dC85);
    // https://kovan-explorer.optimism.io/address/0x61760432A363399de4dDDFfD5925A4046c112594
    ProxyERC20 public constant proxysavax_i = ProxyERC20(0x61760432A363399de4dDDFfD5925A4046c112594);
    // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65
    MultiCollateralSynth public constant synthsmatic_i = MultiCollateralSynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
    // https://kovan-explorer.optimism.io/address/0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6
    TokenState public constant tokenstatesmatic_i = TokenState(0x2cD1C77fA8cB3C4a76445DC7C8861e374c67A0F6);
    // https://kovan-explorer.optimism.io/address/0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6
    ProxyERC20 public constant proxysmatic_i = ProxyERC20(0x8d651Be85f9f4c7322b789EA73DFfBbE501338B6);
    // https://kovan-explorer.optimism.io/address/0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a
    Issuer public constant issuer_i = Issuer(0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a);
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0xD2Ed2062047f915A5a442f04DE1C9f0AAE30f8b9
    address public constant new_OneNetAggregatorIssuedSynths_contract = 0xD2Ed2062047f915A5a442f04DE1C9f0AAE30f8b9;
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    address public constant new_SystemStatus_contract = 0xE90F90DCe5010F615bEC29c5db2D9df798D48183;
    // https://kovan-explorer.optimism.io/address/0x9FFB4aA93612c9681203118941F983Bb1bB59d20
    address public constant new_ExchangeRates_contract = 0x9FFB4aA93612c9681203118941F983Bb1bB59d20;
    // https://kovan-explorer.optimism.io/address/0xE52A3aFe564427d206Ab776aC79F97b5C8E67d3C
    address public constant new_OneNetAggregatorDebtRatio_contract = 0xE52A3aFe564427d206Ab776aC79F97b5C8E67d3C;
    // https://kovan-explorer.optimism.io/address/0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456
    address public constant new_FeePool_contract = 0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456;
    // https://kovan-explorer.optimism.io/address/0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121
    address public constant new_DebtCache_contract = 0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121;
    // https://kovan-explorer.optimism.io/address/0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8
    address public constant new_ExchangeCircuitBreaker_contract = 0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8;
    // https://kovan-explorer.optimism.io/address/0x0D521f5320D754f0B844f88c0cA7c377a448edaf
    address public constant new_Exchanger_contract = 0x0D521f5320D754f0B844f88c0cA7c377a448edaf;
    // https://kovan-explorer.optimism.io/address/0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a
    address public constant new_Issuer_contract = 0x723DE2CC925B273FfE66E1B1c94DfAE6b804a83a;
    // https://kovan-explorer.optimism.io/address/0xED4f0C6DfE3235e9A93B808a60994C8697cC2236
    address public constant new_SynthetixBridgeToBase_contract = 0xED4f0C6DfE3235e9A93B808a60994C8697cC2236;
    // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA
    address public constant new_SynthsUSD_contract = 0x360bc0503362130aBE0b3393aC078B03d73a9EcA;
    // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2
    address public constant new_SynthsETH_contract = 0x9745E33Fa3151065568385f915C48d9E538B42a2;
    // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34
    address public constant new_SynthsBTC_contract = 0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34;
    // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723
    address public constant new_SynthsLINK_contract = 0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723;
    // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa
    address public constant new_SynthsAAVE_contract = 0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa;
    // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f
    address public constant new_SynthsSOL_contract = 0xBA097Fa1ABF647995154c8e9D77CEd04123b593f;
    // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877
    address public constant new_SynthsUNI_contract = 0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877;
    // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65
    address public constant new_SynthsMATIC_contract = 0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65;
    // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49
    address public constant new_SynthsAVAX_contract = 0xdA730bF21BA6360af34cF065B042978017f2bf49;
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    address public constant new_FuturesMarketSettings_contract = 0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB;
    // https://kovan-explorer.optimism.io/address/0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9
    address public constant new_FuturesMarketManager_contract = 0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9;
    // https://kovan-explorer.optimism.io/address/0x92CA72696B15b0F0C239E838148495016950af51
    address public constant new_FuturesMarketData_contract = 0x92CA72696B15b0F0C239E838148495016950af51;
    // https://kovan-explorer.optimism.io/address/0x698E403AaC625345C6E5fC2D0042274350bEDf78
    address public constant new_FuturesMarketETH_contract = 0x698E403AaC625345C6E5fC2D0042274350bEDf78;
    // https://kovan-explorer.optimism.io/address/0x1e28378F64bC04E872a9D01Eb261926717346F98
    address public constant new_FuturesMarketLINK_contract = 0x1e28378F64bC04E872a9D01Eb261926717346F98;
    // https://kovan-explorer.optimism.io/address/0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C
    address public constant new_FuturesMarketBTC_contract = 0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C;

    function migration_split() external {
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
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sBTC();
        // Ensure the sBTC synth can write to its TokenState;
        tokenstatesbtc_i.setAssociatedContract(new_SynthsBTC_contract);
        // Ensure the sBTC synth Proxy is correctly connected to the Synth;
        proxysbtc_i.setTarget(Proxyable(new_SynthsBTC_contract));
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sLINK();
        // Ensure the sLINK synth can write to its TokenState;
        tokenstateslink_i.setAssociatedContract(new_SynthsLINK_contract);
        // Ensure the sLINK synth Proxy is correctly connected to the Synth;
        proxyslink_i.setTarget(Proxyable(new_SynthsLINK_contract));
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sUNI();
        // Ensure the sUNI synth can write to its TokenState;
        tokenstatesuni_i.setAssociatedContract(new_SynthsUNI_contract);
        // Ensure the sUNI synth Proxy is correctly connected to the Synth;
        proxysuni_i.setTarget(Proxyable(new_SynthsUNI_contract));
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sAAVE();
        // Ensure the sAAVE synth can write to its TokenState;
        tokenstatesaave_i.setAssociatedContract(new_SynthsAAVE_contract);
        // Ensure the sAAVE synth Proxy is correctly connected to the Synth;
        proxysaave_i.setTarget(Proxyable(new_SynthsAAVE_contract));
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the new synth has the totalSupply from the previous one;
        copyTotalSupplyFrom_sSOL();
        // Ensure the sSOL synth can write to its TokenState;
        tokenstatessol_i.setAssociatedContract(new_SynthsSOL_contract);
        // Ensure the sSOL synth Proxy is correctly connected to the Synth;
        proxyssol_i.setTarget(Proxyable(new_SynthsSOL_contract));
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
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

        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_70();
    }

    function copyTotalSupplyFrom_sUSD() internal {
        // https://kovan-explorer.optimism.io/address/0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10;
        Synth existingSynth = Synth(0xD32c1443Dde2d248cE1bE42BacBb65Db0A4aAF10);
        // https://kovan-explorer.optimism.io/address/0x360bc0503362130aBE0b3393aC078B03d73a9EcA;
        Synth newSynth = Synth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sETH() internal {
        // https://kovan-explorer.optimism.io/address/0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1;
        Synth existingSynth = Synth(0x6E6e2e9b7769CbA76aFC1e6CAd795CD3Ce0772a1);
        // https://kovan-explorer.optimism.io/address/0x9745E33Fa3151065568385f915C48d9E538B42a2;
        Synth newSynth = Synth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sBTC() internal {
        // https://kovan-explorer.optimism.io/address/0x66C203BcF339460698c48a2B589eBD91de4984E7;
        Synth existingSynth = Synth(0x66C203BcF339460698c48a2B589eBD91de4984E7);
        // https://kovan-explorer.optimism.io/address/0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34;
        Synth newSynth = Synth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sLINK() internal {
        // https://kovan-explorer.optimism.io/address/0xe5671C038739F8D71b11A5F78888e520356BFCD5;
        Synth existingSynth = Synth(0xe5671C038739F8D71b11A5F78888e520356BFCD5);
        // https://kovan-explorer.optimism.io/address/0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723;
        Synth newSynth = Synth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sUNI() internal {
        // https://kovan-explorer.optimism.io/address/0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b;
        Synth existingSynth = Synth(0x4d02d6540C789dF4464f4Bc6D8f0AA87a05a8F2b);
        // https://kovan-explorer.optimism.io/address/0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877;
        Synth newSynth = Synth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAAVE() internal {
        // https://kovan-explorer.optimism.io/address/0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70;
        Synth existingSynth = Synth(0x1f99f5CbFC3b5Fd804dCc7F7780148F06423AC70);
        // https://kovan-explorer.optimism.io/address/0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa;
        Synth newSynth = Synth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sSOL() internal {
        // https://kovan-explorer.optimism.io/address/0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5;
        Synth existingSynth = Synth(0x24f46A427E1cd91B4fEE1F47Fe7793eEFCb205b5);
        // https://kovan-explorer.optimism.io/address/0xBA097Fa1ABF647995154c8e9D77CEd04123b593f;
        Synth newSynth = Synth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sAVAX() internal {
        // https://kovan-explorer.optimism.io/address/0xBc9F23b1AEf25e9a456F1973E9a9ef63830B8f49;
        Synth existingSynth = Synth(0xBc9F23b1AEf25e9a456F1973E9a9ef63830B8f49);
        // https://kovan-explorer.optimism.io/address/0xdA730bF21BA6360af34cF065B042978017f2bf49;
        Synth newSynth = Synth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function copyTotalSupplyFrom_sMATIC() internal {
        // https://kovan-explorer.optimism.io/address/0x5BC3b2B2dC40dC88ea227F7501F28D9D8167BB60;
        Synth existingSynth = Synth(0x5BC3b2B2dC40dC88ea227F7501F28D9D8167BB60);
        // https://kovan-explorer.optimism.io/address/0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65;
        Synth newSynth = Synth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        newSynth.setTotalSupply(existingSynth.totalSupply());
    }

    function issuer_addSynths_70() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_70_0 = new ISynth[](9);
        issuer_addSynths_synthsToAdd_70_0[0] = ISynth(new_SynthsUSD_contract);
        issuer_addSynths_synthsToAdd_70_0[1] = ISynth(new_SynthsETH_contract);
        issuer_addSynths_synthsToAdd_70_0[2] = ISynth(new_SynthsBTC_contract);
        issuer_addSynths_synthsToAdd_70_0[3] = ISynth(new_SynthsLINK_contract);
        issuer_addSynths_synthsToAdd_70_0[4] = ISynth(new_SynthsUNI_contract);
        issuer_addSynths_synthsToAdd_70_0[5] = ISynth(new_SynthsAAVE_contract);
        issuer_addSynths_synthsToAdd_70_0[6] = ISynth(new_SynthsSOL_contract);
        issuer_addSynths_synthsToAdd_70_0[7] = ISynth(new_SynthsAVAX_contract);
        issuer_addSynths_synthsToAdd_70_0[8] = ISynth(new_SynthsMATIC_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_70_0);
    }
}

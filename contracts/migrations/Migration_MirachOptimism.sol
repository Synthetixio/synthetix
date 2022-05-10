pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../FuturesMarketManager.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../RewardsDistribution.sol";
import "../ExchangeRates.sol";
import "../TokenState.sol";
import "../TokenState.sol";
import "../ProxyERC20.sol";
import "../Issuer.sol";
import "../FuturesMarketSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MirachOptimism is BaseMigration {
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
    // https://kovan-explorer.optimism.io/address/0x0064A673267696049938AA47595dD0B3C2e705A1
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x0064A673267696049938AA47595dD0B3C2e705A1);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);
    // https://kovan-explorer.optimism.io/address/0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C
    TokenState public constant tokenstatesynthetix_i = TokenState(0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C);
    // https://kovan-explorer.optimism.io/address/0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB);
    // https://kovan-explorer.optimism.io/address/0xc445310e8100AFE57F95782F97F890Aa52b7204e
    ExchangeRates public constant exchangerates_i = ExchangeRates(0xc445310e8100AFE57F95782F97F890Aa52b7204e);
    // https://kovan-explorer.optimism.io/address/0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26
    TokenState public constant tokenstatesuni_i = TokenState(0xF6f4f3D2E06Af9BC431b8bC869A2B138a5175C26);
    // https://kovan-explorer.optimism.io/address/0xB16748B76C430F7cC9d8dbE617A77f09e49B482B
    TokenState public constant tokenstateseur_i = TokenState(0xB16748B76C430F7cC9d8dbE617A77f09e49B482B);
    // https://kovan-explorer.optimism.io/address/0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2
    ProxyERC20 public constant proxyseur_i = ProxyERC20(0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2);
    // https://kovan-explorer.optimism.io/address/0x4B693b1F4fA6045B0e510e651F04496e13961f56
    Issuer public constant issuer_i = Issuer(0x4B693b1F4fA6045B0e510e651F04496e13961f56);
    // https://kovan-explorer.optimism.io/address/0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB
    FuturesMarketSettings public constant futuresmarketsettings_i =
        FuturesMarketSettings(0xEA567e05844ba0e257D80F6b579a1C2beB82bfCB);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0xF2eb8F0E482aF001640CADCf114CaeE83cEb4181
    address public constant new_SystemSettings_contract = 0xF2eb8F0E482aF001640CADCf114CaeE83cEb4181;
    // https://kovan-explorer.optimism.io/address/0xc445310e8100AFE57F95782F97F890Aa52b7204e
    address public constant new_ExchangeRates_contract = 0xc445310e8100AFE57F95782F97F890Aa52b7204e;
    // https://kovan-explorer.optimism.io/address/0x6Be0Af96D79f13a98692e01f23Ec4fcd364104a8
    address public constant new_Synthetix_contract = 0x6Be0Af96D79f13a98692e01f23Ec4fcd364104a8;
    // https://kovan-explorer.optimism.io/address/0x509375Df1672C573B861E2ee9baF7CC08eeA3607
    address public constant new_Exchanger_contract = 0x509375Df1672C573B861E2ee9baF7CC08eeA3607;
    // https://kovan-explorer.optimism.io/address/0x4B693b1F4fA6045B0e510e651F04496e13961f56
    address public constant new_Issuer_contract = 0x4B693b1F4fA6045B0e510e651F04496e13961f56;
    // https://kovan-explorer.optimism.io/address/0xd2D5ba8fCCb2B7d5432B86713dEd5b125d2Ad98c
    address public constant new_SynthetixBridgeToBase_contract = 0xd2D5ba8fCCb2B7d5432B86713dEd5b125d2Ad98c;
    // https://kovan-explorer.optimism.io/address/0xB16748B76C430F7cC9d8dbE617A77f09e49B482B
    address public constant new_TokenStatesEUR_contract = 0xB16748B76C430F7cC9d8dbE617A77f09e49B482B;
    // https://kovan-explorer.optimism.io/address/0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2
    address public constant new_ProxysEUR_contract = 0xafD28E395D2865862D06A3d9cb7d4189e09c4Df2;
    // https://kovan-explorer.optimism.io/address/0x2eC164E5b91f9627193C0268F1462327e3D7EC68
    address public constant new_SynthsEUR_contract = 0x2eC164E5b91f9627193C0268F1462327e3D7EC68;
    // https://kovan-explorer.optimism.io/address/0x86BE944F673D77B93dc5F19655C915b002d42beb
    address public constant new_FuturesMarketXAU_contract = 0x86BE944F673D77B93dc5F19655C915b002d42beb;
    // https://kovan-explorer.optimism.io/address/0x944E3E0cDE5daB927AB174bc22C4c0dA013436B6
    address public constant new_FuturesMarketXAG_contract = 0x944E3E0cDE5daB927AB174bc22C4c0dA013436B6;
    // https://kovan-explorer.optimism.io/address/0xd33773480c9b05FDC22359d51992DCE704bDa1d2
    address public constant new_FuturesMarketEUR_contract = 0xd33773480c9b05FDC22359d51992DCE704bDa1d2;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](13);
        contracts[0] = address(futuresmarketmanager_i);
        contracts[1] = address(addressresolver_i);
        contracts[2] = address(proxysynthetix_i);
        contracts[3] = address(exchangestate_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(tokenstatesynthetix_i);
        contracts[6] = address(rewardsdistribution_i);
        contracts[7] = address(exchangerates_i);
        contracts[8] = address(tokenstatesuni_i);
        contracts[9] = address(tokenstateseur_i);
        contracts[10] = address(proxyseur_i);
        contracts[11] = address(issuer_i);
        contracts[12] = address(futuresmarketsettings_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        futuresmarketmanager_addMarkets_1();
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_2();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_3();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_4();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_5();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x38D2f492B4Ef886E71D111c592c9338374e1bd8d);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the ExchangeRates contract has the standalone feed for UNI;
        exchangerates_i.addAggregator("UNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the standalone feed for SOL;
        exchangerates_i.addAggregator("SOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Ensure the ExchangeRates contract has the standalone feed for AVAX;
        exchangerates_i.addAggregator("AVAX", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the standalone feed for MATIC;
        exchangerates_i.addAggregator("MATIC", 0x62FD93Fc58D94eE253542ECD5C23467F65dCdB73);
        // Ensure the ExchangeRates contract has the standalone feed for WTI;
        exchangerates_i.addAggregator("WTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);
        // Ensure the ExchangeRates contract has the standalone feed for XAU;
        exchangerates_i.addAggregator("XAU", 0x7b219F57a8e9C7303204Af681e9fA69d17ef626f);
        // Ensure the ExchangeRates contract has the standalone feed for XAG;
        exchangerates_i.addAggregator("XAG", 0x166B620003Bc28243C75c1a98d39f25062C30234);
        // Ensure the ExchangeRates contract has the standalone feed for APE;
        exchangerates_i.addAggregator("APE", 0x0d79df66BE487753B02D015Fb622DED7f0E9798d);
        // Ensure the ExchangeRates contract has the standalone feed for EUR;
        exchangerates_i.addAggregator("EUR", 0x7e3786902Bf8EBC196d9a5f06Da4d1Bc0E62D432);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the sUNI synth can write to its TokenState;
        tokenstatesuni_i.setAssociatedContract(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Ensure the ExchangeRates contract has the feed for sAVAX;
        exchangerates_i.addAggregator("sAVAX", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the feed for sMATIC;
        exchangerates_i.addAggregator("sMATIC", 0x62FD93Fc58D94eE253542ECD5C23467F65dCdB73);
        // Ensure the ExchangeRates contract has the feed for sWTI;
        exchangerates_i.addAggregator("sWTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);
        // Ensure the ExchangeRates contract has the feed for sXAU;
        exchangerates_i.addAggregator("sXAU", 0x7b219F57a8e9C7303204Af681e9fA69d17ef626f);
        // Ensure the ExchangeRates contract has the feed for sXAG;
        exchangerates_i.addAggregator("sXAG", 0x166B620003Bc28243C75c1a98d39f25062C30234);
        // Ensure the sEUR synth can write to its TokenState;
        tokenstateseur_i.setAssociatedContract(new_SynthsEUR_contract);
        // Ensure the sEUR synth Proxy is correctly connected to the Synth;
        proxyseur_i.setTarget(Proxyable(new_SynthsEUR_contract));
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0x7e3786902Bf8EBC196d9a5f06Da4d1Bc0E62D432);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_48();
        futuresmarketsettings_i.setTakerFee("sWTI", 5000000000000000);
        futuresmarketsettings_i.setTakerFee("sEUR", 1500000000000000);
        futuresmarketsettings_i.setMakerFee("sEUR", 1500000000000000);
        futuresmarketsettings_i.setTakerFeeNextPrice("sEUR", 1000000000000000);
        futuresmarketsettings_i.setMakerFeeNextPrice("sEUR", 1000000000000000);
        futuresmarketsettings_i.setNextPriceConfirmWindow("sEUR", 2);
        futuresmarketsettings_i.setMaxLeverage("sEUR", 10000000000000000000);
        futuresmarketsettings_i.setMaxMarketValueUSD("sEUR", 1000000000000000000000000);
        futuresmarketsettings_i.setMaxFundingRate("sEUR", 100000000000000000);
        futuresmarketsettings_i.setSkewScaleUSD("sEUR", 100000000000000000000000000);

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

    function futuresmarketmanager_addMarkets_1() internal {
        address[] memory futuresmarketmanager_addMarkets_marketsToAdd_1_0 = new address[](1);
        futuresmarketmanager_addMarkets_marketsToAdd_1_0[0] = address(new_FuturesMarketEUR_contract);
        futuresmarketmanager_i.addMarkets(futuresmarketmanager_addMarkets_marketsToAdd_1_0);
    }

    function addressresolver_importAddresses_2() internal {
        bytes32[] memory addressresolver_importAddresses_names_2_0 = new bytes32[](12);
        addressresolver_importAddresses_names_2_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_2_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_2_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_2_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_2_0[4] = bytes32("Issuer");
        addressresolver_importAddresses_names_2_0[5] = bytes32("SynthetixBridgeToBase");
        addressresolver_importAddresses_names_2_0[6] = bytes32("TokenStatesEUR");
        addressresolver_importAddresses_names_2_0[7] = bytes32("ProxysEUR");
        addressresolver_importAddresses_names_2_0[8] = bytes32("SynthsEUR");
        addressresolver_importAddresses_names_2_0[9] = bytes32("FuturesMarketXAU");
        addressresolver_importAddresses_names_2_0[10] = bytes32("FuturesMarketXAG");
        addressresolver_importAddresses_names_2_0[11] = bytes32("FuturesMarketEUR");
        address[] memory addressresolver_importAddresses_destinations_2_1 = new address[](12);
        addressresolver_importAddresses_destinations_2_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_2_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_2_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_2_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_2_1[4] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_2_1[5] = address(new_SynthetixBridgeToBase_contract);
        addressresolver_importAddresses_destinations_2_1[6] = address(new_TokenStatesEUR_contract);
        addressresolver_importAddresses_destinations_2_1[7] = address(new_ProxysEUR_contract);
        addressresolver_importAddresses_destinations_2_1[8] = address(new_SynthsEUR_contract);
        addressresolver_importAddresses_destinations_2_1[9] = address(new_FuturesMarketXAU_contract);
        addressresolver_importAddresses_destinations_2_1[10] = address(new_FuturesMarketXAG_contract);
        addressresolver_importAddresses_destinations_2_1[11] = address(new_FuturesMarketEUR_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_2_0,
            addressresolver_importAddresses_destinations_2_1
        );
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_3_0[2] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_3_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_3_0[4] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_3_0[5] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_3_0[6] = MixinResolver(new_SynthetixBridgeToBase_contract);
        addressresolver_rebuildCaches_destinations_3_0[7] = MixinResolver(0x5c9AD159E8fC9DC2dD081872dA56961e0B43d6AD);
        addressresolver_rebuildCaches_destinations_3_0[8] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_3_0[9] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_3_0[10] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_3_0[11] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_rebuildCaches_destinations_3_0[12] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_3_0[13] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_3_0[14] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_3_0[15] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_3_0[16] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_3_0[17] = MixinResolver(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        addressresolver_rebuildCaches_destinations_3_0[18] = MixinResolver(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        addressresolver_rebuildCaches_destinations_3_0[19] = MixinResolver(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function addressresolver_rebuildCaches_4() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_4_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_4_0[0] = MixinResolver(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        addressresolver_rebuildCaches_destinations_4_0[1] = MixinResolver(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        addressresolver_rebuildCaches_destinations_4_0[2] = MixinResolver(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        addressresolver_rebuildCaches_destinations_4_0[3] = MixinResolver(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        addressresolver_rebuildCaches_destinations_4_0[4] = MixinResolver(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        addressresolver_rebuildCaches_destinations_4_0[5] = MixinResolver(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        addressresolver_rebuildCaches_destinations_4_0[6] = MixinResolver(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        addressresolver_rebuildCaches_destinations_4_0[7] = MixinResolver(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        addressresolver_rebuildCaches_destinations_4_0[8] = MixinResolver(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        addressresolver_rebuildCaches_destinations_4_0[9] = MixinResolver(new_SynthsEUR_contract);
        addressresolver_rebuildCaches_destinations_4_0[10] = MixinResolver(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
        addressresolver_rebuildCaches_destinations_4_0[11] = MixinResolver(0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C);
        addressresolver_rebuildCaches_destinations_4_0[12] = MixinResolver(0x698E403AaC625345C6E5fC2D0042274350bEDf78);
        addressresolver_rebuildCaches_destinations_4_0[13] = MixinResolver(0x1e28378F64bC04E872a9D01Eb261926717346F98);
        addressresolver_rebuildCaches_destinations_4_0[14] = MixinResolver(0x1991bEA1eB08a78701F3330934B2301Fc6520AbA);
        addressresolver_rebuildCaches_destinations_4_0[15] = MixinResolver(0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee);
        addressresolver_rebuildCaches_destinations_4_0[16] = MixinResolver(0x8e0df45f66E620F85dF1D0490Cd2b19E57a4232A);
        addressresolver_rebuildCaches_destinations_4_0[17] = MixinResolver(new_FuturesMarketXAU_contract);
        addressresolver_rebuildCaches_destinations_4_0[18] = MixinResolver(new_FuturesMarketXAG_contract);
        addressresolver_rebuildCaches_destinations_4_0[19] = MixinResolver(0x929d8EC9A885cdCfdF28EA31B4A356532757DE5E);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_4_0);
    }

    function addressresolver_rebuildCaches_5() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_5_0 = new MixinResolver[](8);
        addressresolver_rebuildCaches_destinations_5_0[0] = MixinResolver(0x8C1D513188Cc86c1e8c9bE002F69f174016f1d17);
        addressresolver_rebuildCaches_destinations_5_0[1] = MixinResolver(0x522aBb55e6f1e1E9E5Fccf5e8f3FeF3e31093530);
        addressresolver_rebuildCaches_destinations_5_0[2] = MixinResolver(0x72CeE2960b65aa4d37DDb89b83b2adeB64d34d2E);
        addressresolver_rebuildCaches_destinations_5_0[3] = MixinResolver(0xe6c5F1dBde6aB671c60E511c2dC064f5F43BF988);
        addressresolver_rebuildCaches_destinations_5_0[4] = MixinResolver(0x8e5691736079FebEfD8A634FC0d6eE0478Cc940b);
        addressresolver_rebuildCaches_destinations_5_0[5] = MixinResolver(new_FuturesMarketEUR_contract);
        addressresolver_rebuildCaches_destinations_5_0[6] = MixinResolver(0xEEc90126956e4de2394Ec6Bd1ce8dCc1097D32C9);
        addressresolver_rebuildCaches_destinations_5_0[7] = MixinResolver(0x057Af46c8f48D9bc574d043e46DBF33fbaE023EA);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_5_0);
    }

    function issuer_addSynths_48() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_48_0 = new ISynth[](13);
        issuer_addSynths_synthsToAdd_48_0[0] = ISynth(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        issuer_addSynths_synthsToAdd_48_0[1] = ISynth(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        issuer_addSynths_synthsToAdd_48_0[2] = ISynth(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        issuer_addSynths_synthsToAdd_48_0[3] = ISynth(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        issuer_addSynths_synthsToAdd_48_0[4] = ISynth(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        issuer_addSynths_synthsToAdd_48_0[5] = ISynth(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        issuer_addSynths_synthsToAdd_48_0[6] = ISynth(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        issuer_addSynths_synthsToAdd_48_0[7] = ISynth(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        issuer_addSynths_synthsToAdd_48_0[8] = ISynth(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        issuer_addSynths_synthsToAdd_48_0[9] = ISynth(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        issuer_addSynths_synthsToAdd_48_0[10] = ISynth(0x8B1CC80c79025477Ab1665284ff08d731FcbC3cF);
        issuer_addSynths_synthsToAdd_48_0[11] = ISynth(0xf94f90B6BeEEb67327581Fe104a1A078B7AC8F89);
        issuer_addSynths_synthsToAdd_48_0[12] = ISynth(new_SynthsEUR_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_48_0);
    }
}

pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../Proxy.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../ExchangeRatesWithDexPricing.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Mirach is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
    Proxy public constant proxysynthetix_i = Proxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // https://etherscan.io/address/0x545973f28950f50fc6c7F52AAb4Ad214A27C0564
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    // https://etherscan.io/address/0x696c905F8F8c006cA46e9808fE7e00049507798F
    SystemStatus public constant systemstatus_i = SystemStatus(0x696c905F8F8c006cA46e9808fE7e00049507798F);
    // https://etherscan.io/address/0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    // https://etherscan.io/address/0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    // https://etherscan.io/address/0x29C295B046a73Cde593f21f63091B072d407e3F2
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);
    // https://etherscan.io/address/0xb4dc5ced63C2918c89E491D19BF1C0e92845de7C
    ExchangeRatesWithDexPricing public constant exchangerates_i =
        ExchangeRatesWithDexPricing(0xb4dc5ced63C2918c89E491D19BF1C0e92845de7C);
    // https://etherscan.io/address/0x7808bFD6e20AFE2d82b159590Ca5635b6263Db3F
    Issuer public constant issuer_i = Issuer(0x7808bFD6e20AFE2d82b159590Ca5635b6263Db3F);
    // https://etherscan.io/address/0xA4339a001c87e2C79B2d8A50D38c16cf12F3D6EE
    SystemSettings public constant systemsettings_i = SystemSettings(0xA4339a001c87e2C79B2d8A50D38c16cf12F3D6EE);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xb4dc5ced63C2918c89E491D19BF1C0e92845de7C
    address public constant new_ExchangeRates_contract = 0xb4dc5ced63C2918c89E491D19BF1C0e92845de7C;
    // https://etherscan.io/address/0xA4339a001c87e2C79B2d8A50D38c16cf12F3D6EE
    address public constant new_SystemSettings_contract = 0xA4339a001c87e2C79B2d8A50D38c16cf12F3D6EE;
    // https://etherscan.io/address/0x639032d3900875a4cf4960aD6b9ee441657aA93C
    address public constant new_Synthetix_contract = 0x639032d3900875a4cf4960aD6b9ee441657aA93C;
    // https://etherscan.io/address/0x9aB91BdCE9ae5D66d7d925699743Fa3A503c8eb8
    address public constant new_Exchanger_contract = 0x9aB91BdCE9ae5D66d7d925699743Fa3A503c8eb8;
    // https://etherscan.io/address/0x7808bFD6e20AFE2d82b159590Ca5635b6263Db3F
    address public constant new_Issuer_contract = 0x7808bFD6e20AFE2d82b159590Ca5635b6263Db3F;
    // https://etherscan.io/address/0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F
    address public constant new_SynthetixBridgeToOptimism_contract = 0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](10);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(tokenstatesynthetix_i);
        contracts[5] = address(rewardescrow_i);
        contracts[6] = address(rewardsdistribution_i);
        contracts[7] = address(exchangerates_i);
        contracts[8] = address(issuer_i);
        contracts[9] = address(systemsettings_i);
    }

    function migrate() external onlyOwner {
        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure Issuer contract can suspend issuance - see SIP-165;
        systemstatus_i.updateAccessControl("Issuance", new_Issuer_contract, true, false);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the ExchangeRates contract has the standalone feed for DOT;
        exchangerates_i.addAggregator("DOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the ExchangeRates contract has the standalone feed for ADA;
        exchangerates_i.addAggregator("ADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the ExchangeRates contract has the standalone feed for DEFI;
        exchangerates_i.addAggregator("DEFI", 0xa8E875F94138B0C5b51d1e1d5dE35bbDdd28EA87);
        // Ensure the ExchangeRates contract has the standalone feed for ETHBTC;
        exchangerates_i.addAggregator("ETHBTC", 0xAc559F25B1619171CbC396a50854A3240b6A4e99);
        // Ensure the ExchangeRates contract has the standalone feed for EUR;
        exchangerates_i.addAggregator("EUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the ExchangeRates contract has the standalone feed for JPY;
        exchangerates_i.addAggregator("JPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the ExchangeRates contract has the standalone feed for AUD;
        exchangerates_i.addAggregator("AUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the ExchangeRates contract has the standalone feed for GBP;
        exchangerates_i.addAggregator("GBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the ExchangeRates contract has the standalone feed for CHF;
        exchangerates_i.addAggregator("CHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the ExchangeRates contract has the standalone feed for KRW;
        exchangerates_i.addAggregator("KRW", 0x01435677FB11763550905594A16B645847C1d0F3);
        // Ensure the ExchangeRates contract has the feed for sEUR;
        exchangerates_i.addAggregator("sEUR", 0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
        // Ensure the ExchangeRates contract has the feed for sJPY;
        exchangerates_i.addAggregator("sJPY", 0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3);
        // Ensure the ExchangeRates contract has the feed for sAUD;
        exchangerates_i.addAggregator("sAUD", 0x77F9710E7d0A19669A13c055F62cd80d313dF022);
        // Ensure the ExchangeRates contract has the feed for sGBP;
        exchangerates_i.addAggregator("sGBP", 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5);
        // Ensure the ExchangeRates contract has the feed for sCHF;
        exchangerates_i.addAggregator("sCHF", 0x449d117117838fFA61263B61dA6301AA2a88B13A);
        // Ensure the ExchangeRates contract has the feed for sKRW;
        exchangerates_i.addAggregator("sKRW", 0x01435677FB11763550905594A16B645847C1d0F3);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);
        // Ensure the ExchangeRates contract has the feed for sADA;
        exchangerates_i.addAggregator("sADA", 0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0x547a514d5e3769680Ce22B2361c10Ea13619e8a9);
        // Ensure the ExchangeRates contract has the feed for sDOT;
        exchangerates_i.addAggregator("sDOT", 0x1C07AFb8E2B827c5A4739C6d59Ae3A5035f28734);
        // Ensure the ExchangeRates contract has the feed for sETHBTC;
        exchangerates_i.addAggregator("sETHBTC", 0xAc559F25B1619171CbC396a50854A3240b6A4e99);
        // Ensure the ExchangeRates contract has the feed for sDEFI;
        exchangerates_i.addAggregator("sDEFI", 0xa8E875F94138B0C5b51d1e1d5dE35bbDdd28EA87);
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_44();
        // Set the max amount of Ether allowed in the EtherWrapper (SIP-112);
        systemsettings_i.setEtherWrapperMaxETH(5000000000000000000000);
        // SIP-120 Set the DEX price aggregator (uniswap TWAP oracle reader);
        exchangerates_i.setDexPriceAggregator(IDexPriceAggregator(0xf120F029Ac143633d1942e48aE2Dfa2036C5786c));

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
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](6);
        addressresolver_importAddresses_names_0_0[0] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[1] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Issuer");
        addressresolver_importAddresses_names_0_0[5] = bytes32("SynthetixBridgeToOptimism");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](6);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Issuer_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_SynthetixBridgeToOptimism_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(new_SynthetixBridgeToOptimism_contract);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x7C22547779c8aa41bAE79E03E8383a0BefBCecf0);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](15);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x27b45A4208b87A899009f45888139882477Acea5);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_44() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_44_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_44_0[0] = ISynth(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        issuer_addSynths_synthsToAdd_44_0[1] = ISynth(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        issuer_addSynths_synthsToAdd_44_0[2] = ISynth(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        issuer_addSynths_synthsToAdd_44_0[3] = ISynth(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        issuer_addSynths_synthsToAdd_44_0[4] = ISynth(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        issuer_addSynths_synthsToAdd_44_0[5] = ISynth(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        issuer_addSynths_synthsToAdd_44_0[6] = ISynth(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        issuer_addSynths_synthsToAdd_44_0[7] = ISynth(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        issuer_addSynths_synthsToAdd_44_0[8] = ISynth(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        issuer_addSynths_synthsToAdd_44_0[9] = ISynth(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        issuer_addSynths_synthsToAdd_44_0[10] = ISynth(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        issuer_addSynths_synthsToAdd_44_0[11] = ISynth(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        issuer_addSynths_synthsToAdd_44_0[12] = ISynth(0x27b45A4208b87A899009f45888139882477Acea5);
        issuer_addSynths_synthsToAdd_44_0[13] = ISynth(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        issuer_addSynths_synthsToAdd_44_0[14] = ISynth(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_44_0);
    }
}

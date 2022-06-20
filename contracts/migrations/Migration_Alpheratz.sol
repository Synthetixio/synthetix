pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeState.sol";
import "../Issuer.sol";
import "../legacy/LegacyTokenState.sol";
import "../Proxy.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alpheratz is BaseMigration {
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
    // https://etherscan.io/address/0x0689b1F72930Eb25cACB99f790d2778E713a2c33
    Issuer public constant issuer_i = Issuer(0x0689b1F72930Eb25cACB99f790d2778E713a2c33);
    // https://etherscan.io/address/0xdD3c1c64402A679e8D709FcCf606BD77eE12b567
    SystemSettings public constant systemsettings_i = SystemSettings(0xdD3c1c64402A679e8D709FcCf606BD77eE12b567);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://etherscan.io/address/0xdD3c1c64402A679e8D709FcCf606BD77eE12b567
    address public constant new_SystemSettings_contract = 0xdD3c1c64402A679e8D709FcCf606BD77eE12b567;
    // https://etherscan.io/address/0xf79603a71144e415730C1A6f57F366E4Ea962C00
    address public constant new_LiquidatorRewards_contract = 0xf79603a71144e415730C1A6f57F366E4Ea962C00;
    // https://etherscan.io/address/0x0e5fe1b05612581576e9A3dB048416d0B1E3C425
    address public constant new_Liquidator_contract = 0x0e5fe1b05612581576e9A3dB048416d0B1E3C425;
    // https://etherscan.io/address/0xD64D83829D92B5bdA881f6f61A4e4E27Fc185387
    address public constant new_Exchanger_contract = 0xD64D83829D92B5bdA881f6f61A4e4E27Fc185387;
    // https://etherscan.io/address/0x931933807c4c808657b6016f9e539486e7B5d374
    address public constant new_Synthetix_contract = 0x931933807c4c808657b6016f9e539486e7B5d374;
    // https://etherscan.io/address/0x0689b1F72930Eb25cACB99f790d2778E713a2c33
    address public constant new_Issuer_contract = 0x0689b1F72930Eb25cACB99f790d2778E713a2c33;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](9);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(tokenstatesynthetix_i);
        contracts[5] = address(rewardescrow_i);
        contracts[6] = address(rewardsdistribution_i);
        contracts[7] = address(issuer_i);
        contracts[8] = address(systemsettings_i);
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_15();
        // Set the penalty for self liquidation of an account;
        systemsettings_i.setSelfLiquidationPenalty(200000000000000000);
        // Set the duration of how long liquidation rewards are escrowed for;
        systemsettings_i.setLiquidationEscrowDuration(31536000);
        // Set the reward amount for flagging an account for liquidation;
        systemsettings_i.setFlagReward(10000000000000000000);
        // Set the reward amount for peforming a liquidation;
        systemsettings_i.setLiquidateReward(20000000000000000000);

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
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("LiquidatorRewards");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[5] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](6);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_LiquidatorRewards_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_importAddresses_destinations_0_1[4] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[5] = address(new_Issuer_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(new_Issuer_contract);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_LiquidatorRewards_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x3B2f389AeE480238A49E3A9985cd6815370712eB);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x1620Aa736939597891C1940CF0d28b82566F9390);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](14);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x27b45A4208b87A899009f45888139882477Acea5);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x89FCb32F29e509cc42d0C8b6f058C993013A843F);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0xeAcaEd9581294b1b5cfb6B941d4B8B81B2005437);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xe533139Af961c9747356D947838c98451015e234);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xC1AAE9d18bBe386B102435a8632C8063d31e747C);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x067e398605E84F2D0aEEC1806e62768C5110DCc6);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function issuer_addSynths_15() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_15_0 = new ISynth[](15);
        issuer_addSynths_synthsToAdd_15_0[0] = ISynth(0x7df9b3f8f1C011D8BD707430e97E747479DD532a);
        issuer_addSynths_synthsToAdd_15_0[1] = ISynth(0x1b06a00Df0B27E7871E753720D4917a7D1aac68b);
        issuer_addSynths_synthsToAdd_15_0[2] = ISynth(0xB82f11f3168Ece7D56fe6a5679567948090de7C5);
        issuer_addSynths_synthsToAdd_15_0[3] = ISynth(0xC4546bDd93cDAADA6994e84Fb6F2722C620B019C);
        issuer_addSynths_synthsToAdd_15_0[4] = ISynth(0xAE7A2C1e326e59f2dB2132652115a59E8Adb5eBf);
        issuer_addSynths_synthsToAdd_15_0[5] = ISynth(0xCC83a57B080a4c7C86F0bB892Bc180C8C7F8791d);
        issuer_addSynths_synthsToAdd_15_0[6] = ISynth(0x527637bE27640d6C3e751d24DC67129A6d13E11C);
        issuer_addSynths_synthsToAdd_15_0[7] = ISynth(0x18FcC34bdEaaF9E3b69D2500343527c0c995b1d6);
        issuer_addSynths_synthsToAdd_15_0[8] = ISynth(0x4FB63c954Ef07EC74335Bb53835026C75DD91dC6);
        issuer_addSynths_synthsToAdd_15_0[9] = ISynth(0xe08518bA3d2467F7cA50eFE68AA00C5f78D4f3D6);
        issuer_addSynths_synthsToAdd_15_0[10] = ISynth(0xB34F4d7c207D8979D05EDb0F63f174764Bd67825);
        issuer_addSynths_synthsToAdd_15_0[11] = ISynth(0x95aE43E5E96314E4afffcf19D9419111cd11169e);
        issuer_addSynths_synthsToAdd_15_0[12] = ISynth(0x27b45A4208b87A899009f45888139882477Acea5);
        issuer_addSynths_synthsToAdd_15_0[13] = ISynth(0x6DF798ec713b33BE823b917F27820f2aA0cf7662);
        issuer_addSynths_synthsToAdd_15_0[14] = ISynth(0xf533aeEe48f0e04E30c2F6A1f19FbB675469a124);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_15_0);
    }
}

pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeState.sol";
import "../Issuer.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../SystemSettings.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_AlpheratzOptimism is BaseMigration {
    // https://explorer.optimism.io/address/0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;
    address public constant OWNER = 0x6d4a64C57612841c2C6745dB2a4E4db34F002D20;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://explorer.optimism.io/address/0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C
    AddressResolver public constant addressresolver_i = AddressResolver(0x95A6a3f44a70172E7d50a9e28c85Dfd712756B8C);
    // https://explorer.optimism.io/address/0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4);
    // https://explorer.optimism.io/address/0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8
    ExchangeState public constant exchangestate_i = ExchangeState(0x7EF87c14f50CFFe2e73d2C87916C3128c56593A8);
    // https://explorer.optimism.io/address/0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD
    SystemStatus public constant systemstatus_i = SystemStatus(0xE8c41bE1A167314ABAF2423b72Bf8da826943FFD);
    // https://explorer.optimism.io/address/0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE
    TokenState public constant tokenstatesynthetix_i = TokenState(0xB9c6CA25452E7f6D0D3340CE1e9B573421afc2eE);
    // https://explorer.optimism.io/address/0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x5d9187630E99dBce4BcAB8733B76757f7F44aA2e);
    // https://explorer.optimism.io/address/0x939313420A85ab8F21B8c2fE15b60528f34E0d63
    Issuer public constant issuer_i = Issuer(0x939313420A85ab8F21B8c2fE15b60528f34E0d63);
    // https://explorer.optimism.io/address/0xdE48d4b3B8737446193720ce23ef24f922341155
    SystemSettings public constant systemsettings_i = SystemSettings(0xdE48d4b3B8737446193720ce23ef24f922341155);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://explorer.optimism.io/address/0xdE48d4b3B8737446193720ce23ef24f922341155
    address public constant new_SystemSettings_contract = 0xdE48d4b3B8737446193720ce23ef24f922341155;
    // https://explorer.optimism.io/address/0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8
    address public constant new_Liquidator_contract = 0x68a8b098967Ae077dcFf5cC8E29B7cb15f1A3cC8;
    // https://explorer.optimism.io/address/0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4
    address public constant new_LiquidatorRewards_contract = 0xF4EebDD0704021eF2a6Bbe993fdf93030Cd784b4;
    // https://explorer.optimism.io/address/0xcC02F000b0aA8a0eFC2B55C9cf2305Fb3531cca1
    address public constant new_Exchanger_contract = 0xcC02F000b0aA8a0eFC2B55C9cf2305Fb3531cca1;
    // https://explorer.optimism.io/address/0xc66a263f2C7C1Af0bD70c6cA4Bff5936F3D6Ef9F
    address public constant new_Synthetix_contract = 0xc66a263f2C7C1Af0bD70c6cA4Bff5936F3D6Ef9F;
    // https://explorer.optimism.io/address/0x939313420A85ab8F21B8c2fE15b60528f34E0d63
    address public constant new_Issuer_contract = 0x939313420A85ab8F21B8c2fE15b60528f34E0d63;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(systemstatus_i);
        contracts[4] = address(tokenstatesynthetix_i);
        contracts[5] = address(rewardsdistribution_i);
        contracts[6] = address(issuer_i);
        contracts[7] = address(systemsettings_i);
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
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        addressresolver_rebuildCaches_3();
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
        // Add synths to the Issuer contract - batch 1;
        issuer_addSynths_15();
        // Set the penalty for self liquidation of an account;
        systemsettings_i.setSelfLiquidationPenalty(200000000000000000);
        // Set the duration of how long liquidation rewards are escrowed for;
        systemsettings_i.setLiquidationEscrowDuration(31536000);
        // Set the reward amount for flagging an account for liquidation;
        systemsettings_i.setFlagReward(1000000000000000000);
        // Set the reward amount for peforming a liquidation;
        systemsettings_i.setLiquidateReward(2000000000000000000);
        // Set the amount for the liquidation c-ratio;
        systemsettings_i.setLiquidationRatio(666666666666666666);
        // Set the duration for the liquidation delay;
        systemsettings_i.setLiquidationDelay(43200);

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
        addressresolver_importAddresses_names_0_0[1] = bytes32("Liquidator");
        addressresolver_importAddresses_names_0_0[2] = bytes32("LiquidatorRewards");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        addressresolver_importAddresses_names_0_0[4] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[5] = bytes32("Issuer");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](6);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_Liquidator_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_LiquidatorRewards_contract);
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
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Liquidator_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(new_LiquidatorRewards_contract);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0xD3739A5F06747e148E716Dcb7147B9BA15b70fcc);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x17628A557d1Fc88D1c35989dcBAC3f3e275E2d2B);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0x2DcAD1A019fba8301b77810Ae14007cc88ED004B);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0x0681883084b5De1564FE2706C87affD77F1677D5);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0xc66499aCe3B6c6a30c784bE5511E8d338d543913);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x308AD16ef90fe7caCb85B784A603CB6E71b1A41a);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0xEbCe9728E2fDdC26C9f4B00df5180BdC5e184953);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0xc704c9AA89d1ca60F67B3075d05fBb92b3B00B3B);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xEe8804d8Ad10b0C3aD1Bd57AC3737242aD24bB95);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xf86048DFf23cF130107dfB4e6386f574231a5C65);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0x1228c7D8BBc5bC53DB181bD7B1fcE765aa83bF8A);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xcF853f7f8F78B2B801095b66F8ba9c5f04dB1640);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x4ff54624D5FB61C34c634c3314Ed3BfE4dBB665a);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0x001b7876F567f0b3A639332Ed1e363839c6d85e2);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x5Af0072617F7f2AEB0e314e2faD1DE0231Ba97cD);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0xbCB2D435045E16B059b2130b28BE70b5cA47bFE5);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x4434f56ddBdE28fab08C4AE71970a06B300F8881);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0xb147C69BEe211F57290a6cde9d1BAbfD0DCF3Ea3);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xad44873632840144fFC97b2D1de716f6E2cF0366);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0xFe00395ec846240dc693e92AB2Dd720F94765Aa3);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x10305C1854d6DB8A1060dF60bDF8A8B2981249Cf);
        addressresolver_rebuildCaches_destinations_2_0[15] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_2_0[16] = MixinResolver(0x47eE58801C1AC44e54FF2651aE50525c5cfc66d0);
        addressresolver_rebuildCaches_destinations_2_0[17] = MixinResolver(0x136b1EC699c62b0606854056f02dC7Bb80482d63);
        addressresolver_rebuildCaches_destinations_2_0[18] = MixinResolver(0x45c55BF488D3Cb8640f12F63CbeDC027E8261E79);
        addressresolver_rebuildCaches_destinations_2_0[19] = MixinResolver(0x7322e8F6cB6c6a7B4e6620C486777fcB9Ea052a4);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }

    function addressresolver_rebuildCaches_3() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_3_0 = new MixinResolver[](2);
        addressresolver_rebuildCaches_destinations_3_0[0] = MixinResolver(0xA997BD647AEe62Ef03b41e6fBFAdaB43d8E57535);
        addressresolver_rebuildCaches_destinations_3_0[1] = MixinResolver(0x15E7D4972a3E477878A5867A47617122BE2d1fF0);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_3_0);
    }

    function issuer_addSynths_15() internal {
        ISynth[] memory issuer_addSynths_synthsToAdd_15_0 = new ISynth[](11);
        issuer_addSynths_synthsToAdd_15_0[0] = ISynth(0xD1599E478cC818AFa42A4839a6C665D9279C3E50);
        issuer_addSynths_synthsToAdd_15_0[1] = ISynth(0x0681883084b5De1564FE2706C87affD77F1677D5);
        issuer_addSynths_synthsToAdd_15_0[2] = ISynth(0xC4Be4583bc0307C56CF301975b2B2B1E5f95fcB2);
        issuer_addSynths_synthsToAdd_15_0[3] = ISynth(0x2302D7F7783e2712C48aA684451b9d706e74F299);
        issuer_addSynths_synthsToAdd_15_0[4] = ISynth(0x91DBC6f587D043FEfbaAD050AB48696B30F13d89);
        issuer_addSynths_synthsToAdd_15_0[5] = ISynth(0x5D7569CD81dc7c8E7FA201e66266C9D0c8a3712D);
        issuer_addSynths_synthsToAdd_15_0[6] = ISynth(0xF5d0BFBc617d3969C1AcE93490A76cE80Db1Ed0e);
        issuer_addSynths_synthsToAdd_15_0[7] = ISynth(0xB16ef128b11e457afA07B09FCE52A01f5B05a937);
        issuer_addSynths_synthsToAdd_15_0[8] = ISynth(0x5eA2544551448cF6DcC1D853aDdd663D480fd8d3);
        issuer_addSynths_synthsToAdd_15_0[9] = ISynth(0xC19d27d1dA572d582723C1745650E51AC4Fc877F);
        issuer_addSynths_synthsToAdd_15_0[10] = ISynth(0xc66499aCe3B6c6a30c784bE5511E8d338d543913);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_15_0);
    }
}

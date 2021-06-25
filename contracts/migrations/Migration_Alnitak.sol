pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../Proxy.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../legacy/LegacyTokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alnitak is BaseMigration {
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    Proxy public constant proxysynthetix_i = Proxy(0xC011A72400E58ecD99Ee497CF89E3775d4bd732F);
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() external pure returns (address[] memory contracts) {
        contracts = new address[](8);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxyerc20_i);
        contracts[2] = address(proxysynthetix_i);
        contracts[3] = address(exchangestate_i);
        contracts[4] = address(systemstatus_i);
        contracts[5] = address(tokenstatesynthetix_i);
        contracts[6] = address(rewardescrow_i);
        contracts[7] = address(rewardsdistribution_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        address new_Synthetix_contract = 0xC4cED8762169d17FC5c10e4800fa2f88b20EB243;
        address new_Exchanger_contract = 0x52dDE10B3eF5A817ccd0d2896876549ED9FaC8d0;

        require(
            ISynthetixNamedContract(new_Synthetix_contract).CONTRACT_NAME() == "Synthetix",
            "Invalid contract supplied for Synthetix"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        addressresolver_i.acceptOwnership();
        proxyerc20_i.acceptOwnership();
        proxysynthetix_i.acceptOwnership();
        exchangestate_i.acceptOwnership();
        systemstatus_i.acceptOwnership();
        tokenstatesynthetix_i.acceptOwnership();
        rewardescrow_i.acceptOwnership();
        rewardsdistribution_i.acceptOwnership();

        // MIGRATION
        // Import all new contracts into the address resolver;
        bytes32[] memory addressresolver_importAddresses_0_0 = new bytes32[](2);
        addressresolver_importAddresses_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_0_0[1] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_0_1 = new address[](2);
        addressresolver_importAddresses_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_0_1[1] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_0_0, addressresolver_importAddresses_0_1);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        MixinResolver[] memory addressresolver_rebuildCaches_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_1_0[0] = MixinResolver(0xDA4eF8520b1A57D7d63f1E249606D1A459698876);
        addressresolver_rebuildCaches_1_0[1] = MixinResolver(0xAD95C918af576c82Df740878C3E983CBD175daB6);
        addressresolver_rebuildCaches_1_0[2] = MixinResolver(0xcf9E60005C9aca983caf65d3669a24fDd0775fc0);
        addressresolver_rebuildCaches_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_1_0[4] = MixinResolver(0xB774711F0BC1306ce892ef8C02D0476dCccB46B7);
        addressresolver_rebuildCaches_1_0[5] = MixinResolver(0x62922670313bf6b41C580143d1f6C173C5C20019);
        addressresolver_rebuildCaches_1_0[6] = MixinResolver(0xCd9D4988C0AE61887B075bA77f08cbFAd2b65068);
        addressresolver_rebuildCaches_1_0[7] = MixinResolver(0xd69b189020EF614796578AfE4d10378c5e7e1138);
        addressresolver_rebuildCaches_1_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_1_0[9] = MixinResolver(0x9bB05EF2cA7DBAafFC3da1939D1492e6b00F39b8);
        addressresolver_rebuildCaches_1_0[10] = MixinResolver(0x4D8dBD193d89b7B506BE5dC9Db75B91dA00D6a1d);
        addressresolver_rebuildCaches_1_0[11] = MixinResolver(0xC61b352fCc311Ae6B0301459A970150005e74b3E);
        addressresolver_rebuildCaches_1_0[12] = MixinResolver(0x388fD1A8a7d36e03eFA1ab100a1c5159a3A3d427);
        addressresolver_rebuildCaches_1_0[13] = MixinResolver(0x37B648a07476F4941D3D647f81118AFd55fa8a04);
        addressresolver_rebuildCaches_1_0[14] = MixinResolver(0xEF285D339c91aDf1dD7DE0aEAa6250805FD68258);
        addressresolver_rebuildCaches_1_0[15] = MixinResolver(0xcf9bB94b5d65589039607BA66e3DAC686d3eFf01);
        addressresolver_rebuildCaches_1_0[16] = MixinResolver(0xCeC4e038371d32212C6Dcdf36Fdbcb6F8a34C6d8);
        addressresolver_rebuildCaches_1_0[17] = MixinResolver(0x5eDf7dd83fE2889D264fa9D3b93d0a6e6A45D6C6);
        addressresolver_rebuildCaches_1_0[18] = MixinResolver(0x9745606DA6e162866DAD7bF80f2AbF145EDD7571);
        addressresolver_rebuildCaches_1_0[19] = MixinResolver(0x2962EA4E749e54b10CFA557770D597027BA67cB3);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_1_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        MixinResolver[] memory addressresolver_rebuildCaches_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_2_0[0] = MixinResolver(0xDB91E4B3b6E19bF22E810C43273eae48C9037e74);
        addressresolver_rebuildCaches_2_0[1] = MixinResolver(0xab4e760fEEe20C5c2509061b995e06b542D3112B);
        addressresolver_rebuildCaches_2_0[2] = MixinResolver(0xda3c83750b1FA31Fda838136ef3f853b41cb7a5a);
        addressresolver_rebuildCaches_2_0[3] = MixinResolver(0x47bD14817d7684082E04934878EE2Dd3576Ae19d);
        addressresolver_rebuildCaches_2_0[4] = MixinResolver(0x6F927644d55E32318629198081923894FbFe5c07);
        addressresolver_rebuildCaches_2_0[5] = MixinResolver(0xe3D5E1c1bA874C0fF3BA31b999967F24d5ca04e5);
        addressresolver_rebuildCaches_2_0[6] = MixinResolver(0xA962208CDC8588F9238fae169d0F63306c353F4F);
        addressresolver_rebuildCaches_2_0[7] = MixinResolver(0xcd980Fc5CcdAe62B18A52b83eC64200121A929db);
        addressresolver_rebuildCaches_2_0[8] = MixinResolver(0xAf090d6E583C082f2011908cf95c2518BE7A53ac);
        addressresolver_rebuildCaches_2_0[9] = MixinResolver(0x21ee4afBd6c151fD9A69c1389598170B1d45E0e3);
        addressresolver_rebuildCaches_2_0[10] = MixinResolver(0xcb6Cb218D558ae7fF6415f95BDA6616FCFF669Cb);
        addressresolver_rebuildCaches_2_0[11] = MixinResolver(0x7B29C9e188De18563B19d162374ce6836F31415a);
        addressresolver_rebuildCaches_2_0[12] = MixinResolver(0xC22e51FA362654ea453B4018B616ef6f6ab3b779);
        addressresolver_rebuildCaches_2_0[13] = MixinResolver(0xaB38249f4f56Ef868F6b5E01D9cFa26B952c1270);
        addressresolver_rebuildCaches_2_0[14] = MixinResolver(0xAa1b12E3e5F70aBCcd1714F4260A74ca21e7B17b);
        addressresolver_rebuildCaches_2_0[15] = MixinResolver(0x0F393ce493d8FB0b83915248a21a3104932ed97c);
        addressresolver_rebuildCaches_2_0[16] = MixinResolver(0xfD0435A588BF5c5a6974BA19Fa627b772833d4eb);
        addressresolver_rebuildCaches_2_0[17] = MixinResolver(0x4287dac1cC7434991119Eba7413189A66fFE65cF);
        addressresolver_rebuildCaches_2_0[18] = MixinResolver(0x34c76BC146b759E58886e821D62548AC1e0BA7Bc);
        addressresolver_rebuildCaches_2_0[19] = MixinResolver(0x0E8Fa2339314AB7E164818F26207897bBe29C3af);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_2_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        MixinResolver[] memory addressresolver_rebuildCaches_3_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_3_0[0] = MixinResolver(0xe615Df79AC987193561f37E77465bEC2aEfe9aDb);
        addressresolver_rebuildCaches_3_0[1] = MixinResolver(0x3E2dA260B4A85782A629320EB027A3B7c28eA9f1);
        addressresolver_rebuildCaches_3_0[2] = MixinResolver(0xc02DD182Ce029E6d7f78F37492DFd39E4FEB1f8b);
        addressresolver_rebuildCaches_3_0[3] = MixinResolver(0x0d1c4e5C07B071aa4E6A14A604D4F6478cAAC7B4);
        addressresolver_rebuildCaches_3_0[4] = MixinResolver(0x13D0F5B8630520eA04f694F17A001fb95eaFD30E);
        addressresolver_rebuildCaches_3_0[5] = MixinResolver(0x815CeF3b7773f35428B4353073B086ecB658f73C);
        addressresolver_rebuildCaches_3_0[6] = MixinResolver(0xb0e0BA880775B7F2ba813b3800b3979d719F0379);
        addressresolver_rebuildCaches_3_0[7] = MixinResolver(0x8e082925e78538955bC0e2F363FC5d1Ab3be739b);
        addressresolver_rebuildCaches_3_0[8] = MixinResolver(0x399BA516a6d68d6Ad4D5f3999902D0DeAcaACDdd);
        addressresolver_rebuildCaches_3_0[9] = MixinResolver(0x9530FA32a3059114AC20A5812870Da12D97d1174);
        addressresolver_rebuildCaches_3_0[10] = MixinResolver(0x249612F641111022f2f48769f3Df5D85cb3E26a2);
        addressresolver_rebuildCaches_3_0[11] = MixinResolver(0x04720DbBD4599aD26811545595d97fB813E84964);
        addressresolver_rebuildCaches_3_0[12] = MixinResolver(0x2acfe6265D358d982cB1c3B521199973CD443C71);
        addressresolver_rebuildCaches_3_0[13] = MixinResolver(0x46A7Af405093B27DA6DeF193C508Bd9240A255FA);
        addressresolver_rebuildCaches_3_0[14] = MixinResolver(0x8350d1b2d6EF5289179fe49E5b0F208165B4e32e);
        addressresolver_rebuildCaches_3_0[15] = MixinResolver(0x29DD4A59F4D339226867e77aF211724eaBb45c02);
        addressresolver_rebuildCaches_3_0[16] = MixinResolver(0xf7B8dF8b16dA302d85603B8e7F95111a768458Cc);
        addressresolver_rebuildCaches_3_0[17] = MixinResolver(0x0517A56da8A517e3b2D484Cc5F1Da4BDCfE68ec3);
        addressresolver_rebuildCaches_3_0[18] = MixinResolver(0x099CfAd1640fc7EA686ab1D83F0A285Ba0470882);
        addressresolver_rebuildCaches_3_0[19] = MixinResolver(0x19cC1f63e344D74A87D955E3F3E95B28DDDc61d8);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_3_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 4;
        MixinResolver[] memory addressresolver_rebuildCaches_4_0 = new MixinResolver[](19);
        addressresolver_rebuildCaches_4_0[0] = MixinResolver(0x4D50A0e5f068ACdC80A1da2dd1f0Ad48845df2F8);
        addressresolver_rebuildCaches_4_0[1] = MixinResolver(0xb73c665825dAa926D6ef09417FbE5654473c1b49);
        addressresolver_rebuildCaches_4_0[2] = MixinResolver(0x806A599d60B2FdBda379D5890287D2fba1026cC0);
        addressresolver_rebuildCaches_4_0[3] = MixinResolver(0xCea42504874586a718954746A564B72bc7eba3E3);
        addressresolver_rebuildCaches_4_0[4] = MixinResolver(0x947d5656725fB9A8f9c826A91b6082b07E2745B7);
        addressresolver_rebuildCaches_4_0[5] = MixinResolver(0x186E56A62E7caCE1308f1A1B0dbb27f33F80f16f);
        addressresolver_rebuildCaches_4_0[6] = MixinResolver(0x931c5516EE121a177bD2B60e0122Da5B27630ABc);
        addressresolver_rebuildCaches_4_0[7] = MixinResolver(0x6Dc6a64724399524184C2c44a526A2cff1BaA507);
        addressresolver_rebuildCaches_4_0[8] = MixinResolver(0x87eb6e935e3C7E3E3A0E31a5658498bC87dE646E);
        addressresolver_rebuildCaches_4_0[9] = MixinResolver(0x53869BDa4b8d85aEDCC9C6cAcf015AF9447Cade7);
        addressresolver_rebuildCaches_4_0[10] = MixinResolver(0x1cB27Ac646afAE192dF9928A2808C0f7f586Af7d);
        addressresolver_rebuildCaches_4_0[11] = MixinResolver(0x3dD7b893c25025CabFBd290A5E06BaFF3DE335b8);
        addressresolver_rebuildCaches_4_0[12] = MixinResolver(0x1A4505543C92084bE57ED80113eaB7241171e7a8);
        addressresolver_rebuildCaches_4_0[13] = MixinResolver(0xF6ce55E09De0F9F97210aAf6DB88Ed6b6792Ca1f);
        addressresolver_rebuildCaches_4_0[14] = MixinResolver(0xacAAB69C2BA65A2DB415605F309007e18D4F5E8C);
        addressresolver_rebuildCaches_4_0[15] = MixinResolver(0x9A5Ea0D8786B8d17a70410A905Aed1443fae5A38);
        addressresolver_rebuildCaches_4_0[16] = MixinResolver(0x5c8344bcdC38F1aB5EB5C1d4a35DdEeA522B5DfA);
        addressresolver_rebuildCaches_4_0[17] = MixinResolver(0xaa03aB31b55DceEeF845C8d17890CC61cD98eD04);
        addressresolver_rebuildCaches_4_0[18] = MixinResolver(0x1F2c3a1046c32729862fcB038369696e3273a516);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_4_0);
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
        // Ensure the legacy RewardEscrow contract is connected to the Synthetix contract;
        rewardescrow_i.setSynthetix(ISynthetix(new_Synthetix_contract));
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        addressresolver_i.nominateNewOwner(owner);
        proxyerc20_i.nominateNewOwner(owner);
        proxysynthetix_i.nominateNewOwner(owner);
        exchangestate_i.nominateNewOwner(owner);
        systemstatus_i.nominateNewOwner(owner);
        tokenstatesynthetix_i.nominateOwner(owner);
        rewardescrow_i.nominateNewOwner(owner);
        rewardsdistribution_i.nominateNewOwner(owner);
    }
}

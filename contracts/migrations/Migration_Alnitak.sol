pragma solidity ^0.5.16;

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
contract Migration_Alnitak {
    address public constant owner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    AddressResolver public constant addressresolver_i = AddressResolver(0x15F2ea83eB97ede71d84Bd04fFF29444f6b7cd52);
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xBe6Eb4ACB499f992ba2DaC7CAD59d56DA9e0D823);
    Proxy public constant proxysynthetix_i = Proxy(0xb6aA91E8904d691a10372706e57aE1b390D26353);
    ExchangeState public constant exchangestate_i = ExchangeState(0x499AA73A1D27e54B33E7DB05ffd22854EC70257E);
    SystemStatus public constant systemstatus_i = SystemStatus(0x057cD3082EfED32d5C907801BF3628B27D88fD80);
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x54287AaB4D98eA51a3B1FBceE56dAf27E04a56A6);
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xad203b3144f8c09a20532957174fc0366291643c);
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x91A1EeE63f300B8f41AE6AF67eDEa2e2ed8c3f79);

    function migrate(address currentOwner) external {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        address new_Synthetix_contract = 0xc91B651f770ed996a223a16dA9CCD6f7Df56C987;
        address new_Exchanger_contract = 0xB90AcF57C3BFE8e0E8215defc282B5F48b3edC74;

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
        bytes32[] memory addressresolver_importAddresses_0_0 = new bytes32[](3);
        addressresolver_importAddresses_0_0[0] = bytes32("Synthetix");
        addressresolver_importAddresses_0_0[1] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_0_1 = new address[](3);
        addressresolver_importAddresses_0_1[0] = address(new_Synthetix_contract);
        addressresolver_importAddresses_0_1[1] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(addressresolver_importAddresses_0_0, addressresolver_importAddresses_0_1);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        MixinResolver[] memory addressresolver_rebuildCaches_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_1_0[0] = MixinResolver(0xb6057e08a11da09a998985874FE2119e98dB3D5D);
        addressresolver_rebuildCaches_1_0[1] = MixinResolver(0x31403b1e52051883f2Ce1B1b4C89f36034e1221D);
        addressresolver_rebuildCaches_1_0[2] = MixinResolver(0xEC7cb8C3EBE77BA6d284F13296bb1372A8522c5F);
        addressresolver_rebuildCaches_1_0[3] = MixinResolver(0xaD82Ecf79e232B0391C5479C7f632aA1EA701Ed1);
        addressresolver_rebuildCaches_1_0[4] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_1_0[5] = MixinResolver(0x6fFa22292b86D678fF6621eEdC9B15e68dC44DcD);
        addressresolver_rebuildCaches_1_0[6] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_1_0[7] = MixinResolver(0x4c04377f90Eb1E42D845AB21De874803B8773669);
        addressresolver_rebuildCaches_1_0[8] = MixinResolver(0xf93b0549cD50c849D792f0eAE94A598fA77C7718);
        addressresolver_rebuildCaches_1_0[9] = MixinResolver(0x834Ea01e45F9b5365314358159d92d134d89feEb);
        addressresolver_rebuildCaches_1_0[10] = MixinResolver(0xFcCa971FE9Ee20C1Cf22596E700aA993D8fD19c5);
        addressresolver_rebuildCaches_1_0[11] = MixinResolver(0x273c507D8E21cDE039491B14647Fe9278D88e91D);
        addressresolver_rebuildCaches_1_0[12] = MixinResolver(0x3Af511B1bdD6A0377e23796aD6B7391d8De68636);
        addressresolver_rebuildCaches_1_0[13] = MixinResolver(0xfb6dAB6200b8958C2655C3747708F82243d3F32E);
        addressresolver_rebuildCaches_1_0[14] = MixinResolver(0xf42Ec71A4440F5e9871C643696DD6Dc9a38911F8);
        addressresolver_rebuildCaches_1_0[15] = MixinResolver(0x28227B230d3945e580eD3B1c6c8ea1df658A7AA9);
        addressresolver_rebuildCaches_1_0[16] = MixinResolver(0x1d460d731Bd5a0fF2cA07309dAEB8641a7b175A1);
        addressresolver_rebuildCaches_1_0[17] = MixinResolver(0x6431AF84d34F0522cAA58b221d94A150B5AdAC69);
        addressresolver_rebuildCaches_1_0[18] = MixinResolver(0x776D6996c8180838dC0587aE0DE5D614b1350f37);
        addressresolver_rebuildCaches_1_0[19] = MixinResolver(0x725314746e727f586E9FCA65AeD5dBe45aA71B99);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_1_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        MixinResolver[] memory addressresolver_rebuildCaches_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_2_0[0] = MixinResolver(0xA8d14b3d9e2589CEA8644BB0f67EB90d21079f8B);
        addressresolver_rebuildCaches_2_0[1] = MixinResolver(0x0Deeb4b6492C1a55Bb7C0555AaFf65fF6dC424B2);
        addressresolver_rebuildCaches_2_0[2] = MixinResolver(0xFE92134da38df8c399A90a540f20187D19216E05);
        addressresolver_rebuildCaches_2_0[3] = MixinResolver(0xe519389F8c262d4301Fd2830196FB7D0021daf59);
        addressresolver_rebuildCaches_2_0[4] = MixinResolver(0x4E76FbE44fa5Dae076a7f4f676250e7941421fbA);
        addressresolver_rebuildCaches_2_0[5] = MixinResolver(0xa9efDEf197130B945462163a0B852019BA529a66);
        addressresolver_rebuildCaches_2_0[6] = MixinResolver(0x82Bd83ec6D4bCC8EaB6F6cF7565efE1e41D92Ce5);
        addressresolver_rebuildCaches_2_0[7] = MixinResolver(0x26Df0Ea798971A97Ae121514B32999DfDb220e1f);
        addressresolver_rebuildCaches_2_0[8] = MixinResolver(0xB8d6D6b01bFe81784BE46e5771eF017Fa3c906d8);
        addressresolver_rebuildCaches_2_0[9] = MixinResolver(0xAAF0F531b7947e8492f21862471d61d5305f7538);
        addressresolver_rebuildCaches_2_0[10] = MixinResolver(0x2ce1F0e20C1f69E9d9AEA83b25F0cEB69e2AA2b5);
        addressresolver_rebuildCaches_2_0[11] = MixinResolver(0x01c93598EeC9131C05a2450Cd033cbd8F82da31e);
        addressresolver_rebuildCaches_2_0[12] = MixinResolver(0x1F2C6E90F3DF741E0191eAbB1170f0B9673F12b3);
        addressresolver_rebuildCaches_2_0[13] = MixinResolver(0xB354ECF032e9e14442bE590D9Eaee37d2924B67A);
        addressresolver_rebuildCaches_2_0[14] = MixinResolver(0xe4a4B3Bc2787aA913e5b4bbce907e8b213250BDe);
        addressresolver_rebuildCaches_2_0[15] = MixinResolver(0x0BbfcD7a557FFB8A70CB0948FF680F0E573bbFf2);
        addressresolver_rebuildCaches_2_0[16] = MixinResolver(0x645D817611E0CDaF9cD43332c4E369B9E333471d);
        addressresolver_rebuildCaches_2_0[17] = MixinResolver(0x9a8164cA007ff0899140719E9aEC9a9C889CbF1E);
        addressresolver_rebuildCaches_2_0[18] = MixinResolver(0xE0a1556ef66873d965A2F4caD06F051646BE6707);
        addressresolver_rebuildCaches_2_0[19] = MixinResolver(0x0462Bc7390a33C8BB748d5c2ad76E93690A365c5);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_2_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        MixinResolver[] memory addressresolver_rebuildCaches_3_0 = new MixinResolver[](6);
        addressresolver_rebuildCaches_3_0[0] = MixinResolver(0x71d2EBF08bF4FcB82dB5ddE46677263F4c534ef3);
        addressresolver_rebuildCaches_3_0[1] = MixinResolver(0x76d05F58D14c0838EC630C8140eDC5aB7CD159Dc);
        addressresolver_rebuildCaches_3_0[2] = MixinResolver(0xe8c3F27D20472e4f3C546A3f73C04B54DD72871d);
        addressresolver_rebuildCaches_3_0[3] = MixinResolver(0x2B64822cf4bbDd77d386F51AA2B40c5cdbeb80b5);
        addressresolver_rebuildCaches_3_0[4] = MixinResolver(0xBc153693BFAe1Ca202872a382aED20a1306C9200);
        addressresolver_rebuildCaches_3_0[5] = MixinResolver(0xE634d83f8E016B04e51F2516e6086b5f238675C7);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_3_0);
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

pragma solidity ^0.5.16;

import "./BaseMigration.sol";
import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../Proxy.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Alnitak is BaseMigration {
    address public constant OWNER = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;

    AddressResolver public constant addressresolver_i = AddressResolver(0x84f87E3636Aa9cC1080c07E6C61aDfDCc23c0db6);
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    Proxy public constant proxysynthetix_i = Proxy(0x22f1ba6dB6ca0A065e1b7EAe6FC22b7E675310EF);
    ExchangeState public constant exchangestate_i = ExchangeState(0xa3F59b8E28cABC4411198dDa2e65C380BD5d6Dfe);
    SystemStatus public constant systemstatus_i = SystemStatus(0xcf8B3d452A56Dab495dF84905655047BC1Dc41Bc);
    TokenState public constant tokenstatesynthetix_i = TokenState(0x46824bFAaFd049fB0Af9a45159A88e595Bbbb9f7);
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x8c6680412e914932A9abC02B6c7cbf690e583aFA);
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xD29160e4f5D2e5818041f9Cd9192853BA349c47E);

    constructor() public BaseMigration(OWNER) {}

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        address new_Synthetix_contract = 0x042e4c83546a3F9971df5fE99f3f8c0dba0B8E87;
        address new_Exchanger_contract = 0x601cdcC58A69F0cC474395F4d9f7921D5510A7B5;

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
        addressresolver_rebuildCaches_1_0[0] = MixinResolver(0x64ac15AB583fFfA6a7401B83E3aA5cf4Ad1aA92A);
        addressresolver_rebuildCaches_1_0[1] = MixinResolver(0x9880cfA7B81E8841e216ebB32687A2c9551ae333);
        addressresolver_rebuildCaches_1_0[2] = MixinResolver(0x38635D2501F9ca46106A22bE4aF9B8C08C2B4823);
        addressresolver_rebuildCaches_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_1_0[4] = MixinResolver(0xd3655A8e0b163E5ae3Bad37c35354050aa7C7694);
        addressresolver_rebuildCaches_1_0[5] = MixinResolver(0xBBfAd9112203b943f26320B330B75BABF6e2aF2a);
        addressresolver_rebuildCaches_1_0[6] = MixinResolver(0xD134Db47DDF5A6feB245452af17cCAf92ee53D3c);
        addressresolver_rebuildCaches_1_0[7] = MixinResolver(0xC9985cAc4a69588Da66F74E42845B784798fe5aB);
        addressresolver_rebuildCaches_1_0[8] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_1_0[9] = MixinResolver(0x3AD8366B716DEeA3F46730dEBFF537B713c76404);
        addressresolver_rebuildCaches_1_0[10] = MixinResolver(0x253E60880f7393B02ef963fB98DD28eaC6a0026E);
        addressresolver_rebuildCaches_1_0[11] = MixinResolver(0x0F126120C20A4d696D8D27516C579a605536ba16);
        addressresolver_rebuildCaches_1_0[12] = MixinResolver(0x88021D729298B0D8F59581388b49eAaA2A5CE1D2);
        addressresolver_rebuildCaches_1_0[13] = MixinResolver(0x2a6BCfE6Ef91a7679053875a540737636Ec30E4f);
        addressresolver_rebuildCaches_1_0[14] = MixinResolver(0xeF71dd8EB832D574D35cCBD23cC9e5cde43f92De);
        addressresolver_rebuildCaches_1_0[15] = MixinResolver(0xF7631453c32b8278a5c8bbcC9Fe4c3072d6c25B6);
        addressresolver_rebuildCaches_1_0[16] = MixinResolver(0x857f40aa756e93816a9Fa5ce378762ec8bD13278);
        addressresolver_rebuildCaches_1_0[17] = MixinResolver(0xc6Cd03C78f585076cdF8f6561B7D5FebeeBD9cC2);
        addressresolver_rebuildCaches_1_0[18] = MixinResolver(0xA0544264Ea43FD5A536E5b8d43d7c76C3D6229a7);
        addressresolver_rebuildCaches_1_0[19] = MixinResolver(0xa08868E26079c5e4c4334065a7E59192D6b3A33B);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_1_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        MixinResolver[] memory addressresolver_rebuildCaches_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_2_0[0] = MixinResolver(0xce754192eE9265D71b6286Db05329a16F20291CD);
        addressresolver_rebuildCaches_2_0[1] = MixinResolver(0xD6f913019bc26ab98911046FFE202141D9d7f2e6);
        addressresolver_rebuildCaches_2_0[2] = MixinResolver(0x908b892d240220D9de9A21db4Fc2f66d0893FadE);
        addressresolver_rebuildCaches_2_0[3] = MixinResolver(0x75408bdC4647Ac7EC3ec5B94a86bA65a91519Bb2);
        addressresolver_rebuildCaches_2_0[4] = MixinResolver(0x550683599b2f8C031F1db911598d16C793B99E51);
        addressresolver_rebuildCaches_2_0[5] = MixinResolver(0xC5301Eb1A4eD3552DFec9C21d966bD25dDe0aD40);
        addressresolver_rebuildCaches_2_0[6] = MixinResolver(0xf4435125fEAC75600d8CC502710A7c4F702E4180);
        addressresolver_rebuildCaches_2_0[7] = MixinResolver(0x63417fCE3a75eB4FA5Df2a26d8fD82BB952eE9C0);
        addressresolver_rebuildCaches_2_0[8] = MixinResolver(0xD62933a82cDBba32b4CA51309CA2D7000445d0c5);
        addressresolver_rebuildCaches_2_0[9] = MixinResolver(0xCC200785cea662a7fA66E033AA1a4a054022a197);
        addressresolver_rebuildCaches_2_0[10] = MixinResolver(0xfFd76a5fE92Cfe681aEFDEA9FA5C22372D72B510);
        addressresolver_rebuildCaches_2_0[11] = MixinResolver(0xEca41030226Ace8F54D0AF5DbD37C276E100055A);
        addressresolver_rebuildCaches_2_0[12] = MixinResolver(0xbf075BF30c5Fc4929785f0E50eC42078B92DF869);
        addressresolver_rebuildCaches_2_0[13] = MixinResolver(0x6A8a006786819D551eF4f0AbFA9264D2d2A7ff2f);
        addressresolver_rebuildCaches_2_0[14] = MixinResolver(0x130613411D53076923Af9bA1d830205b34126d76);
        addressresolver_rebuildCaches_2_0[15] = MixinResolver(0xEbCdeFe5F392eb16c71a4905fB2720f580e09B88);
        addressresolver_rebuildCaches_2_0[16] = MixinResolver(0x6F4a1312a48D9887Aa8a05c282C387663528Fe05);
        addressresolver_rebuildCaches_2_0[17] = MixinResolver(0xe9a2A90241f0474c460A1e6106b66F8DcB42c851);
        addressresolver_rebuildCaches_2_0[18] = MixinResolver(0x9A71fC5AAa6716b66A44D11B4BBC04bD9F36AE8f);
        addressresolver_rebuildCaches_2_0[19] = MixinResolver(0x75bA0dB0934665E37f57fD0FF2b677cc433696d4);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_2_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        MixinResolver[] memory addressresolver_rebuildCaches_3_0 = new MixinResolver[](13);
        addressresolver_rebuildCaches_3_0[0] = MixinResolver(0x95541c84A45d61Ff7aCf2912aa8cb3d7AdD1f6eE);
        addressresolver_rebuildCaches_3_0[1] = MixinResolver(0x07d1503D736B5a5Ef7b19686f34dF6Ca360ce917);
        addressresolver_rebuildCaches_3_0[2] = MixinResolver(0xA8A2Ef65e6E5df51fe30620d639edDCd2dE32A89);
        addressresolver_rebuildCaches_3_0[3] = MixinResolver(0x22f1E84c484132D48dF1848c1D13Ad247d0dc30C);
        addressresolver_rebuildCaches_3_0[4] = MixinResolver(0xc13E77E4F1a1aF9dF03B26DADd51a31A45eEa5D9);
        addressresolver_rebuildCaches_3_0[5] = MixinResolver(0x99947fA8aeDD08838B4cBa632f590730dCDf808b);
        addressresolver_rebuildCaches_3_0[6] = MixinResolver(0xf796f60c5feE6dEfC55720aE09a1212D0A1d7707);
        addressresolver_rebuildCaches_3_0[7] = MixinResolver(0x75928A56B81876eEfE2cE762E06B939648D775Ec);
        addressresolver_rebuildCaches_3_0[8] = MixinResolver(0xD3E46f5D15ED12f008C9E8727374A24A7F598605);
        addressresolver_rebuildCaches_3_0[9] = MixinResolver(0xd748Fcbb98F1F1943C7d7b5D04e530d2040611FA);
        addressresolver_rebuildCaches_3_0[10] = MixinResolver(0xdFd01d828D34982DFE882B9fDC6DC17fcCA33C25);
        addressresolver_rebuildCaches_3_0[11] = MixinResolver(0x5AD5469D8A1Eee2cF7c8B8205CbeD95A032cdff3);
        addressresolver_rebuildCaches_3_0[12] = MixinResolver(0x9712DdCC43F42402acC483e297eeFf650d18D354);
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
        tokenstatesynthetix_i.nominateNewOwner(owner);
        rewardescrow_i.nominateNewOwner(owner);
        rewardsdistribution_i.nominateNewOwner(owner);
    }
}

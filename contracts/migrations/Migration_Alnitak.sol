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

    AddressResolver public constant addressresolver_i = AddressResolver(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0);
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0x59b670e9fA9D0A427751Af201D676719a970857b);
    Proxy public constant proxysynthetix_i = Proxy(0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f);
    ExchangeState public constant exchangestate_i = ExchangeState(0xc5a5C42992dECbae36851359345FE25997F5C42d);
    SystemStatus public constant systemstatus_i = SystemStatus(0x0165878A594ca255338adfa4d48449f69242Eb8F);
    LegacyTokenState public constant tokenstatesynthetix_i = LegacyTokenState(0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1);
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0xc6e7DF5E7b4f2A278906862b61205850344D4e7d);

    address public deployer;

    constructor() public {
        deployer = msg.sender;
    }

    function migrate(address currentOwner) external {
        require(msg.sender == deployer, "Only the deployer can invoke this");

        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        address new_Synthetix_contract = 0xCa1D199b6F53Af7387ac543Af8e8a34455BBe5E0;
        address new_Exchanger_contract = 0xdF46e54aAadC1d55198A4a8b4674D7a4c927097A;

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
        addressresolver_rebuildCaches_1_0[0] = MixinResolver(0x8A791620dd6260079BF849Dc5567aDC3F2FdC318);
        addressresolver_rebuildCaches_1_0[1] = MixinResolver(0x0B306BF915C4d645ff596e518fAf3F9669b97016);
        addressresolver_rebuildCaches_1_0[2] = MixinResolver(0x68B1D87F95878fE05B998F19b66F4baba5De1aed);
        addressresolver_rebuildCaches_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_1_0[4] = MixinResolver(0x67d269191c92Caf3cD7723F116c85e6E9bf55933);
        addressresolver_rebuildCaches_1_0[5] = MixinResolver(0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E);
        addressresolver_rebuildCaches_1_0[6] = MixinResolver(0x9E545E3C0baAB3E08CdfD552C960A1050f373042);
        addressresolver_rebuildCaches_1_0[7] = MixinResolver(0x99dBE4AEa58E518C50a1c04aE9b48C9F6354612f);
        addressresolver_rebuildCaches_1_0[8] = MixinResolver(0xa513E6E4b8f2a923D98304ec87F64353C4D5C853);
        addressresolver_rebuildCaches_1_0[9] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_1_0[10] = MixinResolver(0x4A679253410272dd5232B3Ff7cF5dbB88f295319);
        addressresolver_rebuildCaches_1_0[11] = MixinResolver(0x95401dc811bb5740090279Ba06cfA8fcF6113778);
        addressresolver_rebuildCaches_1_0[12] = MixinResolver(0x4826533B4897376654Bb4d4AD88B7faFD0C98528);
        addressresolver_rebuildCaches_1_0[13] = MixinResolver(0x8f86403A4DE0BB5791fa46B8e795C547942fE4Cf);
        addressresolver_rebuildCaches_1_0[14] = MixinResolver(0x36C02dA8a0983159322a80FFE9F24b1acfF8B570);
        addressresolver_rebuildCaches_1_0[15] = MixinResolver(0x1291Be112d480055DaFd8a610b7d1e203891C274);
        addressresolver_rebuildCaches_1_0[16] = MixinResolver(0xCD8a1C3ba11CF5ECfa6267617243239504a98d90);
        addressresolver_rebuildCaches_1_0[17] = MixinResolver(0x7969c5eD335650692Bc04293B07F5BF2e7A673C0);
        addressresolver_rebuildCaches_1_0[18] = MixinResolver(0xFD471836031dc5108809D173A067e8486B9047A3);
        addressresolver_rebuildCaches_1_0[19] = MixinResolver(0xB0D4afd8879eD9F52b28595d31B441D079B2Ca07);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_1_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        MixinResolver[] memory addressresolver_rebuildCaches_2_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_2_0[0] = MixinResolver(0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f);
        addressresolver_rebuildCaches_2_0[1] = MixinResolver(0x04C89607413713Ec9775E14b954286519d836FEf);
        addressresolver_rebuildCaches_2_0[2] = MixinResolver(0x2E2Ed0Cfd3AD2f1d34481277b3204d807Ca2F8c2);
        addressresolver_rebuildCaches_2_0[3] = MixinResolver(0x51A1ceB83B83F1985a81C295d1fF28Afef186E02);
        addressresolver_rebuildCaches_2_0[4] = MixinResolver(0x0355B7B8cb128fA5692729Ab3AAa199C1753f726);
        addressresolver_rebuildCaches_2_0[5] = MixinResolver(0x172076E0166D1F9Cc711C77Adf8488051744980C);
        addressresolver_rebuildCaches_2_0[6] = MixinResolver(0xD84379CEae14AA33C123Af12424A37803F885889);
        addressresolver_rebuildCaches_2_0[7] = MixinResolver(0x46b142DD1E924FAb83eCc3c08e4D46E82f005e0E);
        addressresolver_rebuildCaches_2_0[8] = MixinResolver(0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb);
        addressresolver_rebuildCaches_2_0[9] = MixinResolver(0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff);
        addressresolver_rebuildCaches_2_0[10] = MixinResolver(0xA4899D35897033b927acFCf422bc745916139776);
        addressresolver_rebuildCaches_2_0[11] = MixinResolver(0x5c74c94173F05dA1720953407cbb920F3DF9f887);
        addressresolver_rebuildCaches_2_0[12] = MixinResolver(0x5067457698Fd6Fa1C6964e416b3f42713513B3dD);
        addressresolver_rebuildCaches_2_0[13] = MixinResolver(0xCace1b78160AE76398F486c8a18044da0d66d86D);
        addressresolver_rebuildCaches_2_0[14] = MixinResolver(0xc0F115A19107322cFBf1cDBC7ea011C19EbDB4F8);
        addressresolver_rebuildCaches_2_0[15] = MixinResolver(0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A);
        addressresolver_rebuildCaches_2_0[16] = MixinResolver(0xA7c59f010700930003b33aB25a7a0679C860f29c);
        addressresolver_rebuildCaches_2_0[17] = MixinResolver(0x3347B4d90ebe72BeFb30444C9966B2B990aE9FcB);
        addressresolver_rebuildCaches_2_0[18] = MixinResolver(0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429);
        addressresolver_rebuildCaches_2_0[19] = MixinResolver(0xE3011A37A904aB90C8881a99BD1F6E21401f1522);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_2_0);
        // Rebuild the resolver caches in all MixinResolver contracts - batch 3;
        MixinResolver[] memory addressresolver_rebuildCaches_3_0 = new MixinResolver[](7);
        addressresolver_rebuildCaches_3_0[0] = MixinResolver(0x525C7063E7C20997BaaE9bDa922159152D0e8417);
        addressresolver_rebuildCaches_3_0[1] = MixinResolver(0xB82008565FdC7e44609fA118A4a681E92581e680);
        addressresolver_rebuildCaches_3_0[2] = MixinResolver(0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8);
        addressresolver_rebuildCaches_3_0[3] = MixinResolver(0xd6e1afe5cA8D00A2EFC01B89997abE2De47fdfAf);
        addressresolver_rebuildCaches_3_0[4] = MixinResolver(0x927b167526bAbB9be047421db732C663a0b77B11);
        addressresolver_rebuildCaches_3_0[5] = MixinResolver(0x02b0B4EFd909240FCB2Eb5FAe060dC60D112E3a4);
        addressresolver_rebuildCaches_3_0[6] = MixinResolver(0x6C2d83262fF84cBaDb3e416D527403135D757892);
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

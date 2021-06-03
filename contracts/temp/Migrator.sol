pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../ProxyERC20.sol";
import "../Synthetix.sol";
import "../Proxy.sol";
import "../ExchangeState.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";
import "../RewardEscrow.sol";
import "../RewardsDistribution.sol";

contract Migrator {
    address public constant owner = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    ProxyERC20 public constant proxyerc20_i = ProxyERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    Synthetix public constant synthetix_i = Synthetix(0x0000000000000000000000000000000000000001);
    Proxy public constant proxysynthetix_i = Proxy(0xC011A72400E58ecD99Ee497CF89E3775d4bd732F);
    ExchangeState public constant exchangestate_i = ExchangeState(0x545973f28950f50fc6c7F52AAb4Ad214A27C0564);
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);
    TokenState public constant tokenstatesynthetix_i = TokenState(0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD);
    RewardEscrow public constant rewardescrow_i = RewardEscrow(0xb671F2210B1F6621A2607EA63E6B2DC3e2464d1F);
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x29C295B046a73Cde593f21f63091B072d407e3F2);

    function migrate(address currentOwner) external {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // accept ownership
        addressresolver_i.acceptOwnership();
        proxyerc20_i.acceptOwnership();
        synthetix_i.acceptOwnership();
        proxysynthetix_i.acceptOwnership();
        exchangestate_i.acceptOwnership();
        systemstatus_i.acceptOwnership();
        tokenstatesynthetix_i.acceptOwnership();
        rewardescrow_i.acceptOwnership();
        rewardsdistribution_i.acceptOwnership();

        // perform migration
        bytes32[] memory addressresolver_importAddresses_0 = new bytes32[](2);
        addressresolver_importAddresses_0[0] = bytes32(0x53796e7468657469780000000000000000000000000000000000000000000000);
        addressresolver_importAddresses_0[1] = bytes32(0x45786368616e6765720000000000000000000000000000000000000000000000);
        address[] memory addressresolver_importAddresses_1 = new address[](2);
        addressresolver_importAddresses_1[0] = address(0x0000000000000000000000000000000000000001);
        addressresolver_importAddresses_1[1] = address(0x0000000000000000000000000000000000000002);
        addressresolver_i.importAddresses(addressresolver_importAddresses_0, addressresolver_importAddresses_1);
        MixinResolver[] memory addressresolver_rebuildCaches_0 = new MixinResolver[](2);
        addressresolver_rebuildCaches_0[0] = MixinResolver(0x0000000000000000000000000000000000000001);
        addressresolver_rebuildCaches_0[1] = MixinResolver(0x0000000000000000000000000000000000000002);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_0);
        proxyerc20_i.setTarget(Proxyable(0x0000000000000000000000000000000000000001));
        synthetix_i.setProxy(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
        proxysynthetix_i.setTarget(Proxyable(0x0000000000000000000000000000000000000001));
        exchangestate_i.setAssociatedContract(0x0000000000000000000000000000000000000002);
        systemstatus_i.updateAccessControl(
            0x53796e7468000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000002,
            true,
            false
        );
        tokenstatesynthetix_i.setAssociatedContract(0x0000000000000000000000000000000000000001);
        rewardescrow_i.setSynthetix(ISynthetix(0x0000000000000000000000000000000000000001));
        rewardsdistribution_i.setAuthority(0x0000000000000000000000000000000000000001);

        // nominate ownership back to owner
        addressresolver_i.nominateNewOwner(owner);
        proxyerc20_i.nominateNewOwner(owner);
        synthetix_i.nominateNewOwner(owner);
        proxysynthetix_i.nominateNewOwner(owner);
        exchangestate_i.nominateNewOwner(owner);
        systemstatus_i.nominateNewOwner(owner);
        tokenstatesynthetix_i.nominateNewOwner(owner);
        rewardescrow_i.nominateNewOwner(owner);
        rewardsdistribution_i.nominateNewOwner(owner);
    }
}

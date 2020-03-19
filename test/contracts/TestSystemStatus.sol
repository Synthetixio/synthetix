pragma solidity >=0.4.25 <0.6.0;
// pragma solidity 0.4.25;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../../contracts/SystemStatus.sol";


contract TestSystemStatus {
    function testSystemStatus() {
        SystemStatus status = SystemStatus(DeployedAddresses.SystemStatus());

        // uint expected = 10000;

        Assert.equal(status.paused, false, "Must not initially be paused");
    }

    // function testInitialBalanceWithNewMetaCoin() {
    //     MetaCoin meta = new MetaCoin();

    //     uint expected = 10000;

    //     Assert.equal(meta.getBalance(tx.origin), expected, "Owner should have 10000 MetaCoin initially");
    // }
}

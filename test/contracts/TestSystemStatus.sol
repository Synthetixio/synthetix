pragma solidity >=0.4.25 <0.6.0;
// pragma solidity 0.4.25;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../../contracts/SystemStatus.sol";


contract TestSystemStatus {
    function testSystemStatus() {
        SystemStatus status = SystemStatus(DeployedAddresses.SystemStatus());

        (bool suspend, uint256 reason) = status.systemSuspension();

        Assert.equal(suspend, false, "Must not initially be paused");
        Assert.equal(reason, 0, "Must not initially be paused");
    }
}

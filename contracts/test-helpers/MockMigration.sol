pragma solidity ^0.8.4;

import "../BaseMigration.sol";
import "../Owned.sol";

contract MockMigration is BaseMigration {
    constructor(address _owner) public BaseMigration(_owner) {}

    function canOnlyBeRunByDeployer() external onlyDeployer {}

    function acceptOwnership(address someContract) external {
        Owned(someContract).acceptOwnership();
    }
}

pragma solidity ^0.8.9;

import "../BaseMigration.sol";
import "../Owned.sol";

contract MockMigration is BaseMigration {
    constructor(address _owner) BaseMigration(_owner) {}

    function canOnlyBeRunByDeployer() external onlyDeployer {}

    function acceptOwnership(address someContract) external {
        Owned(someContract).acceptOwnership();
    }
}

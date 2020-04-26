pragma solidity ^0.5.16;
import "./Owned.sol";
import "./AddressResolver.sol";
import "./Proxy.sol";
import "./SystemStatus.sol";

interface IMigration {
    // pass the index to handle situations where the migration takes a few transactions to process
    function migrate(uint256 index) external;

    function numOfScripts() external view returns (uint);
}

contract DelegatedMigrator is Owned {
    uint waitingPeriod;

    struct Migration {
        bytes32 name;
        uint acceptedTimestamp;
        IMigration target;
        bytes32[] contractNames;
        address[] contractDestination;
    }

    AddressResolver resolver = AddressResolver(0);

    mapping(bytes32 => Migration) proposals;

    constructor(address _owner) public Owned(_owner) {
        waitingPeriod = 3 hours;
    }

    function setWaitingPeriod(uint _waitingPeriod) external onlyOwner {
        waitingPeriod = _waitingPeriod;
    }

    function propose(bytes32 version /* proposal details */) external {
        // Anyone can call
        require(proposals[version].target == IMigration(0), "Cannot modify existing proposal");
        // ..
    }

    function accept(bytes32 version) external onlyOwner {
        // ..
    }

    function reject(bytes32 version) external onlyOwner {
        // ..
    }

    function execute(bytes32 version, uint index) external onlyOwner {
        Migration memory migration = proposals[version];
        require(migration.acceptedTimestamp > 0, "Must be accepted to execute");
        require(now > migration.acceptedTimestamp + waitingPeriod, "Waiting period not yet expired");

        SystemStatus status = SystemStatus(resolver.getAddress("SystemStatus"));
        if (index == 0) {
          // deactivate system
          status.suspendSystem(0);
        }

        (bool success, ) = address(migration.target).delegatecall(abi.encodePacked(migration.target.migrate.selector, version, index));

        if (index + 1 == migration.target.numOfScripts() && success) {
          // reactivate system
          status.resumeSystem();
        }
    }

}

// Example Migration script
// is DelegatedMigrator to make it easier to access storage.
contract MyMigration is IMigration, DelegatedMigrator {

    function migrate(bytes32 version, uint /* index */ ) public {
        Migration memory migration = proposals[version];

        // 1) Update targets of existing contracts
        for (uint i = 0; i < migration.contractNames.length; i++) {
            address oldAddress = resolver.getAddress(migration.contractNames[i]);
            if (oldAddress != address(0)) {
                Proxy proxy = Proxy(address(uint160(oldAddress)));
                proxy.setTarget(Proxyable(address(uint160(migration.contractDestination[i]))));
            }
        }

        // 2) Update caches in resolver.
        // This also Mark all caches as invalidated in individual contracts
        resolver.importAddresses(migration.contractNames, migration.contractDestination);

        // do more stuff?
    }

    function numOfScripts() external view returns (uint) {
        // Albeit there is support for multi step scripts, it's likely we'll only need one step
        // Yay atomic upgrades!
        return 1;
    }
}

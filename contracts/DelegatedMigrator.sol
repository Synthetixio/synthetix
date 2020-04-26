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
        uint acceptedTimestamp;
        IMigration target;
        address dataStore;
    }

    AddressResolver resolver = AddressResolver(0);

    mapping(bytes32 => Migration) proposals;

    constructor(address _owner) public Owned(_owner) {
        waitingPeriod = 3 hours;
    }

    function setWaitingPeriod(uint _waitingPeriod) external onlyOwner {
        waitingPeriod = _waitingPeriod;
    }

    function propose(
        bytes32 version,
        IMigration target,
        address dataStore
    )
        external
    {
        // Anyone can call
        require(proposals[version].target == IMigration(0), "Cannot modify existing proposal");
        require(address(target) != address(0), "Invalid target");
        proposals[version] = Migration(
                0,
                target,
                dataStore
            );
    }

    function accept(bytes32 version) external onlyOwner {
        require(proposals[version].target != IMigration(0), "invalid proposal");
        proposals[version].acceptedTimestamp = now;
    }

    function reject(bytes32 version) external onlyOwner {
        require(proposals[version].target != IMigration(0), "invalid proposal");
        delete proposals[version];
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
          delete proposals[version];
        }
    }

}

// Example Migration script
// It inherits DelegatedMigrator to make it easier to access storage.
// Since the migrator makes delegated call into this script, this script must be trustable
contract MigrationScript is IMigration, DelegatedMigrator {

    function migrate(bytes32 version, uint /* index */ ) public {
        Migration memory migration = proposals[version];
        MigrationData dataStore = MigrationData(migration.dataStore);

        (bytes32[] memory contractNames, address[] memory contractDestinations) =
            dataStore.getContracts();

        // 1) Update targets of existing contracts.
        for (uint i = 0; i < contractNames.length; i++) {
            address oldAddress = resolver.getAddress(contractNames[i]);
            if (oldAddress != address(0)) {
                Proxy proxy = Proxy(address(uint160(oldAddress)));
                proxy.setTarget(Proxyable(address(uint160(contractDestinations[i]))));
            }
        }

        // 2) Update caches in resolver.
        // This also marks all caches as invalidated in individual contracts
        resolver.importAddresses(contractNames, contractDestinations);

        // do more stuff?
    }

    function numOfScripts() external view returns (uint) {
        // Albeit there is support for multi step scripts, it's likely we'll only need one step
        // Yay atomic upgrades!
        return 1;
    }
}

// Example Migration datastore
contract MigrationData is Owned {
    bytes32[] public contractNames;
    address[] public contractDestinations;

    constructor(address _owner) public Owned(_owner) {}

    function setContracts(bytes32[] memory _contractNames, address[] memory _contractDestinations) public onlyOwner {
        contractNames = _contractNames;
        contractDestinations = _contractDestinations;
    }

    function getContracts() public view returns(bytes32[] memory, address[] memory) {
        return(contractNames, contractDestinations);
    }
}

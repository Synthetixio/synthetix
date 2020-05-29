pragma solidity >=0.4.24;


interface IRewardEscrow {
    // Views
    function balanceOf(address account) external view returns (uint);

    function numVestingEntries(address account) external view returns (uint);

    // Mutative functions
    function appendVestingEntry(address account, uint quantity) external;

    function vest() external;
}

pragma solidity ^0.5.16;


interface ISynthetixEscrow {
    function balanceOf(address account) external view returns (uint);

    function appendVestingEntry(address account, uint quantity) external;
}

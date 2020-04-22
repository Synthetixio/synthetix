pragma solidity ^0.5.16;


/**
 * @title SynthetixEscrow interface
 */
interface ISynthetixEscrow {
    function balanceOf(address account) external view returns (uint);

    function appendVestingEntry(address account, uint quantity) external;
}

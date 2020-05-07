pragma solidity ^0.5.16;


interface IHasBalance {
    // Views
    function balanceOf(address account) external view returns (uint);
}

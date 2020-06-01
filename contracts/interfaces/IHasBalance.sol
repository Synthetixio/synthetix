pragma solidity >=0.4.24;


interface IHasBalance {
    // Views
    function balanceOf(address account) external view returns (uint);
}

pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/IHasBalance
interface IHasBalance {
    // Views
    function balanceOf(address account) external view returns (uint);
}

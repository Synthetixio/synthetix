pragma solidity >=0.4.24;

interface IOwnerRelay {
    function relay(address target, bytes calldata data) external;
}

pragma solidity ^0.5.16;

import "../Owned.sol";
import "../MixinResolver.sol";


contract TestableMixinResolver is Owned, MixinResolver {
    bytes32 private constant CONTRACT_EXAMPLE_1 = "Example_1";
    bytes32 private constant CONTRACT_EXAMPLE_2 = "Example_2";
    bytes32 private constant CONTRACT_EXAMPLE_3 = "Example_3";

    bytes32[24] private addressesToCache = [CONTRACT_EXAMPLE_1, CONTRACT_EXAMPLE_2, CONTRACT_EXAMPLE_3];

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}
}

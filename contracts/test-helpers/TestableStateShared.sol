pragma solidity ^0.5.16;

import "../Owned.sol";
import "../StateShared.sol";

contract TestableStateShared is Owned, StateShared {
    constructor(address _owner, address[] memory _associatedContracts)
        public
        Owned(_owner)
        StateShared(_associatedContracts)
    {}

    function testModifier() external onlyAssociatedContracts {}
}

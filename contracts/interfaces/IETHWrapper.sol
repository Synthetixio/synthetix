pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/iethwrapper
contract IETHWrapper {
    function mint(uint _amount) external payable;

    function burn(uint amount) external;

    function capacity() external view returns (uint);

    // function remainingCapacity() external view returns (uint);
}

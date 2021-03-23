pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/iethwrapper
contract IETHWrapper {
    function mint(uint _amount) external payable;

    function burn(uint amount) external;
}

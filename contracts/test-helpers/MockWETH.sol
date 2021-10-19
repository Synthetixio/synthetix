pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IWETH.sol";

// IWETH
contract MockWETH is ERC20 {
    constructor() public ERC20("Wrapped Ether", "WETH") {
        _mint(msg.sender, 1000000 * (10**18));
    }

    function deposit() external {
        revert("Unimplemented for OVM");
    }

    function withdraw(uint amount) external {
        amount;
        revert("Unimplemented for OVM");
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

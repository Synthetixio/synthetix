pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "../interfaces/IWETH.sol";

// IWETH
contract MockWETH is ERC20, ERC20Detailed {
    constructor() public ERC20Detailed("Wrapped Ether", "WETH", 18) {
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

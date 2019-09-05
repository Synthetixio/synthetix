# SafeMath

Synthetix uses OpenZeppelin's [SafeMath](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/math/SafeMath.sol) library to ensure that overflows and zero division revert the transactions they occur in.

## Interface

```Solidity
function add(uint256 a, uint256 b) internal pure returns (uint256);
function sub(uint256 a, uint256 b) internal pure returns (uint256);
function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
function mul(uint256 a, uint256 b) internal pure returns (uint256);
function div(uint256 a, uint256 b) internal pure returns (uint256);
function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
function mod(uint256 a, uint256 b) internal pure returns (uint256);
function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256);
```

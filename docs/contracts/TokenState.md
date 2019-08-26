# TokenState

## Notes

An external state contract to hold ERC20 balances and allowances.

## Inherited Contracts

### Direct

* [State](State.md)

### Indirect

* [Owned](Owned.md)

## Variables

* `balanceOf: mapping(address => uint) public`: ERC20 balances, note that as a public variable, this synthesises an accessor which is itself ERC20 compliant, so balances can be queried directly from the state contract.
* `allowance: mapping(address => mapping(address => uint)) public`: ERC20 allowances. Also generates an ERC20 accessor in the same way as the `balanceOf` member.

## Functions

* `setAllowance(address tokenOwner, address spender, uint value)`: only callable by the associated contract.
* `setBalanceOf(address account, uint value)`: only callable by the associated contract.

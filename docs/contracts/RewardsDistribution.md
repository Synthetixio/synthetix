# RewardsDistribution

## Inherited Contracts

* [Owned](Owned.md)

## Libraries

* [SafeMath](SafeMath.md) for uint
* [SafeDecimalMath](SafeDecimalMath.md) for uint

## Related Contracts

* \>[FeePoolProxy](Proxy.md)
* \>[RewardEscrow](RewardEscrow.md)
* \>[SynthetixProxy](Proxy.md)

## Structs

```Solidity
// Stores an address and a portion of the inflationary tokens to send to it.
struct DistributionData {
    address destination;
    uint amount;
}
```

## Variables

* `address public authority`
* `address public synthetixProxy`
* `address public rewardEscrow`
* `address public feePoolProxy`
* `DistributionData[] public distributions`

## Functions

* `constructor(address _owner, address _authority, address _synthetixProxy, address _rewardEscrow, address _feePoolProxy)`

!!! bug
    'autority' -> 'authority'

### setSynthetixProxy

`function setSynthetixProxy(address _synthetixProxy) external`

## Events

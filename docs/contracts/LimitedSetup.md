# LimitedSetup

## Notes

Allows certain contract functions to only operate during a setup period.

## Variables

* `setupExpiryTime: uint`: the timestamp at which functions which have the `onlyDuringSetup` modifier will cease operating. Determined by the `setupDuration` parameter passed into the contract constructor.

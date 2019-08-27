# SafeDecimalMath

A library contract that handles safe arithmetic with fixed-point decimals at two precision levels. Uses OpenZeppelin SafeMath to protect from arithmetic overflows etc.

## Related Contracts

### Referenced

* SafeMath for uint.

## Variables

* `decimals: uint8 public constant`: 18
* `highPrecisionDecimals: uint8 public constant`: 27
* `UNIT: uint public constant`: 10^18
* `PRECISE_UNIT: uint public constant`: 10^27
* `UNIT_TO_HIGH_PRECISION_CONVERSION_FACTOR: uint private constant`: 10^9 (i.e. PRECISE_UNIT / UNIT)

## Functions

* `unit() returns (uint)`: alias to `UNIT`.
* `preciseUnit() returns (uint)`: alias to `PRECISE_UNIT`.
* `multiplyDecimal(uint x, uint y) returns (uint)`: Low-precision multiplication.
* `_multiplyDecimalRound(uint x, uint y, uint precisionUnit) returns (uint)`: Internal function to multiply numbers at a given level of precision. Rounds to the nearest unit.
* `multiplyDecimalRoundPrecise(uint x, uint y) returns (uint)`: Equivalent to `_multiplyDecimalRound(x, y, PRECISE_UNIT)`.
* `multiplyDecimalRound(uint x, uint y) returns (uint)`: Equivalent to `_multiplyDecimalRound(x, y, UNIT)`
* `divideDecimal(uint x, uint y) returns (uint)`: Low-precision division.
* `_divideDecimalRound(uint x, uint y, uint precisionUnit) returns (uint)`: Internal function to divide numbers at a given level of precision. Rounds to the nearest unit.
* `divideDecimalRound(uint x, uint y) returns (uint)`: Equivalent to `_divideDecimalRound(x, y, UNIT)`.
* `divideDecimalRoundPrecise(uint x, uint y) returns (uint)`: Equivalent to `_divideDecimalRound(x, y, PRECISE_UNIT)`.
* `decimalToPreciseDecimal(uint i) returns (uint)`: returns i multiplied by the conversion factor.
* `preciseDecimalToDecimal(uint i) returns (uint)`: returns i divided by the conversion factor, rounded to the closest unit.

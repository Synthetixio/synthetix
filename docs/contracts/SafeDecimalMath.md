# SafeDecimalMath

## Description

This is a library contract that handles safe arithmetic with unsigned [fixed-point decimals](https://en.wikipedia.org/wiki/Fixed-point_arithmetic).

The provided decimals can operate at either of two different precision levels. Standard precision operations act on numbers with 18 decimal places, such as ordinary token balances. High precision numbers possess 27 decimal places, and have their own corresponding set of functions.

Also included are several functions for converting between precision levels, and operations which round to the nearest increment to remove truncation bias. The library only implements multiplication and division operations as additive operations on fixed point numbers already behave correctly.
These operate by either dividing out the extra fixed point unit after a multiplication, or multiplying it in before a division.

In Synthetix the high precision numbers are used for dealing with the [debt ledger](SynthetixState.md#debtledger), which [is constructed](Synthetix.md#_addtodebtregister) as an extended product of many fractional numbers. As this is a financially-sensitive component of the system, representational precision matters in order to minimise errors resulting from rounding or truncation. All other fractional numbers operate at the standard precision.

`SafeDecimalMath` uses OpenZeppelin's [SafeMath](SafeMath.md) library for most of its basic arithmetic operations in order to protect from arithmetic overflows and zero divisions.

!!! bug
    Licence header does not acknowledge the original authors.

**Source:** [SafeDecimalMath.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SafeDecimalMath.sol)

<section-sep />

## Inheritance Graph

<centered-image>
    ![SafeDecimalMath inheritance graph](../img/graphs/SafeDecimalMath.svg)
</centered-image>

## Libraries

* [SafeMath](SafeMath.md) for `uint`

<section-sep />

## Variables

---

### `decimals`

The number of decimals ($18$) in the standard precision fixed point representation.

**Type:** `uint8 public constant`

**Value:** `18`

---

### `highPrecisionDecimals`

The number of decimals ($27$) in the high precision fixed point representation.

**Type:** `uint8 public constant`

**Value:** `27`

---

### `UNIT`

The standard precision number ($10^{18}$) that represents $1.0$.

**Type:** `uint public constant`

**Value:** `1e18`

---

### `PRECISE_UNIT`

The high precision number ($10^{27}$) that represents $1.0$.

**Type:** `uint public constant`

**Value:** `1e27`

---

### `UNIT_TO_HIGH_PRECISION_CONVERSION_FACTOR`

The factor ($10^9$) to convert between precision levels. Equivalent to `PRECISE_UNIT / UNIT`.

**Type:** `uint private constant`

**Value:** `1e9`

---

<section-sep />

## Functions

---

### `unit`

Pure alias to [`UNIT`](#unit).

??? example "Details"

    **Signature**

    `unit() external pure returns (uint)`

---

### `preciseUnit`

Pure alias to [`PRECISE_UNIT`](#precise_unit).

??? example "Details"

    **Signature**

    `preciseUnit() external pure returns (uint)`

---

### `multiplyDecimal`

Returns the product of two standard precision fixed point numbers, handling precision loss by truncation.

??? example "Details"

    **Signature**
    
    `multiplyDecimal(uint x, uint y) internal pure returns (uint)`

---

### `_multiplyDecimalRound`

Returns the product of two fixed point numbers, handling precision loss by rounding. This function is private, and takes the fixed-point precision as a parameter, only being used to implement [`multiplyDecimalRound`](#multiplydecimalround) and [`multiplyDecimalRoundPrecise`](#multiplydecimalroundprecise).

??? example "Details"

    **Signature**
    
    `_multiplyDecimalRound(uint x, uint y, uint precisionUnit) private pure returns (uint)`

---

### `multiplyDecimalRoundPrecise`

Returns the product of two high precision fixed point numbers, handling precision loss by rounding.

Equivalent to [`_multiplyDecimalRound(x, y, PRECISE_UNIT)`](#_multiplydecimalround).

??? example "Details"

    **Signature**
    
    `multiplyDecimalRoundPrecise(uint x, uint y) internal pure returns (uint)`

---

### `multiplyDecimalRound`

Returns the product of two standard precision fixed point numbers, handling precision loss by rounding.

Equivalent to [`_multiplyDecimalRound(x, y, UNIT)`](#_multiplydecimalround).

??? example "Details"

    **Signature**
    
    `multiplyDecimalRound(uint x, uint y) internal pure returns (uint)`

---

### `divideDecimal`

Returns the quotient of two standard precision fixed point numbers, handling precision loss by truncation.

??? example "Details"

    **Signature**
    
    `divideDecimal(uint x, uint y) internal pure returns (uint)`

---

### `_divideDecimalRound`

Returns the quotient of two fixed point numbers, handling precision loss by rounding. This function is private, and takes the fixed-point precision as a parameter, only being used to implement [`divideDecimalRound`](#dividedecimalround) and [`divideDecimalRoundPrecise`](#dividedecimalroundprecise).

??? example "Details"

    **Signature**
    
    `_divideDecimalRound(uint x, uint y, uint precisionUnit) private pure returns (uint)`

---

### `divideDecimalRound`

Returns the quotient of two standard precision fixed point numbers, handling precision loss by rounding.

Equivalent to [`_divideDecimalRound(x, y, UNIT)`](#_dividedecimalround).

??? example "Details"

    **Signature**
    
    `divideDecimalRound(uint x, uint y) internal pure returns (uint)`

---

### `divideDecimalRoundPrecise`

Returns the quotient of two high precision fixed point numbers, handling precision loss by rounding.

Equivalent to [`_divideDecimalRound(x, y, PRECISE_UNIT)`](#_dividedecimalround).

??? example "Details"

    **Signature**
    
    `divideDecimalRoundPrecise(uint x, uint y) internal pure returns (uint)`

---

### `decimalToPreciseDecimal`

Converts from standard precision to high precision numbers. This is just multiplication by $10^9$.

??? example "Details"

    **Signature**

    `decimalToPreciseDecimal(uint i) internal pure returns (uint)`

---

### `preciseDecimalToDecimal`

Converts from high precision to standard precision numbers. This is division by $10^9$, where precision loss is handled by rounding.

??? example "Details"

    **Signature**

    `preciseDecimalToDecimal(uint i) internal pure returns (uint)`

---

<section-sep />

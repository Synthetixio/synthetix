# Math

## Description

This is a library contract that provides math functions on fractional numbers, performing arithmetic with unsigned [fixed-point decimals](https://en.wikipedia.org/wiki/Fixed-point_arithmetic).

[^1]: Math currently provides a `power` function for calculating the exponentiation of a decimal number to 18 decimal places.

Math uses OpenZeppelin's [SafeMath](SafeMath.md) library and SafeDecimalMath library for most of its basic arithmetic operations in order to protect from arithmetic overflows and zero divisions.

**Source:** [Math.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Math.sol)

## Architecture

---

### Libraries

- [SafeMath](SafeMath.md) for `uint`
- [SafeDecimalMath](SafeDecimalMath.md) for `uint`

---

## Functions

---

### `powDecimal`

Returns the exponentiation of the base (x) integer by the n^th power to precision of 18 decimals. Function calculates the result using exponentiation by squaring, handling preciison loss by truncation and removes the order of magnitude introduced with integer arithmetics each time the base is squared.

??? example "Details"

    **Signature**

    `function powDecimal(uint x, uint n)
`

---

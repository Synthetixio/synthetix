# SafeDecimalMath

## Description

This is a library contract that provides the ability to manipulate fractional numbers, performing safe arithmetic with unsigned [fixed-point decimals](https://en.wikipedia.org/wiki/Fixed-point_arithmetic).

The decimals this library provides can operate at either of two different precision levels. Standard precision operations act on numbers with 18 decimal places. High precision numbers possess 27 decimal places, and have their own corresponding set of functions.[^1]

[^1]: SafeDecimalMath provides two different precision levels because the Ethereum virtual machine encodes integers in 256 bits. Given a finite integer size, an increase in precision implies a decrease in the maximum representable number, since more bits are dedicated to representing the fractional part, and fewer to the integer part.

Several functions are included for converting between precision levels, and operations which round to the nearest increment to remove truncation bias. In SafeDecimalMath, a half-increment rounds up.

SafeDecimalMath uses OpenZeppelin's [SafeMath](SafeMath.md) library for most of its basic arithmetic operations in order to protect from arithmetic overflows and zero divisions.

In Synthetix, the standard precision fixed point numbers are used to deal with most fractional quantities, such as token balances and prices.
The high-precision numbers are mainly used for dealing with the [debt ledger](SynthetixState.md#debtledger), which [is constructed](Synthetix.md#_addtodebtregister) as an extended product of many fractional numbers very close to $1$. As this is a financially-sensitive component of the system, representational precision matters in order to minimise errors resulting from rounding or truncation.

### Fixed-Point Mechanics

#### Representation

For a precision of $d$ deimal places, this fixed point library chooses a large integer $\dot{u} = 10^d$ to represent the number $1$ (e.g. [`UNIT`](#unit) = $10^{18}$) and all operations at this precision level happen relative to $\dot{u}$. That is, the fixed point representation of a number $q$ is defined to be the integer $\dot{q}$:

!!! example ""

    $$
    \dot{q} \ := \ q \ \dot{u} \ = \ q \times 10^d
    $$

For example, at 27 decimal places, $\dot{25}$ is equivalent to $25 \times 10^{27}$. We will use square brackets to capture the fixed point representation of composite expressions.

Note that this is only valid if $\dot{q}$ is an integer, so nothing is representable which has a positive value in the decimal places smaller than $\frac{1}{\dot{u}}$ (i.e. the integer 1).

#### Operations

We define the fixed point operations $\dot{+}$, $\dot{-}$, $\dot{\times}$, $\dot{/}$, corresponding to the ordinary arithmetic operations $+$, $-$, $\times$, $/$, where $/$ corresponds to integer division. These are implemented by [`SafeMath`](SafeMath.md) and protect from overflow.

---

##### Additive Operations

We define our additive fixed point operators to be the same as the standard ones:

!!! info "Definition: Fixed Point Addition and Subtraction"

    $$
    x \ \dot{+} \ y \ := \ x + y \\
    x \ \dot{-} \ y \ := \ x - y
    $$

This is because:

!!! example ""

    $$
    \dot{p} \pm \dot{q} \ := \ p \dot{u} \pm q \dot{u} \ = \ (p \pm q) \dot{u} \ =: \ \dot{[p \pm q]}
    $$

---

##### Multiplicative Operations

The multiplicative operations are defined as follows:

!!! info "Definition: Fixed Point Multiplication and Division"

    $$
    x \ \dot{\times} \ y \ := \ (x \times y) \ / \ \dot{u} \\
    x \ \dot{/} \ y \ := \ (x \times \dot{u}) \ / \ y
    $$

Some care has to be taken for multiplication and division. We desire, for example, $\dot{p} \ \dot{\times} \ \dot{q} = \dot{[p \times q]}$. However, if the standard operations are performed naively, the following results are obtained:

!!! example ""

    $$
    \dot{p} \times \dot{q} \ := \ p \dot{u} \times q \dot{u} \ = \ (p \times q) \dot{u}^2 \ =: \ \dot{[(p \pm q) \dot{u}]} \\
    \dot{p} \ / \ \dot{q} \ := \ p \dot{u} \ / \ q \dot{u} \ = \ p \ / \ q
    $$

So multiplication produces an extra unwanted unit factor, and division divides one out; the fixed point operations need to account for this. Note that to ensure minimum precision loss, $\dot{u}$ is divided out last in the case of multiplication and multiplied in first in the case of division.

###### Rounding

Note that multiplication and division of fixed point numbers may involve some loss of precision in the lowest digit. Such inaccuracy can accumulate over many operations

Synthetix provides versions of $\dot{\times}$ and $\dot{/}$ which perform the operation with one extra internal digit of precision, and then rounds up if the least significant digit is 5 or greater. Consequently, results exactly halfway between two increments are rounded up.

---

##### Change of Precision

The representation of a number $q$ at two different fixed point precision levels $\dot{q} = q \dot{u}$ and $\ddot{q} = q \ddot{u}$ is straightforward if $\dot{u}$ and $\ddot{u}$ divide evenly. If this is the case, and $\ddot{u}$ is the higher precision unit, then $\ddot{q} / \dot{q} = \ddot{u} / \dot{u}$. So converting between the high and low precision only involves multiplying or dividing by a factor of $\ddot{u} / \dot{u}$. Keep in mind that converting from a high precision to a low precision number involves some loss of information, and this operation is performed with rounding.

---

**Source:** [SafeDecimalMath.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SafeDecimalMath.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SafeDecimalMath inheritance graph](../img/graphs/SafeDecimalMath.svg)
</centered-image>

---

### Libraries

- [SafeMath](SafeMath.md) for `uint`

---

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

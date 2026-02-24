# Math Functions

Math functions provide numeric operations for rounding, clamping, and mathematical computations within formulas.

## Rounding Functions

### ROUND

Rounds a value to a specified number of decimal places.

**Syntax:**

```
ROUND(value, decimals?)
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | number | required | The number to round |
| `decimals` | number | `0` | Number of decimal places |

**Implementation:** Uses `Math.round(value * 10^decimals) / 10^decimals` (banker's rounding is NOT used).

**Examples:**

```
ROUND(357.14286, 2)     --> 357.14
ROUND(357.14286, 0)     --> 357
ROUND(357.14286)        --> 357
ROUND(grainLoad / 56, 2)  --> ROUND(357.14286, 2) --> 357.14
```

### FLOOR

Rounds a value down to the nearest integer.

**Syntax:**

```
FLOOR(value)
```

**Examples:**

```
FLOOR(357.9)            --> 357
FLOOR(BUSHELS(20000))   --> FLOOR(357.14) --> 357
FLOOR(grainLoad / 56)   --> 357
```

### CEIL

Rounds a value up to the nearest integer.

**Syntax:**

```
CEIL(value)
```

**Examples:**

```
CEIL(357.1)             --> 358
CEIL(BUSHELS(20000))    --> CEIL(357.14) --> 358
CEIL(grainLoad / 56)    --> 358
```

## Value Functions

### ABS

Returns the absolute (non-negative) value.

**Syntax:**

```
ABS(value)
```

**Examples:**

```
ABS(-500)               --> 500
ABS(500)                --> 500
ABS(corn - rye)         --> ABS(70 - 21) --> 49
```

### MIN

Returns the smallest of the provided values.

**Syntax:**

```
MIN(arg1, arg2, ...)
```

**Examples:**

```
MIN(corn, rye, malt)           --> MIN(70, 21, 9) --> 9
MIN(grainLoad, 25000)          --> MIN(20000, 25000) --> 20000
MIN(waterLoad * 0.9, 5000)     --> MIN(4500, 5000) --> 4500
```

### MAX

Returns the largest of the provided values.

**Syntax:**

```
MAX(arg1, arg2, ...)
```

**Examples:**

```
MAX(corn, rye, malt)           --> MAX(70, 21, 9) --> 70
MAX(grainLoad, 15000)          --> MAX(20000, 15000) --> 20000
MAX(waterLoad * 0.8, 4000)     --> MAX(4000, 4000) --> 4000
```

**Clamping pattern** -- constrain a value within a range:

```
MIN(MAX(grainLoad * 0.02, 200), 600)
```
This ensures the result is at least 200 and at most 600.

## Power and Root Functions

### POW

Raises a base to an exponent.

**Syntax:**

```
POW(base, exponent)
```

**Examples:**

```
POW(2, 10)              --> 1024
POW(10, 3)              --> 1000
POW(grainLoad / 1000, 2)  --> POW(20, 2) --> 400
```

### SQRT

Returns the square root of a value.

**Syntax:**

```
SQRT(value)
```

**Examples:**

```
SQRT(144)               --> 12
SQRT(20000)             --> 141.42...
SQRT(POW(corn, 2) + POW(rye, 2))  --> SQRT(4900 + 441) --> SQRT(5341) --> 73.1...
```

## Logarithmic and Exponential Functions

### LOG

Returns the natural logarithm (base e) of a value.

**Syntax:**

```
LOG(value)
```

**Examples:**

```
LOG(1)                  --> 0
LOG(2.71828)            --> ~1.0
LOG(20000)              --> 9.903...
```

### LOG10

Returns the base-10 logarithm of a value.

**Syntax:**

```
LOG10(value)
```

**Examples:**

```
LOG10(1000)             --> 3
LOG10(20000)            --> 4.301...
LOG10(100)              --> 2
```

### EXP

Returns e raised to the given power.

**Syntax:**

```
EXP(value)
```

**Examples:**

```
EXP(0)                  --> 1
EXP(1)                  --> 2.71828...
EXP(LOG(20000))         --> 20000 (inverse of LOG)
```

## Common Combinations

### Rounded Bushel Conversion

```
ROUND(grainLoad / lbsPerBushel, 2)
```
`20000 / 56` = 357.14286 -> **357.14**

### Clamped Additive Dosage

Ensure a chemical additive stays within safe bounds:

```
ROUND(MIN(MAX(grainLoad * 0.003, 40), 120), 1)
```
`20000 * 0.003` = 60.0, which is between 40 and 120 -> **60.0**

### Whole-Bushel Grain Orders

Round up to the nearest whole bushel for ordering:

```
CEIL(grainLoad * corn / 100 / lbsPerBushel) * lbsPerBushel
```
`CEIL(14000 / 56) * 56` = `CEIL(250) * 56` = `250 * 56` = **14000**

## Related Pages

- [Conditional Functions](./conditional-functions.md) -- Combine with IF for conditional rounding
- [Conversion Functions](./conversion-functions.md) -- Often wrapped in ROUND
- [Common Patterns](../common-patterns.md) -- Full formula examples

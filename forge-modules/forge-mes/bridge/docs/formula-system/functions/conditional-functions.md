# Conditional Functions

Conditional functions provide branching and logical operations within formulas. They are essential for adapting calculations based on mash bill composition, load sizes, or other production parameters.

## IF

Evaluates a condition and returns one of two values.

**Syntax:**

```
IF(condition, trueValue, falseValue)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `condition` | any | Expression that evaluates to truthy or falsy |
| `trueValue` | any | Returned when condition is truthy |
| `falseValue` | any | Returned when condition is falsy |

**Truthiness:** Any non-zero number is truthy. `0`, `false`, `null`, and `undefined` are falsy.

**Examples:**

```
IF(corn > 50, grainLoad * 0.70, grainLoad * 0.60)
```
With `corn = 70`, `grainLoad = 20000`: corn > 50 is true, so result = `20000 * 0.70` = **14000**

```
IF(rye == 0, 0, grainLoad * rye / 100)
```
With `rye = 21`, `grainLoad = 20000`: rye is not 0, so result = `20000 * 21 / 100` = **4200**

**Nested IF:**

```
IF(corn > 70, 1.3, IF(corn > 50, 1.2, 1.0))
```
With `corn = 65`: first condition false, second condition true, result = **1.2**

## AND

Returns `true` if all arguments are truthy.

**Syntax:**

```
AND(arg1, arg2, ...)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `...args` | any[] | Variable number of values to evaluate |

**Examples:**

```
IF(AND(corn > 50, rye > 10), grainLoad * 1.1, grainLoad)
```
With `corn = 70`, `rye = 21`, `grainLoad = 20000`: both conditions true, result = `20000 * 1.1` = **22000**

```
AND(corn > 0, rye > 0, malt > 0)
```
With `corn = 70`, `rye = 21`, `malt = 9`: all non-zero, result = **true**

## OR

Returns `true` if any argument is truthy.

**Syntax:**

```
OR(arg1, arg2, ...)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `...args` | any[] | Variable number of values to evaluate |

**Examples:**

```
IF(OR(wheat > 0, rye > 20), grainLoad * 0.05, grainLoad * 0.03)
```
With `wheat = 0`, `rye = 21`, `grainLoad = 20000`: rye > 20 is true, result = `20000 * 0.05` = **1000**

```
OR(wheat > 50, rye > 50)
```
With `wheat = 0`, `rye = 21`: neither condition true, result = **false**

## NOT

Returns the logical negation of a value.

**Syntax:**

```
NOT(value)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | any | Value to negate |

**Examples:**

```
IF(NOT(corn == 0), BUSHELS(grainLoad * corn / 100), 0)
```
With `corn = 70`, `grainLoad = 20000`: corn is not 0, result = `BUSHELS(14000)` = **250**

```
NOT(wheat > 0)
```
With `wheat = 0`: wheat > 0 is false, NOT(false) = **true**

## Combining Conditionals

Conditional functions are frequently combined for complex production logic:

```
IF(
  AND(corn > 50, NOT(wheat > 0)),
  grainLoad * 0.70,
  IF(OR(wheat > 30, rye > 30),
    grainLoad * 0.65,
    grainLoad * 0.60
  )
)
```

This formula:
1. If corn > 50% and no wheat: use 70% grain ratio
2. Else if wheat or rye > 30%: use 65% ratio
3. Otherwise: use 60% ratio

## Alternative: Ternary Operator

For simple conditions, the ternary operator `? :` is a concise alternative to `IF`:

```
corn > 50 ? grainLoad * 0.70 : grainLoad * 0.60
```

This is functionally identical to:

```
IF(corn > 50, grainLoad * 0.70, grainLoad * 0.60)
```

Use `IF` for nested conditions and `? :` for simple one-line checks.

## Related Pages

- [Expression Syntax](../expression-syntax.md) -- Operators and ternary syntax
- [Math Functions](./math-functions.md) -- Often combined with conditional logic
- [Common Patterns](../common-patterns.md) -- Real-world conditional formula examples

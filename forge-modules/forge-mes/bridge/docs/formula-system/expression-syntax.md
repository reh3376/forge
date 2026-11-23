# Expression Syntax

The formula system uses the [expr-eval](https://github.com/nicolewhite/expr-eval) library for parsing and evaluating expressions. This page covers the complete syntax reference.

## Basics

An expression is a string that combines **variables**, **operators**, **functions**, and **literals** to produce a numeric result.

```
grainLoad * corn / 100
```

### The `=` Prefix

Expressions may optionally start with `=`, similar to spreadsheet formulas. The engine strips this prefix automatically before evaluation.

```
=grainLoad * corn / 100
```

is identical to:

```
grainLoad * corn / 100
```

This is a convenience for users accustomed to Excel-style formula entry.

## Literals

| Type | Examples | Notes |
|------|----------|-------|
| Integer | `42`, `20000`, `0` | Standard integers |
| Decimal | `3.14`, `0.70`, `56.0` | Floating-point numbers |
| Boolean | `true`, `false` | Used in conditional expressions |
| String | `"hello"` | Limited use; most formulas are numeric |

## Operators

### Arithmetic Operators

| Operator | Description | Example | Result |
|----------|-------------|---------|--------|
| `+` | Addition | `20000 + 5000` | `25000` |
| `-` | Subtraction | `20000 - 14000` | `6000` |
| `*` | Multiplication | `20000 * 0.70` | `14000` |
| `/` | Division | `20000 / 56` | `357.14...` |
| `%` | Modulo | `20000 % 56` | `48` |
| `^` | Exponentiation | `2 ^ 10` | `1024` |

### Comparison Operators

| Operator | Description | Example | Result |
|----------|-------------|---------|--------|
| `==` | Equal | `corn == 70` | `true` |
| `!=` | Not equal | `rye != 0` | `true` |
| `<` | Less than | `corn < 50` | `false` |
| `>` | Greater than | `corn > 50` | `true` |
| `<=` | Less than or equal | `malt <= 10` | `true` |
| `>=` | Greater than or equal | `rye >= 21` | `true` |

### Logical Operators

| Operator | Description | Example | Result |
|----------|-------------|---------|--------|
| `and` | Logical AND | `corn > 50 and rye > 10` | `true` |
| `or` | Logical OR | `wheat > 0 or rye > 0` | `true` |
| `not` | Logical NOT | `not (corn == 0)` | `true` |

### Ternary Operator

The ternary operator provides inline conditional logic:

```
condition ? trueValue : falseValue
```

Example -- choose water ratio based on corn percentage:

```
corn > 50 ? waterLoad * 0.85 : waterLoad * 0.90
```

With `corn = 70` and `waterLoad = 5000`, this yields `5000 * 0.85` = **4250**.

## Operator Precedence

From highest to lowest precedence:

| Priority | Operators |
|----------|-----------|
| 1 (highest) | `^` (exponentiation) |
| 2 | `*`, `/`, `%` |
| 3 | `+`, `-` |
| 4 | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| 5 | `not` |
| 6 | `and` |
| 7 | `or` |
| 8 (lowest) | `? :` (ternary) |

Use parentheses to override default precedence:

```
(grainLoad + 500) * corn / 100
```

## Parentheses

Parentheses group sub-expressions and clarify evaluation order:

```
ROUND((grainLoad * corn / 100) / lbsPerBushel, 2)
```

Nested parentheses are fully supported:

```
ROUND(((grainLoad * (corn / 100)) / lbsPerBushel) * gallonsPerBushel, 1)
```

## Function Calls

Functions are called with uppercase names and parenthesized arguments:

```
FUNCTION_NAME(arg1, arg2, ...)
```

Examples:

```
ROUND(grainLoad / 56, 2)
IF(corn > 50, grainLoad * 0.70, grainLoad * 0.60)
MAX(corn, rye, wheat, malt)
BUSHELS(grainLoad)
```

Functions can be nested:

```
ROUND(BUSHELS(grainLoad * corn / 100), 2)
```

See [Function Reference](./functions/README.md) for the complete function list.

## Variables

Variables are referenced by name directly in expressions. They are case-sensitive.

```
grainLoad * corn / 100
```

Here `grainLoad` and `corn` are variables injected from the production context.

See [Variable Reference](./variables/README.md) for all available variables.

## Complete Example

A complex formula combining multiple features -- calculate the total mash water volume in liters, rounding to 1 decimal place:

```
=ROUND(GALLONS_TO_LITERS((grainLoad / lbsPerBushel) * gallonsPerBushel), 1)
```

Step-by-step with `grainLoad = 20000`:

1. `grainLoad / lbsPerBushel` = `20000 / 56` = `357.1428...`
2. `357.1428 * gallonsPerBushel` = `357.1428 * 4.5` = `1607.1428...`
3. `GALLONS_TO_LITERS(1607.1428)` = `1607.1428 * 3.78541` = `6083.78...`
4. `ROUND(6083.78, 1)` = **6083.8**

## Validation

The expression engine provides a `validate()` method that:

1. Checks for syntax errors (malformed expressions, unbalanced parentheses).
2. Detects all referenced variables.
3. Warns about unknown variables not in the known variable list.
4. Returns required vs. optional variable classifications.

Validation runs without executing the expression, making it safe for formula previews and editor feedback.

## Related Pages

- [Function Reference](./functions/README.md)
- [Variable Reference](./variables/README.md)
- [Common Patterns](./common-patterns.md)
- [Troubleshooting](./troubleshooting.md)

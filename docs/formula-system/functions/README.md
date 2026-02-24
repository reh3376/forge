# Function Reference

The formula system provides three categories of functions: built-in system functions registered at startup, and dynamic functions loaded from the database at runtime.

## Function Categories

### Built-in System Functions

These are hardcoded in the `ExpressionEngineService` and always available.

| Category | Functions | Description |
|----------|-----------|-------------|
| [Conditional](./conditional-functions.md) | `IF`, `AND`, `OR`, `NOT` | Logic and branching |
| [Math](./math-functions.md) | `ROUND`, `FLOOR`, `CEIL`, `ABS`, `MIN`, `MAX`, `POW`, `SQRT`, `LOG`, `LOG10`, `EXP` | Numeric operations |
| [Conversion](./conversion-functions.md) | `BUSHELS`, `METRIC_TONS`, `GALLONS_TO_LITERS`, `LITERS_TO_GALLONS`, `KG_TO_LBS`, `LBS_TO_KG` | Unit conversions |

### Dynamic Functions

These are loaded from the `FormulaFunction` database table on module initialization.

| Type | Description |
|------|-------------|
| [EXPRESSION](./dynamic-functions.md#expression-functions) | User-defined functions backed by an expression string |
| [UNIT_CONVERSION](./dynamic-functions.md#unit-conversion-functions) | Conversion functions calculated from unit pair definitions |

See [Dynamic Functions](./dynamic-functions.md) for details on creating and managing custom functions.

## Calling Convention

All functions use uppercase names with parenthesized, comma-separated arguments:

```
FUNCTION_NAME(arg1, arg2, arg3)
```

Functions can be nested:

```
ROUND(BUSHELS(grainLoad * corn / 100), 2)
```

## Quick Reference Table

| Function | Arguments | Returns | Example |
|----------|-----------|---------|---------|
| `IF` | `(condition, trueVal, falseVal)` | Value based on condition | `IF(corn > 50, 1.2, 1.0)` |
| `AND` | `(...args)` | `true` if all truthy | `AND(corn > 0, rye > 0)` |
| `OR` | `(...args)` | `true` if any truthy | `OR(wheat > 0, rye > 0)` |
| `NOT` | `(value)` | Logical negation | `NOT(corn == 0)` |
| `ROUND` | `(value, decimals?)` | Rounded number | `ROUND(357.14, 1)` -> `357.1` |
| `FLOOR` | `(value)` | Rounded down | `FLOOR(357.7)` -> `357` |
| `CEIL` | `(value)` | Rounded up | `CEIL(357.1)` -> `358` |
| `ABS` | `(value)` | Absolute value | `ABS(-500)` -> `500` |
| `MIN` | `(...args)` | Minimum value | `MIN(corn, rye, malt)` -> `9` |
| `MAX` | `(...args)` | Maximum value | `MAX(corn, rye, malt)` -> `70` |
| `POW` | `(base, exp)` | Power | `POW(2, 10)` -> `1024` |
| `SQRT` | `(value)` | Square root | `SQRT(144)` -> `12` |
| `LOG` | `(value)` | Natural log | `LOG(2.718)` -> `~1.0` |
| `LOG10` | `(value)` | Log base 10 | `LOG10(1000)` -> `3` |
| `EXP` | `(value)` | e^value | `EXP(1)` -> `2.718...` |
| `BUSHELS` | `(lbs)` | lbs / 56 | `BUSHELS(20000)` -> `357.14` |
| `METRIC_TONS` | `(lbs)` | lbs / 2205 | `METRIC_TONS(20000)` -> `9.07` |
| `GALLONS_TO_LITERS` | `(gallons)` | gal * 3.78541 | `GALLONS_TO_LITERS(100)` -> `378.54` |
| `LITERS_TO_GALLONS` | `(liters)` | L / 3.78541 | `LITERS_TO_GALLONS(378.54)` -> `100` |
| `KG_TO_LBS` | `(kg)` | kg * 2.20462 | `KG_TO_LBS(100)` -> `220.46` |
| `LBS_TO_KG` | `(lbs)` | lbs / 2.20462 | `LBS_TO_KG(220.46)` -> `100` |

## Related Pages

- [Expression Syntax](../expression-syntax.md)
- [Variable Reference](../variables/README.md)
- [Common Patterns](../common-patterns.md)

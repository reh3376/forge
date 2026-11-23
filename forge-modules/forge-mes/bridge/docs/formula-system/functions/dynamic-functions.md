# Dynamic Functions

Dynamic functions are user-created functions loaded from the `FormulaFunction` database table at application startup. They extend the built-in function set without code changes, allowing production teams to define custom calculations and unit conversions.

## Overview

Dynamic functions are registered during `ExpressionEngineService.onModuleInit()`. The engine queries all active `FormulaFunction` records with `implementationType` of `EXPRESSION` or `UNIT_CONVERSION`, then registers them on the parser so they can be called in any formula.

To refresh dynamic functions after database changes, call `registerDynamicFunctions()` on the expression engine service.

## EXPRESSION Functions

Expression-based functions are backed by a formula string that is itself evaluated by the parser. They enable reusable, named calculations.

### How They Work

1. A `FormulaFunction` record is created with `implementationType = 'EXPRESSION'` and an `expression` field.
2. On registration, the expression is pre-parsed.
3. The function accepts up to three arguments: `x`, `y`, and `z`.
4. When called, the expression is evaluated with `{ x, y, z }` as the variable context.

### Database Schema

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Function name (used in formulas) |
| `implementationType` | Enum | `EXPRESSION` |
| `expression` | String | The formula expression using `x`, `y`, `z` |
| `description` | String? | Human-readable description |
| `isActive` | Boolean | Whether the function is registered |

### Example: Custom Grain Adjustment

Define a function `GRAIN_ADJ` that applies a moisture-correction factor:

| Field | Value |
|-------|-------|
| `name` | `GRAIN_ADJ` |
| `expression` | `x * (1 - y / 100)` |
| `description` | Adjusts grain weight (x) by moisture percentage (y) |

**Usage in formulas:**

```
GRAIN_ADJ(grainLoad, 12)
```

Evaluates as `20000 * (1 - 12 / 100)` = `20000 * 0.88` = **17600** (dry weight of grain at 12% moisture).

### Example: Proof Gallons Calculation

Define `PG_CALC` for proof gallon estimation:

| Field | Value |
|-------|-------|
| `name` | `PG_CALC` |
| `expression` | `x * y / 100` |
| `description` | Calculates proof gallons from wine gallons (x) and proof (y) |

**Usage:**

```
PG_CALC(500, 130)
```

Evaluates as `500 * 130 / 100` = **650** proof gallons.

### Multi-argument Functions

Dynamic expression functions support up to three arguments (`x`, `y`, `z`). Unused arguments default to `0`.

```
// Three-arg function: weighted average
// expression: (x * y + (1 - y) * z)
WEIGHTED_AVG(grainLoad, 0.7, 15000)
```

Evaluates as `(20000 * 0.7 + (1 - 0.7) * 15000)` = `14000 + 4500` = **18500**

## UNIT_CONVERSION Functions

Unit conversion functions are derived from `UnitOfMeasure` records linked via `fromUnit` and `toUnit` relationships. The conversion rate is calculated automatically from the units' `conversions` JSON field.

### How They Work

1. A `FormulaFunction` record is created with `implementationType = 'UNIT_CONVERSION'`, plus `fromUnitId` and `toUnitId`.
2. On registration, the engine resolves the conversion rate by:
   - Checking `fromUnit.conversions` for a direct mapping to the target unit (by id, name, or abbreviation).
   - If not found, checking `toUnit.conversions` for an inverse mapping.
3. The resulting function multiplies its input by the resolved rate.

### Database Schema

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Function name (used in formulas) |
| `implementationType` | Enum | `UNIT_CONVERSION` |
| `fromUnitId` | String | Source unit of measure ID |
| `toUnitId` | String | Target unit of measure ID |
| `isActive` | Boolean | Whether the function is registered |

### Rate Resolution

The conversion rate resolution follows this priority:

1. `fromUnit.conversions[toUnit.id]` -- direct by ID
2. `fromUnit.conversions[toUnit.name]` -- direct by name
3. `fromUnit.conversions[toUnit.abbreviation]` -- direct by abbreviation
4. `1 / toUnit.conversions[fromUnit.id]` -- inverse by ID
5. `1 / toUnit.conversions[fromUnit.name]` -- inverse by name
6. `1 / toUnit.conversions[fromUnit.abbreviation]` -- inverse by abbreviation

If no rate can be resolved, a warning is logged and the function is not registered.

### Example: Barrels to Gallons

Given units where "barrel" has `conversions: { "gallon": 53.07 }`:

| Field | Value |
|-------|-------|
| `name` | `BARRELS_TO_GAL` |
| `fromUnitId` | (barrel unit ID) |
| `toUnitId` | (gallon unit ID) |

**Usage:**

```
BARRELS_TO_GAL(10)
```

Evaluates as `10 * 53.07` = **530.7** gallons.

## Managing Dynamic Functions

### Adding a New Function

1. Insert a row into the `FormulaFunction` table with the appropriate fields.
2. Restart the application, or call `registerDynamicFunctions()` to reload without restart.
3. The function is immediately available in all formulas.

### Deactivating a Function

Set `isActive = false` on the record. On the next registration cycle, the function will not be loaded. Existing formulas referencing it will fail with an "unknown function" error.

### Naming Conventions

- Use **UPPER_SNAKE_CASE** for function names (e.g., `GRAIN_ADJ`, `PG_CALC`).
- Avoid names that conflict with built-in functions (`IF`, `ROUND`, `BUSHELS`, etc.).
- Use descriptive names that indicate the operation and units.

## Limitations

- Expression functions support a maximum of **3 arguments** (`x`, `y`, `z`).
- Dynamic functions cannot reference other dynamic functions (no recursive registration).
- Unit conversion functions are single-argument (multiply by rate).
- If conversion rate resolution fails, the function is silently skipped (check logs for warnings).

## Related Pages

- [Function Reference Index](./README.md) -- All available functions
- [Conversion Functions](./conversion-functions.md) -- Built-in unit conversions
- [Expression Syntax](../expression-syntax.md) -- How expressions are parsed
- [Troubleshooting](../troubleshooting.md) -- Debugging dynamic function issues
